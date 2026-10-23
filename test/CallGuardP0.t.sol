// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";
import { PayPerCallV8 } from "../contracts/PayPerCallV8.sol";
import { SLAKeeper } from "../contracts/SLAKeeper.sol";
import { DisputeV2 } from "../contracts/DisputeV2.sol";
import { IPayPerCallV8 } from "../contracts/interfaces/IPayPerCallV8.sol";
import { IServiceRegistryV8 } from "../contracts/interfaces/IServiceRegistryV8.sol";
import { MockUSDC } from "./helpers/MockUSDC.sol";

/// @notice P0 acceptance flow across registry, escrow, keeper, and dispute.
contract CallGuardP0Test is Test {
    MockUSDC internal usdc;
    ServiceRegistryV8 internal registry;
    PayPerCallV8 internal payPerCall;
    SLAKeeper internal keeper;
    DisputeV2 internal dispute;

    address internal admin = address(0xA11CE);
    address internal provider = address(0xB0B);
    address internal caller = address(0xC0FFEE);
    address internal crank = address(0xCAFE);
    address internal arbiter = address(0xA4B);
    address internal appealArbiter = address(0xA4B2);
    address internal treasury = address(0x7EA5);

    uint256 internal signerPk = 0xA11CE_BEEF;
    address internal signer;

    uint256 internal constant MIN_STAKE = 10e6;
    uint256 internal constant STAKE = 100e6;
    uint256 internal constant PRICE = 1e6;
    uint256 internal constant BOND = 2e6;
    uint256 internal constant APPEAL_BOND = 3e6;
    uint16 internal constant SLASH_BPS = 2_000;
    uint16 internal constant DISPUTE_SLASH_BPS = 1_000;
    uint32 internal constant DISPUTE_WINDOW = 1 days;
    uint32 internal constant APPEAL_WINDOW = 1 days;
    uint32 internal constant RESOLUTION_WINDOW = 2 days;
    uint32 internal constant V1_MAX_RESPONSE = 3 days;
    uint32 internal constant V2_MAX_RESPONSE = 4 days;
    bytes32 internal constant TERMS_V1_HASH = keccak256("terms-v1");
    bytes32 internal constant TERMS_V2_HASH = keccak256("terms-v2");

    uint256 internal providerId;

    function setUp() public {
        signer = vm.addr(signerPk);

        vm.startPrank(admin);
        usdc = new MockUSDC();
        registry = new ServiceRegistryV8(IERC20(address(usdc)), MIN_STAKE, admin);
        payPerCall = new PayPerCallV8(IERC20(address(usdc)), registry);
        keeper = new SLAKeeper(payPerCall, IERC20(address(usdc)));
        dispute = new DisputeV2(
            IERC20(address(usdc)),
            registry,
            payPerCall,
            arbiter,
            appealArbiter,
            treasury,
            BOND,
            APPEAL_BOND,
            DISPUTE_WINDOW,
            APPEAL_WINDOW,
            RESOLUTION_WINDOW,
            DISPUTE_SLASH_BPS
        );
        registry.setPayPerCall(address(payPerCall));
        registry.authorizeSlasher(address(dispute));
        vm.stopPrank();

        usdc.mint(provider, 1_000e6);
        usdc.mint(caller, 1_000e6);

        vm.prank(provider);
        usdc.approve(address(registry), type(uint256).max);
        vm.prank(caller);
        usdc.approve(address(payPerCall), type(uint256).max);
        vm.prank(caller);
        usdc.approve(address(dispute), type(uint256).max);
        vm.prank(provider);
        usdc.approve(address(dispute), type(uint256).max);

        vm.prank(provider);
        providerId = registry.register(
            signer,
            STAKE,
            PRICE,
            V1_MAX_RESPONSE,
            SLASH_BPS,
            9_950,
            0,
            "https://api.example",
            TERMS_V1_HASH,
            "ipfs://terms-v1"
        );
    }

    // ---------------------------------------------------------------------
    // P0-6: keeper claims a timeout without caller action
    // ---------------------------------------------------------------------

    function test_p0_keeperClaimsTimeoutAndCallerWithdraws() public {
        uint256 callerBefore = usdc.balanceOf(caller);

        vm.prank(caller);
        bytes32 callId = payPerCall.callService(providerId, keccak256("request"));

        skip(V1_MAX_RESPONSE + payPerCall.SUBMIT_GRACE() + 1);
        assertTrue(keeper.isClaimable(callId));

        vm.prank(crank);
        keeper.claim(callId);

        IPayPerCallV8.Call memory call_ = payPerCall.getCall(callId);
        assertEq(uint256(call_.status), uint256(IPayPerCallV8.CallStatus.Slashed));
        assertEq(payPerCall.claimable(caller), 20e6);
        assertEq(keeper.bountyClaimable(crank), 1e6);
        assertEq(registry.getProvider(providerId).stake, 80e6);
        assertEq(registry.getProvider(providerId).pendingCalls, 0);
        assertEq(registry.getProvider(providerId).slashedCalls, 1);

        vm.prank(caller);
        payPerCall.claim();

        vm.prank(crank);
        keeper.withdrawBounty();

        // Caller paid 1 USDC, then recovered the 1 USDC escrow plus 19 USDC
        // of the 20 USDC slash.
        assertEq(usdc.balanceOf(caller), callerBefore + 19e6);
        assertEq(usdc.balanceOf(crank), 1e6);
    }

    function test_p0_keeperBatchClaimsTwoTimeouts() public {
        vm.prank(caller);
        bytes32 first = payPerCall.callService(providerId, keccak256("request-1"));
        vm.prank(caller);
        bytes32 second = payPerCall.callService(providerId, keccak256("request-2"));

        skip(V1_MAX_RESPONSE + payPerCall.SUBMIT_GRACE() + 1);

        bytes32[] memory ids = new bytes32[](2);
        ids[0] = first;
        ids[1] = second;
        vm.prank(crank);
        keeper.claimBatch(ids);

        assertEq(payPerCall.claimable(caller), 36.2e6);
        assertEq(keeper.bountyClaimable(crank), 1.8e6);
        assertEq(registry.getProvider(providerId).stake, 64e6);
    }

    // ---------------------------------------------------------------------
    // P0-2 / P0-5: a call keeps the terms version it was opened under
    // ---------------------------------------------------------------------

    function test_p0_callSnapshotsTermsAcrossTimelockedUpdate() public {
        vm.prank(caller);
        bytes32 oldCall = payPerCall.callService(providerId, keccak256("old-request"));

        IPayPerCallV8.Call memory beforeUpdate = payPerCall.getCall(oldCall);
        assertEq(beforeUpdate.termsVersion, 1);
        assertEq(beforeUpdate.termsHash, TERMS_V1_HASH);
        assertEq(beforeUpdate.deadline, beforeUpdate.startedAt + V1_MAX_RESPONSE);

        IServiceRegistryV8.TermsInput memory next = IServiceRegistryV8.TermsInput({
            maxResponseTime: V2_MAX_RESPONSE,
            slashBps: 5_000,
            availabilityTargetBps: 9_900,
            termsHash: TERMS_V2_HASH,
            termsUri: "ipfs://terms-v2"
        });

        vm.prank(provider);
        registry.proposeTermsUpdate(providerId, next);

        vm.expectRevert(ServiceRegistryV8.TermsTimelockNotElapsed.selector);
        vm.prank(provider);
        registry.executeTermsUpdate(providerId);

        skip(registry.TERMS_TIMELOCK() + 1);

        vm.prank(provider);
        registry.executeTermsUpdate(providerId);

        IPayPerCallV8.Call memory afterUpdate = payPerCall.getCall(oldCall);
        assertEq(afterUpdate.termsVersion, 1);
        assertEq(afterUpdate.termsHash, TERMS_V1_HASH);
        assertEq(afterUpdate.deadline, afterUpdate.startedAt + V1_MAX_RESPONSE);

        // The old call remains closable under v1 even though the provider has
        // moved to v2.
        bytes32 responseHash = keccak256("response");
        uint64 respondedAt = uint64(block.timestamp);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            signerPk,
            payPerCall.hashReceipt(
                IPayPerCallV8.Receipt({
                    callId: oldCall,
                    responseHash: responseHash,
                    respondedAt: respondedAt,
                    termsVersion: 1
                })
            )
        );
        payPerCall.submitReceipt(oldCall, responseHash, respondedAt, 1, abi.encodePacked(r, s, v));

        vm.prank(caller);
        bytes32 newCall = payPerCall.callService(providerId, keccak256("new-request"));
        IPayPerCallV8.Call memory fresh = payPerCall.getCall(newCall);
        assertEq(fresh.termsVersion, 2);
        assertEq(fresh.termsHash, TERMS_V2_HASH);
        assertEq(fresh.deadline, fresh.startedAt + V2_MAX_RESPONSE);
    }

    // ---------------------------------------------------------------------
    // P0-3: late receipts cannot be used to escape a timeout
    // ---------------------------------------------------------------------

    function test_p0_receiptAfterGraceRevertsThenKeeperClaims() public {
        vm.prank(caller);
        bytes32 callId = payPerCall.callService(providerId, keccak256("request"));
        IPayPerCallV8.Call memory call_ = payPerCall.getCall(callId);

        skip(uint256(call_.deadline) + payPerCall.SUBMIT_GRACE() + 1);

        bytes32 responseHash = keccak256("late-response");
        uint64 respondedAt = call_.deadline;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            signerPk,
            payPerCall.hashReceipt(
                IPayPerCallV8.Receipt({
                    callId: callId,
                    responseHash: responseHash,
                    respondedAt: respondedAt,
                    termsVersion: 1
                })
            )
        );

        vm.expectRevert(PayPerCallV8.DeadlineExceeded.selector);
        payPerCall.submitReceipt(callId, responseHash, respondedAt, 1, abi.encodePacked(r, s, v));

        keeper.claim(callId);
        assertEq(uint256(payPerCall.getCall(callId).status), uint256(IPayPerCallV8.CallStatus.Slashed));
    }

    function test_p0_receiptWithLateRespondedAtReverts() public {
        vm.prank(caller);
        bytes32 callId = payPerCall.callService(providerId, keccak256("request"));
        IPayPerCallV8.Call memory call_ = payPerCall.getCall(callId);

        uint64 respondedAt = call_.deadline + 1;
        bytes32 responseHash = keccak256("late-response");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            signerPk,
            payPerCall.hashReceipt(
                IPayPerCallV8.Receipt({
                    callId: callId,
                    responseHash: responseHash,
                    respondedAt: respondedAt,
                    termsVersion: 1
                })
            )
        );

        vm.expectRevert(PayPerCallV8.RespondedAfterDeadline.selector);
        payPerCall.submitReceipt(callId, responseHash, respondedAt, 1, abi.encodePacked(r, s, v));
    }

    // ---------------------------------------------------------------------
    // P0-4: stake top-up restores the slash capacity
    // ---------------------------------------------------------------------

    function test_p0_stakeTopUpRestoresSlashCapacity() public {
        vm.prank(caller);
        bytes32 first = payPerCall.callService(providerId, keccak256("request-1"));
        skip(V1_MAX_RESPONSE + payPerCall.SUBMIT_GRACE() + 1);
        keeper.claim(first);

        assertEq(registry.getProvider(providerId).stake, 80e6);

        vm.prank(provider);
        registry.addStake(providerId, 20e6);

        assertEq(registry.getProvider(providerId).stake, 100e6);

        vm.prank(caller);
        bytes32 second = payPerCall.callService(providerId, keccak256("request-2"));
        skip(V1_MAX_RESPONSE + payPerCall.SUBMIT_GRACE() + 1);
        keeper.claim(second);

        assertEq(registry.getProvider(providerId).stake, 80e6);
    }

    // ---------------------------------------------------------------------
    // P0-7 / P0-8: dispute window uses completedAt and appeal can reverse
    // ---------------------------------------------------------------------

    function test_p0_disputeUsesCompletedAtAndAppealReverses() public {
        vm.prank(caller);
        bytes32 callId = payPerCall.callService(providerId, keccak256("request"));

        bytes32 responseHash = keccak256("response");
        uint64 respondedAt = uint64(block.timestamp);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            signerPk,
            payPerCall.hashReceipt(
                IPayPerCallV8.Receipt({
                    callId: callId,
                    responseHash: responseHash,
                    respondedAt: respondedAt,
                    termsVersion: 1
                })
            )
        );
        payPerCall.submitReceipt(callId, responseHash, respondedAt, 1, abi.encodePacked(r, s, v));

        IPayPerCallV8.Call memory completed = payPerCall.getCall(callId);
        assertTrue(completed.completedAt > 0);

        vm.prank(caller);
        uint256 disputeId = dispute.openDispute(callId, providerId, "ipfs://evidence");

        vm.prank(arbiter);
        dispute.resolve(disputeId, true);

        assertEq(dispute.heldSlash(disputeId), 10e6);
        assertEq(registry.getProvider(providerId).stake, 90e6);

        vm.prank(provider);
        dispute.appeal(disputeId, "ipfs://appeal");

        uint256 providerBefore = usdc.balanceOf(provider);
        vm.prank(appealArbiter);
        dispute.resolveAppeal(disputeId, false);

        assertEq(usdc.balanceOf(provider), providerBefore + 10e6 + APPEAL_BOND);
        assertEq(dispute.heldSlash(disputeId), 0);
        assertTrue(dispute.settled(disputeId));
    }
}

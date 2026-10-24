// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";
import { PayPerCallV8 } from "../contracts/PayPerCallV8.sol";
import { DisputeV2 } from "../contracts/DisputeV2.sol";
import { IPayPerCallV8 } from "../contracts/interfaces/IPayPerCallV8.sol";
import { IDisputeV2 } from "../contracts/interfaces/IDisputeV2.sol";
import { MockUSDC } from "./helpers/MockUSDC.sol";

contract DisputeV2Test is Test {
    MockUSDC internal usdc;
    ServiceRegistryV8 internal registry;
    PayPerCallV8 internal payPerCall;
    DisputeV2 internal dispute;

    address internal admin = address(0xA11CE);
    address internal provider = address(0xB0B);
    address internal caller = address(0xC0FFEE);
    address internal other = address(0xBAD);
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
    uint32 internal constant MAX_RESP = 30;
    uint16 internal constant SLASH_BPS = 2_000;
    uint16 internal constant DISPUTE_SLASH_BPS = 1_000;
    uint32 internal constant DISPUTE_WINDOW = 1 days;
    uint32 internal constant APPEAL_WINDOW = 1 days;
    uint32 internal constant RESOLUTION_WINDOW = 2 days;
    bytes32 internal constant TERMS_HASH = keccak256("terms-v1");

    uint256 internal providerId;

    function setUp() public {
        signer = vm.addr(signerPk);

        vm.startPrank(admin);
        usdc = new MockUSDC();
        registry = new ServiceRegistryV8(IERC20(address(usdc)), MIN_STAKE, admin);
        payPerCall = new PayPerCallV8(IERC20(address(usdc)), registry);
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
        usdc.mint(other, 1_000e6);

        vm.prank(provider);
        usdc.approve(address(registry), type(uint256).max);
        vm.prank(caller);
        usdc.approve(address(payPerCall), type(uint256).max);
        vm.prank(caller);
        usdc.approve(address(dispute), type(uint256).max);
        vm.prank(other);
        usdc.approve(address(dispute), type(uint256).max);
        vm.prank(provider);
        usdc.approve(address(dispute), type(uint256).max);

        vm.prank(provider);
        providerId = registry.register(
            signer,
            STAKE,
            PRICE,
            MAX_RESP,
            SLASH_BPS,
            9_950,
            0,
            "https://api.example",
            TERMS_HASH,
            "ipfs://terms-v1"
        );
    }

    // ---------------------------------------------------------------------
    // openDispute
    // ---------------------------------------------------------------------

    function test_openDispute_recordsCompletedCallAndBond() public {
        bytes32 callId = _completedCall();

        vm.prank(caller);
        uint256 id = dispute.openDispute(callId, providerId, "ipfs://evidence");

        IDisputeV2.DisputeRecord memory record = dispute.getDispute(id);
        assertEq(record.callId, callId);
        assertEq(record.caller, caller);
        assertEq(record.providerId, providerId);
        assertEq(record.bond, BOND);
        assertEq(uint256(record.status), uint256(IDisputeV2.Status.Pending));
        assertEq(record.evidenceUri, "ipfs://evidence");
        assertEq(dispute.disputeIdByCallId(callId), id);
    }

    function test_openDispute_rejectsPendingCall() public {
        vm.prank(caller);
        bytes32 callId = payPerCall.callService(providerId, keccak256("request"));

        vm.expectRevert(DisputeV2.CallNotCompleted.selector);
        vm.prank(caller);
        dispute.openDispute(callId, providerId, "");
    }

    function test_openDispute_rejectsSlashedCall() public {
        vm.prank(caller);
        bytes32 callId = payPerCall.callService(providerId, keccak256("request"));
        skip(MAX_RESP + payPerCall.SUBMIT_GRACE() + 1);
        payPerCall.claimTimeout(callId);

        vm.expectRevert(DisputeV2.CallNotCompleted.selector);
        vm.prank(caller);
        dispute.openDispute(callId, providerId, "");
    }

    function test_openDispute_rejectsUnknownCall() public {
        vm.expectRevert(DisputeV2.CallNotCompleted.selector);
        vm.prank(caller);
        dispute.openDispute(bytes32(uint256(0xDEAD)), providerId, "");
    }

    function test_openDispute_rejectsWrongCaller() public {
        bytes32 callId = _completedCall();

        vm.expectRevert(DisputeV2.NotCallCaller.selector);
        vm.prank(other);
        dispute.openDispute(callId, providerId, "");
    }

    function test_openDispute_rejectsProviderMismatch() public {
        bytes32 callId = _completedCall();

        vm.expectRevert(DisputeV2.ProviderMismatch.selector);
        vm.prank(caller);
        dispute.openDispute(callId, providerId + 1, "");
    }

    function test_openDispute_rejectsDuplicate() public {
        bytes32 callId = _completedCall();
        vm.prank(caller);
        dispute.openDispute(callId, providerId, "");

        vm.expectRevert(DisputeV2.AlreadyDisputed.selector);
        vm.prank(caller);
        dispute.openDispute(callId, providerId, "");
    }

    function test_openDispute_rejectsClosedWindow() public {
        bytes32 callId = _completedCall();
        skip(DISPUTE_WINDOW + 1);

        vm.expectRevert(DisputeV2.WindowClosed.selector);
        vm.prank(caller);
        dispute.openDispute(callId, providerId, "");
    }

    // ---------------------------------------------------------------------
    // resolve
    // ---------------------------------------------------------------------

    function test_resolve_upheld_returnsBondAndHoldsSlash() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        uint256 callerBefore = usdc.balanceOf(caller);
        vm.prank(arbiter);
        dispute.resolve(id, true);

        IDisputeV2.DisputeRecord memory record = dispute.getDispute(id);
        assertEq(uint256(record.status), uint256(IDisputeV2.Status.Upheld));
        assertEq(usdc.balanceOf(caller), callerBefore + BOND);
        assertEq(dispute.heldSlash(id), 10e6);
        assertEq(usdc.balanceOf(address(dispute)), 10e6);
        assertEq(registry.getProvider(providerId).stake, 90e6);
        assertFalse(dispute.settled(id));
    }

    function test_resolve_rejected_sendsBondToTreasury() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.prank(arbiter);
        dispute.resolve(id, false);

        IDisputeV2.DisputeRecord memory record = dispute.getDispute(id);
        assertEq(uint256(record.status), uint256(IDisputeV2.Status.Rejected));
        assertEq(usdc.balanceOf(treasury), treasuryBefore + BOND);
        assertEq(dispute.heldSlash(id), 0);
        assertFalse(dispute.settled(id));
    }

    function test_resolve_afterResolutionWindow_reverts() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);
        skip(RESOLUTION_WINDOW + 1);

        vm.expectRevert(DisputeV2.ResolutionWindowClosed.selector);
        vm.prank(arbiter);
        dispute.resolve(id, true);
    }

    function test_resolve_twice_reverts() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, true);

        vm.expectRevert(DisputeV2.AlreadyResolved.selector);
        vm.prank(arbiter);
        dispute.resolve(id, true);
    }

    function test_resolve_onlyArbiter() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.expectRevert(DisputeV2.NotArbiter.selector);
        vm.prank(caller);
        dispute.resolve(id, true);
    }

    // ---------------------------------------------------------------------
    // finalize
    // ---------------------------------------------------------------------

    function test_finalize_releasesHeldSlashToCaller() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, true);
        skip(APPEAL_WINDOW + 1);

        uint256 callerBefore = usdc.balanceOf(caller);
        dispute.finalize(id);

        assertEq(usdc.balanceOf(caller), callerBefore + 10e6);
        assertEq(dispute.heldSlash(id), 0);
        assertTrue(dispute.settled(id));
    }

    function test_finalize_rejectedMarksSettledWithoutTransfer() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, false);
        skip(APPEAL_WINDOW + 1);

        uint256 callerBefore = usdc.balanceOf(caller);
        dispute.finalize(id);

        assertEq(usdc.balanceOf(caller), callerBefore);
        assertTrue(dispute.settled(id));
    }

    function test_finalize_beforeAppealWindow_reverts() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, true);
        skip(APPEAL_WINDOW);

        vm.expectRevert(DisputeV2.AppealWindowOpen.selector);
        dispute.finalize(id);
    }

    function test_finalize_twice_reverts() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, false);
        skip(APPEAL_WINDOW + 1);
        dispute.finalize(id);

        vm.expectRevert(DisputeV2.AlreadySettled.selector);
        dispute.finalize(id);
    }

    // ---------------------------------------------------------------------
    // reclaimExpiredBond
    // ---------------------------------------------------------------------

    function test_reclaimExpiredBond_returnsBond() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);
        skip(RESOLUTION_WINDOW + 1);

        uint256 callerBefore = usdc.balanceOf(caller);
        vm.prank(caller);
        dispute.reclaimExpiredBond(id);

        IDisputeV2.DisputeRecord memory record = dispute.getDispute(id);
        assertEq(uint256(record.status), uint256(IDisputeV2.Status.Rejected));
        assertEq(usdc.balanceOf(caller), callerBefore + BOND);
        assertTrue(dispute.settled(id));

        vm.expectRevert(DisputeV2.AlreadySettled.selector);
        vm.prank(caller);
        dispute.reclaimExpiredBond(id);
    }

    function test_reclaimExpiredBond_beforeWindow_reverts() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.expectRevert(DisputeV2.ResolutionWindowOpen.selector);
        vm.prank(caller);
        dispute.reclaimExpiredBond(id);
    }

    // ---------------------------------------------------------------------
    // appeal
    // ---------------------------------------------------------------------

    function test_appeal_rejectedThenUpheldOnAppeal() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, false);

        vm.prank(caller);
        dispute.appeal(id, "ipfs://appeal");

        uint256 callerBefore = usdc.balanceOf(caller);
        vm.prank(appealArbiter);
        dispute.resolveAppeal(id, true);

        IDisputeV2.DisputeRecord memory record = dispute.getDispute(id);
        assertEq(uint256(record.status), uint256(IDisputeV2.Status.AppealUpheld));
        assertEq(usdc.balanceOf(caller), callerBefore + 10e6 + APPEAL_BOND);
        assertEq(registry.getProvider(providerId).stake, 90e6);
        assertEq(dispute.heldSlash(id), 0);
        assertTrue(dispute.settled(id));
    }

    function test_appeal_upheldThenReversedByProvider() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, true);

        vm.prank(provider);
        dispute.appeal(id, "ipfs://appeal");

        uint256 providerBefore = usdc.balanceOf(provider);
        vm.prank(appealArbiter);
        dispute.resolveAppeal(id, false);

        IDisputeV2.DisputeRecord memory record = dispute.getDispute(id);
        assertEq(uint256(record.status), uint256(IDisputeV2.Status.AppealRejected));
        assertEq(usdc.balanceOf(provider), providerBefore + 10e6 + APPEAL_BOND);
        assertEq(dispute.heldSlash(id), 0);
        assertEq(usdc.balanceOf(address(dispute)), 0);
        assertTrue(dispute.settled(id));
    }

    function test_appeal_onlyOnce() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, false);

        vm.prank(caller);
        dispute.appeal(id, "");

        vm.expectRevert(DisputeV2.AlreadyAppealed.selector);
        vm.prank(caller);
        dispute.appeal(id, "");
    }

    function test_appeal_afterWindow_reverts() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, false);
        skip(APPEAL_WINDOW + 1);

        vm.expectRevert(DisputeV2.AppealWindowClosed.selector);
        vm.prank(caller);
        dispute.appeal(id, "");
    }

    function test_appeal_onlyParty() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, false);

        vm.expectRevert(DisputeV2.NotParty.selector);
        vm.prank(other);
        dispute.appeal(id, "");
    }

    function test_resolveAppeal_onlyAppealArbiter() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, false);
        vm.prank(caller);
        dispute.appeal(id, "");

        vm.expectRevert(DisputeV2.NotAppealArbiter.selector);
        vm.prank(arbiter);
        dispute.resolveAppeal(id, true);
    }

    function test_resolveAppeal_withoutAppeal_reverts() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, false);

        vm.expectRevert(DisputeV2.NotAppealed.selector);
        vm.prank(appealArbiter);
        dispute.resolveAppeal(id, true);
    }

    // ---------------------------------------------------------------------
    // admin / views
    // ---------------------------------------------------------------------

    function test_constructor_rejectsInvalidBps() public {
        vm.expectRevert(DisputeV2.InvalidBps.selector);
        new DisputeV2(
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
            10_001
        );
    }

    function test_setArbiter_onlyArbiter() public {
        vm.prank(arbiter);
        dispute.setArbiter(address(0xA4B3));

        assertEq(dispute.arbiter(), address(0xA4B3));

        vm.expectRevert(DisputeV2.NotArbiter.selector);
        vm.prank(caller);
        dispute.setArbiter(caller);
    }

    function test_getDisputeByCallId_unknown_reverts() public {
        vm.expectRevert(DisputeV2.DisputeNotFound.selector);
        dispute.getDisputeByCallId(bytes32(uint256(0xDEAD)));
    }

    // ---------------------------------------------------------------------
    // Known gap
    // ---------------------------------------------------------------------

    /// The quality slash reads the stake at settlement time, and `unstake` only
    /// checks open calls. A provider can take the whole stake out between the
    /// receipt and the resolution, after which an upheld dispute holds nothing.
    /// This test pins the current behaviour so a fix has to change it.
    function test_gap_unstakeBeforeResolveSkipsQualitySlash() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(provider);
        registry.deactivate(providerId);
        skip(registry.UNSTAKE_COOLDOWN() + 1);
        vm.prank(provider);
        registry.unstake(providerId);
        assertEq(registry.getProvider(providerId).stake, 0);

        vm.prank(arbiter);
        dispute.resolve(id, true);

        assertEq(dispute.heldSlash(id), 0);
        assertEq(usdc.balanceOf(address(dispute)), 0);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _completedCall() internal returns (bytes32 callId) {
        vm.prank(caller);
        callId = payPerCall.callService(providerId, keccak256("request"));

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
    }

    function _openDispute(bytes32 callId) internal returns (uint256 id) {
        vm.prank(caller);
        id = dispute.openDispute(callId, providerId, "ipfs://evidence");
    }
}

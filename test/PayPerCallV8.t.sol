// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";
import { PayPerCallV8 } from "../contracts/PayPerCallV8.sol";
import { IPayPerCallV8 } from "../contracts/interfaces/IPayPerCallV8.sol";
import { MockUSDC3009 } from "./helpers/MockUSDC3009.sol";

contract PayPerCallV8Test is Test {
    MockUSDC3009 internal usdc;
    ServiceRegistryV8 internal registry;
    PayPerCallV8 internal payPerCall;

    address internal admin = address(0xA11CE);
    address internal provider = address(0xB0B);
    address internal caller = address(0xC0FFEE);
    address internal keeper = address(0xCAFE);
    address internal beneficiary = address(0xBEEF);

    uint256 internal signerPk = 0xA11CE_BEEF;
    address internal signerAddr;

    uint256 internal constant MIN_STAKE = 10e6;
    uint256 internal constant STAKE = 100e6;
    uint256 internal constant PRICE = 1e6;
    uint32 internal constant MAX_RESP = 30;
    uint16 internal constant SLASH_BPS = 2_000;
    uint16 internal constant AVAILABILITY_BPS = 9_950;
    bytes32 internal constant TERMS_HASH = keccak256("terms-v1");
    string internal constant TERMS_URI = "ipfs://terms-v1";

    uint256 internal providerId;

    function setUp() public {
        signerAddr = vm.addr(signerPk);

        vm.startPrank(admin);
        usdc = new MockUSDC3009();
        registry = new ServiceRegistryV8(IERC20(address(usdc)), MIN_STAKE, admin);
        payPerCall = new PayPerCallV8(IERC20(address(usdc)), registry);
        registry.setPayPerCall(address(payPerCall));
        vm.stopPrank();

        usdc.mint(provider, 1_000e6);
        usdc.mint(caller, 1_000e6);

        vm.prank(provider);
        usdc.approve(address(registry), type(uint256).max);
        vm.prank(caller);
        usdc.approve(address(payPerCall), type(uint256).max);

        vm.prank(provider);
        providerId = registry.register(
            signerAddr,
            STAKE,
            PRICE,
            MAX_RESP,
            SLASH_BPS,
            AVAILABILITY_BPS,
            0,
            "https://api.example",
            TERMS_HASH,
            TERMS_URI
        );
    }

    // ------------------------------------------------------------------
    // callService
    // ------------------------------------------------------------------

    function test_callService_escrowsAndSnapshotsTerms() public {
        bytes32 requestHash = keccak256("request-1");
        uint256 before = usdc.balanceOf(caller);

        vm.prank(caller);
        bytes32 callId = payPerCall.callService(providerId, requestHash);

        IPayPerCallV8.Call memory c = payPerCall.getCall(callId);
        assertEq(c.providerId, providerId);
        assertEq(c.caller, caller);
        assertEq(c.amount, PRICE);
        assertEq(c.startedAt, uint32(block.timestamp));
        assertEq(c.deadline, uint32(block.timestamp) + MAX_RESP);
        assertEq(c.completedAt, 0);
        assertEq(c.termsVersion, 1);
        assertEq(c.termsHash, TERMS_HASH);
        assertEq(c.requestHash, requestHash);
        assertEq(c.responseHash, bytes32(0));
        assertEq(uint8(c.status), uint8(IPayPerCallV8.CallStatus.Pending));

        assertEq(usdc.balanceOf(caller), before - PRICE);
        assertEq(usdc.balanceOf(address(payPerCall)), PRICE);
        assertEq(registry.getProvider(providerId).pendingCalls, 1);
        assertEq(payPerCall.openCallsPerCaller(providerId, caller), 1);
    }

    function test_callService_inactiveProvider_reverts() public {
        vm.prank(provider);
        registry.deactivate(providerId);

        vm.expectRevert(PayPerCallV8.ProviderNotActive.selector);
        vm.prank(caller);
        payPerCall.callService(providerId, keccak256("request"));
    }

    function test_callService_insufficientStake_reverts() public {
        vm.prank(address(payPerCall));
        registry.slash(providerId, 96e6, provider);

        vm.expectRevert(PayPerCallV8.InsufficientProviderStake.selector);
        vm.prank(caller);
        payPerCall.callService(providerId, keccak256("request"));
    }

    function test_callServiceFor_refundsBeneficiaryOnTimeout() public {
        vm.prank(caller);
        bytes32 callId = payPerCall.callServiceFor(providerId, keccak256("request"), beneficiary);

        assertEq(payPerCall.getCall(callId).caller, beneficiary);

        skip(MAX_RESP + payPerCall.SUBMIT_GRACE() + 1);
        vm.prank(keeper);
        payPerCall.claimTimeout(callId);

        assertEq(payPerCall.claimable(beneficiary), PRICE + 19e6);
        assertEq(payPerCall.claimable(caller), 0);
    }

    function test_callServiceWithAuthorization_settlesAndSnapshots() public {
        bytes32 requestHash = keccak256("x402-request");
        bytes32 authNonce = keccak256("auth-nonce");
        uint256 before = usdc.balanceOf(caller);

        bytes32 callId = payPerCall.callServiceWithAuthorization(
            providerId, requestHash, caller, 0, block.timestamp + 1 hours, authNonce, 0, bytes32(0), bytes32(0)
        );

        IPayPerCallV8.Call memory c = payPerCall.getCall(callId);
        assertEq(c.caller, caller);
        assertEq(c.termsVersion, 1);
        assertEq(c.termsHash, TERMS_HASH);
        assertEq(usdc.balanceOf(caller), before - PRICE);
        assertTrue(usdc.authorizationState(caller, authNonce));
    }

    function test_callServiceWithAuthorization_replay_reverts() public {
        bytes32 authNonce = keccak256("auth-nonce");
        payPerCall.callServiceWithAuthorization(
            providerId, keccak256("x402-request"), caller, 0, block.timestamp + 1 hours, authNonce, 0, bytes32(0), bytes32(0)
        );

        vm.expectRevert(PayPerCallV8.AuthorizationAlreadyUsed.selector);
        payPerCall.callServiceWithAuthorization(
            providerId, keccak256("x402-request-2"), caller, 0, block.timestamp + 1 hours, authNonce, 0, bytes32(0), bytes32(0)
        );
    }

    // ------------------------------------------------------------------
    // submitReceipt
    // ------------------------------------------------------------------

    function test_submitReceipt_completesAndCreditsProvider() public {
        bytes32 callId = _call();
        bytes32 responseHash = keccak256("response");
        uint64 respondedAt = uint64(block.timestamp);
        bytes memory sig = _sign(signerPk, callId, responseHash, respondedAt, 1);

        vm.prank(provider);
        payPerCall.submitReceipt(callId, responseHash, respondedAt, 1, sig);

        IPayPerCallV8.Call memory c = payPerCall.getCall(callId);
        assertEq(uint8(c.status), uint8(IPayPerCallV8.CallStatus.Completed));
        assertEq(c.responseHash, responseHash);
        assertEq(c.completedAt, uint32(block.timestamp));
        assertEq(payPerCall.claimable(provider), PRICE);
        assertEq(registry.getProvider(providerId).pendingCalls, 0);
        assertEq(payPerCall.openCallsPerCaller(providerId, caller), 0);
    }

    function test_submitReceipt_zeroResponseHash_reverts() public {
        bytes32 callId = _call();
        uint64 respondedAt = uint64(block.timestamp);
        bytes memory sig = _sign(signerPk, callId, bytes32(0), respondedAt, 1);

        vm.expectRevert(PayPerCallV8.ZeroResponseHash.selector);
        vm.prank(provider);
        payPerCall.submitReceipt(callId, bytes32(0), respondedAt, 1, sig);
    }

    function test_submitReceipt_respondedAfterDeadline_reverts() public {
        bytes32 callId = _call();
        bytes32 responseHash = keccak256("response");
        uint64 respondedAt = uint64(block.timestamp) + MAX_RESP + 1;
        bytes memory sig = _sign(signerPk, callId, responseHash, respondedAt, 1);

        vm.expectRevert(PayPerCallV8.RespondedAfterDeadline.selector);
        vm.prank(provider);
        payPerCall.submitReceipt(callId, responseHash, respondedAt, 1, sig);
    }

    function test_submitReceipt_afterGrace_reverts() public {
        bytes32 callId = _call();
        bytes32 responseHash = keccak256("response");
        uint64 respondedAt = uint64(block.timestamp) + MAX_RESP;
        bytes memory sig = _sign(signerPk, callId, responseHash, respondedAt, 1);

        skip(MAX_RESP + payPerCall.SUBMIT_GRACE() + 1);

        vm.expectRevert(PayPerCallV8.DeadlineExceeded.selector);
        vm.prank(provider);
        payPerCall.submitReceipt(callId, responseHash, respondedAt, 1, sig);
    }

    function test_submitReceipt_wrongTermsVersion_reverts() public {
        bytes32 callId = _call();
        bytes32 responseHash = keccak256("response");
        uint64 respondedAt = uint64(block.timestamp);
        bytes memory sig = _sign(signerPk, callId, responseHash, respondedAt, 2);

        vm.expectRevert(PayPerCallV8.TermsVersionMismatch.selector);
        vm.prank(provider);
        payPerCall.submitReceipt(callId, responseHash, respondedAt, 2, sig);
    }

    function test_submitReceipt_wrongSigner_reverts() public {
        bytes32 callId = _call();
        bytes32 responseHash = keccak256("response");
        uint64 respondedAt = uint64(block.timestamp);
        bytes memory sig = _sign(0xDEADBEEF, callId, responseHash, respondedAt, 1);

        vm.expectRevert(PayPerCallV8.InvalidSignature.selector);
        vm.prank(provider);
        payPerCall.submitReceipt(callId, responseHash, respondedAt, 1, sig);
    }

    function test_submitReceipt_replay_reverts() public {
        bytes32 callId = _call();
        bytes32 responseHash = keccak256("response");
        uint64 respondedAt = uint64(block.timestamp);
        bytes memory sig = _sign(signerPk, callId, responseHash, respondedAt, 1);

        vm.prank(provider);
        payPerCall.submitReceipt(callId, responseHash, respondedAt, 1, sig);

        vm.expectRevert(PayPerCallV8.ReceiptAlreadyUsed.selector);
        vm.prank(provider);
        payPerCall.submitReceipt(callId, responseHash, respondedAt, 1, sig);
    }

    // ------------------------------------------------------------------
    // claimTimeout + claim
    // ------------------------------------------------------------------

    function test_claimTimeout_refundsSlashesAndPaysBounty() public {
        bytes32 callId = _call();
        uint256 callerBefore = usdc.balanceOf(caller);

        skip(MAX_RESP + payPerCall.SUBMIT_GRACE() + 1);

        vm.prank(keeper);
        (uint256 refunded, uint256 slashed, uint256 bounty) = payPerCall.claimTimeout(callId);

        assertEq(refunded, PRICE);
        assertEq(slashed, 19e6);
        assertEq(bounty, 1e6);
        assertEq(payPerCall.claimable(caller), PRICE + 19e6);
        assertEq(payPerCall.claimable(keeper), 1e6);
        assertEq(registry.getProvider(providerId).stake, 80e6);
        assertEq(registry.getProvider(providerId).pendingCalls, 0);
        assertEq(payPerCall.openCallsPerCaller(providerId, caller), 0);

        IPayPerCallV8.Call memory c = payPerCall.getCall(callId);
        assertEq(uint8(c.status), uint8(IPayPerCallV8.CallStatus.Slashed));

        vm.prank(caller);
        payPerCall.claim();
        assertEq(usdc.balanceOf(caller), callerBefore + PRICE + 19e6);
    }

    function test_claimTimeout_beforeGrace_reverts() public {
        bytes32 callId = _call();

        skip(MAX_RESP + payPerCall.SUBMIT_GRACE());

        vm.expectRevert(PayPerCallV8.DeadlineNotReached.selector);
        vm.prank(keeper);
        payPerCall.claimTimeout(callId);
    }

    function test_claimTimeout_completedCall_reverts() public {
        bytes32 callId = _call();
        bytes32 responseHash = keccak256("response");
        uint64 respondedAt = uint64(block.timestamp);
        bytes memory sig = _sign(signerPk, callId, responseHash, respondedAt, 1);

        vm.prank(provider);
        payPerCall.submitReceipt(callId, responseHash, respondedAt, 1, sig);

        skip(MAX_RESP + payPerCall.SUBMIT_GRACE() + 1);

        vm.expectRevert(PayPerCallV8.InvalidStatus.selector);
        vm.prank(keeper);
        payPerCall.claimTimeout(callId);
    }

    function test_claimTimeout_twice_reverts() public {
        bytes32 callId = _call();
        skip(MAX_RESP + payPerCall.SUBMIT_GRACE() + 1);

        vm.prank(keeper);
        payPerCall.claimTimeout(callId);

        vm.expectRevert(PayPerCallV8.InvalidStatus.selector);
        vm.prank(keeper);
        payPerCall.claimTimeout(callId);
    }

    function test_claim_nothing_reverts() public {
        vm.expectRevert(PayPerCallV8.NothingToClaim.selector);
        vm.prank(caller);
        payPerCall.claim();
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _call() internal returns (bytes32 callId) {
        vm.prank(caller);
        callId = payPerCall.callService(providerId, keccak256("request"));
    }

    function _sign(uint256 pk, bytes32 callId, bytes32 responseHash, uint64 respondedAt, uint32 termsVersion)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = payPerCall.hashReceipt(
            IPayPerCallV8.Receipt({
                callId: callId,
                responseHash: responseHash,
                respondedAt: respondedAt,
                termsVersion: termsVersion
            })
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    // ------------------------------------------------------------------
    // A5 — concurrent call cap (per caller, per provider)
    // ------------------------------------------------------------------

    /// @dev `maxConcurrentCalls == 0` falls back to DEFAULT_MAX_CONCURRENT.
    function test_concurrency_defaultCap_reverts() public {
        uint32 cap = payPerCall.DEFAULT_MAX_CONCURRENT();

        for (uint256 i; i < cap; i++) {
            vm.prank(caller);
            payPerCall.callService(providerId, keccak256(abi.encode("req-default", i)));
        }
        assertEq(payPerCall.openCallsPerCaller(providerId, caller), cap);
        assertEq(registry.getProvider(providerId).pendingCalls, cap);

        vm.expectRevert(PayPerCallV8.TooManyConcurrentCalls.selector);
        vm.prank(caller);
        payPerCall.callService(providerId, keccak256("req-default-over"));
    }

    /// @dev A provider-declared cap replaces the default.
    function test_concurrency_customCap_reverts() public {
        uint256 id = _registerSecondProvider(3);

        for (uint256 i; i < 3; i++) {
            vm.prank(caller);
            payPerCall.callService(id, keccak256(abi.encode("req-custom", i)));
        }

        vm.expectRevert(PayPerCallV8.TooManyConcurrentCalls.selector);
        vm.prank(caller);
        payPerCall.callService(id, keccak256("req-custom-over"));
    }

    /// @dev The cap is per caller: one caller hitting the limit does not block another.
    function test_concurrency_isPerCaller() public {
        uint32 cap = payPerCall.DEFAULT_MAX_CONCURRENT();
        address other = address(0xC0FFEE2);
        usdc.mint(other, 100e6);
        vm.prank(other);
        usdc.approve(address(payPerCall), type(uint256).max);

        for (uint256 i; i < cap; i++) {
            vm.prank(caller);
            payPerCall.callService(providerId, keccak256(abi.encode("req-caller-a", i)));
        }

        vm.prank(other);
        bytes32 callId = payPerCall.callService(providerId, keccak256("req-caller-b"));

        assertEq(payPerCall.openCallsPerCaller(providerId, other), 1);
        assertTrue(callId != bytes32(0));
    }

    /// @dev `callServiceFor` spends the beneficiary's budget, not the payer's.
    function test_concurrency_countsAgainstBeneficiary() public {
        uint32 cap = payPerCall.DEFAULT_MAX_CONCURRENT();

        for (uint256 i; i < cap; i++) {
            vm.prank(caller);
            payPerCall.callServiceFor(providerId, keccak256(abi.encode("req-beneficiary", i)), beneficiary);
        }

        assertEq(payPerCall.openCallsPerCaller(providerId, caller), 0);
        assertEq(payPerCall.openCallsPerCaller(providerId, beneficiary), cap);

        vm.expectRevert(PayPerCallV8.TooManyConcurrentCalls.selector);
        vm.prank(caller);
        payPerCall.callServiceFor(providerId, keccak256("req-beneficiary-over"), beneficiary);
    }

    /// @dev A completed call frees its slot immediately.
    function test_concurrency_slotFreedAfterReceipt() public {
        uint32 cap = payPerCall.DEFAULT_MAX_CONCURRENT();

        bytes32 firstCallId;
        for (uint256 i; i < cap; i++) {
            vm.prank(caller);
            bytes32 callId = payPerCall.callService(providerId, keccak256(abi.encode("req-slot", i)));
            if (i == 0) firstCallId = callId;
        }

        vm.expectRevert(PayPerCallV8.TooManyConcurrentCalls.selector);
        vm.prank(caller);
        payPerCall.callService(providerId, keccak256("req-slot-over"));

        bytes32 responseHash = keccak256("resp-slot");
        bytes memory sig = _sign(signerPk, firstCallId, responseHash, uint64(block.timestamp), 1);
        payPerCall.submitReceipt(firstCallId, responseHash, uint64(block.timestamp), 1, sig);

        assertEq(payPerCall.openCallsPerCaller(providerId, caller), cap - 1);

        vm.prank(caller);
        payPerCall.callService(providerId, keccak256("req-slot-after-receipt"));
    }

    /// @dev A timed-out call also frees its slot.
    function test_concurrency_slotFreedAfterTimeout() public {
        uint32 cap = payPerCall.DEFAULT_MAX_CONCURRENT();

        bytes32 firstCallId;
        for (uint256 i; i < cap; i++) {
            vm.prank(caller);
            bytes32 callId = payPerCall.callService(providerId, keccak256(abi.encode("req-timeout", i)));
            if (i == 0) firstCallId = callId;
        }

        vm.warp(block.timestamp + MAX_RESP + payPerCall.SUBMIT_GRACE() + 1);
        payPerCall.claimTimeout(firstCallId);

        assertEq(payPerCall.openCallsPerCaller(providerId, caller), cap - 1);

        vm.prank(caller);
        payPerCall.callService(providerId, keccak256("req-timeout-after-claim"));
    }

    /// @dev Second provider, used by the custom-cap test. The registry allows one
    ///      provider per owner, so it needs its own owner and signer.
    function _registerSecondProvider(uint32 maxConcurrentCalls) internal returns (uint256 id) {
        address owner = address(0xB0B2);
        usdc.mint(owner, STAKE);
        vm.startPrank(owner);
        usdc.approve(address(registry), STAKE);
        id = registry.register(
            address(0x516E2),
            STAKE,
            PRICE,
            MAX_RESP,
            SLASH_BPS,
            AVAILABILITY_BPS,
            maxConcurrentCalls,
            "https://api2.example",
            TERMS_HASH,
            TERMS_URI
        );
        vm.stopPrank();
    }
}

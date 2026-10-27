// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";
import { PayPerCallV8 } from "../contracts/PayPerCallV8.sol";
import { DisputeV4, ISLAEvidenceV2 } from "../contracts/DisputeV4.sol";
import { DisputeV3 } from "../contracts/DisputeV3.sol";
import { SLAEvidenceRegistryV2, IEvidenceVerifier } from "../contracts/SLAEvidenceRegistryV2.sol";
import { IPayPerCallV8 } from "../contracts/interfaces/IPayPerCallV8.sol";
import { IDisputeV2 } from "../contracts/interfaces/IDisputeV2.sol";
import { MockUSDC } from "./helpers/MockUSDC.sol";

/// @notice Minimal on-chain proof verifier stand-in; the registry only reads its
///         address when wiring and calls `verify` when anchoring.
contract MockProofVerifier is IEvidenceVerifier {
    function verify(bytes calldata, bytes32, bytes32, bytes32) external pure returns (bool) {
        return true;
    }
}

contract DisputeV4Test is Test {
    MockUSDC internal usdc;
    ServiceRegistryV8 internal registry;
    PayPerCallV8 internal payPerCall;
    SLAEvidenceRegistryV2 internal evidence;
    DisputeV4 internal dispute;

    address internal admin = address(0xA11CE);
    address internal provider = address(0xB0B);
    address internal caller = address(0xC0FFEE);
    address internal other = address(0xBAD);
    address internal arbiter = address(0xA4B);
    address internal appealArbiter = address(0xA4B2);
    address internal treasury = address(0x7EA5);

    uint256 internal signerPk = 0xA11CE_BEEF;
    address internal signer;

    address internal attestor;
    uint256 internal attestorKey;

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

    bytes32 internal constant RESPONSE_HASH = keccak256("response");
    bytes32 internal constant OTHER_RESPONSE_HASH = keccak256("wrong-response");
    bytes32 internal constant CLAIM_HASH = keccak256("claim-1");
    bytes32 internal constant STATEMENT_HASH = keccak256("statement-1");
    bytes32 internal constant ASSUMPTION_HASH = keccak256("assumption-1");
    bytes32 internal constant ZK_EXECUTION = keccak256("zk-execution");
    bytes32 internal constant TEE_ATTESTATION = keccak256("tee-attestation");
    bytes32 internal constant NO_VERIFIER_KIND = keccak256("no-verifier");

    uint256 internal providerId;
    DisputeV3 internal legacyDispute;
    address internal adapter;

    function setUp() public {
        signer = vm.addr(signerPk);
        (attestor, attestorKey) = makeAddrAndKey("attestor");

        vm.startPrank(admin);
        usdc = new MockUSDC();
        registry = new ServiceRegistryV8(IERC20(address(usdc)), MIN_STAKE, admin);
        payPerCall = new PayPerCallV8(IERC20(address(usdc)), registry);
        evidence = new SLAEvidenceRegistryV2(admin);
        legacyDispute = new DisputeV3(
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
        dispute = new DisputeV4(
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
            DISPUTE_SLASH_BPS,
            ISLAEvidenceV2(address(evidence)),
            legacyDispute
        );
        adapter = address(new MockProofVerifier());
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

        vm.expectRevert(DisputeV4.CallNotCompleted.selector);
        vm.prank(caller);
        dispute.openDispute(callId, providerId, "");
    }

    function test_openDispute_rejectsSlashedCall() public {
        vm.prank(caller);
        bytes32 callId = payPerCall.callService(providerId, keccak256("request"));
        skip(MAX_RESP + payPerCall.SUBMIT_GRACE() + 1);
        payPerCall.claimTimeout(callId);

        vm.expectRevert(DisputeV4.CallNotCompleted.selector);
        vm.prank(caller);
        dispute.openDispute(callId, providerId, "");
    }

    function test_openDispute_rejectsUnknownCall() public {
        vm.expectRevert(DisputeV4.CallNotCompleted.selector);
        vm.prank(caller);
        dispute.openDispute(bytes32(uint256(0xDEAD)), providerId, "");
    }

    function test_openDispute_rejectsWrongCaller() public {
        bytes32 callId = _completedCall();

        vm.expectRevert(DisputeV4.NotCallCaller.selector);
        vm.prank(other);
        dispute.openDispute(callId, providerId, "");
    }

    function test_openDispute_rejectsProviderMismatch() public {
        bytes32 callId = _completedCall();

        vm.expectRevert(DisputeV4.ProviderMismatch.selector);
        vm.prank(caller);
        dispute.openDispute(callId, providerId + 1, "");
    }

    function test_openDispute_rejectsDuplicate() public {
        bytes32 callId = _completedCall();
        vm.prank(caller);
        dispute.openDispute(callId, providerId, "");

        vm.expectRevert(DisputeV4.AlreadyDisputed.selector);
        vm.prank(caller);
        dispute.openDispute(callId, providerId, "");
    }

    function test_openDispute_rejectsClosedWindow() public {
        bytes32 callId = _completedCall();
        skip(DISPUTE_WINDOW + 1);

        vm.expectRevert(DisputeV4.WindowClosed.selector);
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
        // The escrow stays held through the appeal window, so a reversal cannot
        // find an empty contract. It returns to the provider at finalize.
        assertEq(dispute.heldSlash(id), 10e6);
        assertFalse(dispute.settled(id));

        uint256 providerBefore = usdc.balanceOf(provider);
        skip(APPEAL_WINDOW + 1);
        dispute.finalize(id);

        assertEq(usdc.balanceOf(provider), providerBefore + 10e6);
        assertEq(dispute.heldSlash(id), 0);
        assertTrue(dispute.settled(id));
    }

    function test_resolve_afterResolutionWindow_reverts() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);
        skip(RESOLUTION_WINDOW + 1);

        vm.expectRevert(DisputeV4.ResolutionWindowClosed.selector);
        vm.prank(arbiter);
        dispute.resolve(id, true);
    }

    function test_resolve_twice_reverts() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, true);

        vm.expectRevert(DisputeV4.AlreadyResolved.selector);
        vm.prank(arbiter);
        dispute.resolve(id, true);
    }

    function test_resolve_onlyArbiter() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.expectRevert(DisputeV4.NotArbiter.selector);
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

        vm.expectRevert(DisputeV4.AppealWindowOpen.selector);
        dispute.finalize(id);
    }

    function test_finalize_twice_reverts() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, false);
        skip(APPEAL_WINDOW + 1);
        dispute.finalize(id);

        vm.expectRevert(DisputeV4.AlreadySettled.selector);
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

        vm.expectRevert(DisputeV4.AlreadySettled.selector);
        vm.prank(caller);
        dispute.reclaimExpiredBond(id);
    }

    function test_reclaimExpiredBond_beforeWindow_reverts() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.expectRevert(DisputeV4.ResolutionWindowOpen.selector);
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

        vm.expectRevert(DisputeV4.AlreadyAppealed.selector);
        vm.prank(caller);
        dispute.appeal(id, "");
    }

    function test_appeal_afterWindow_reverts() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, false);
        skip(APPEAL_WINDOW + 1);

        vm.expectRevert(DisputeV4.AppealWindowClosed.selector);
        vm.prank(caller);
        dispute.appeal(id, "");
    }

    function test_appeal_onlyParty() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, false);

        vm.expectRevert(DisputeV4.NotParty.selector);
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

        vm.expectRevert(DisputeV4.NotAppealArbiter.selector);
        vm.prank(arbiter);
        dispute.resolveAppeal(id, true);
    }

    function test_resolveAppeal_withoutAppeal_reverts() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        vm.prank(arbiter);
        dispute.resolve(id, false);

        vm.expectRevert(DisputeV4.NotAppealed.selector);
        vm.prank(appealArbiter);
        dispute.resolveAppeal(id, true);
    }

    // ---------------------------------------------------------------------
    // admin / views
    // ---------------------------------------------------------------------

    function test_constructor_rejectsInvalidBps() public {
        vm.expectRevert(DisputeV4.InvalidBps.selector);
        new DisputeV4(
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
            10_001,
            ISLAEvidenceV2(address(evidence)),
            legacyDispute
        );
    }

    function test_constructor_rejectsZeroEvidence() public {
        vm.expectRevert(DisputeV4.InvalidAddress.selector);
        new DisputeV4(
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
            DISPUTE_SLASH_BPS,
            ISLAEvidenceV2(address(0)),
            legacyDispute
        );
    }

    function test_constructor_rejectsZeroLegacyDispute() public {
        vm.expectRevert(DisputeV4.InvalidAddress.selector);
        new DisputeV4(
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
            DISPUTE_SLASH_BPS,
            ISLAEvidenceV2(address(evidence)),
            IDisputeV2(address(0))
        );
    }

    function test_setArbiter_onlyArbiter() public {
        vm.prank(arbiter);
        dispute.setArbiter(address(0xA4B3));

        assertEq(dispute.arbiter(), address(0xA4B3));

        vm.expectRevert(DisputeV4.NotArbiter.selector);
        vm.prank(caller);
        dispute.setArbiter(caller);
    }

    function test_getDisputeByCallId_unknown_reverts() public {
        vm.expectRevert(DisputeV4.DisputeNotFound.selector);
        dispute.getDisputeByCallId(bytes32(uint256(0xDEAD)));
    }

    // ---------------------------------------------------------------------
    // Stake-escape regression
    // ---------------------------------------------------------------------

    /// The quality slash reads the stake at settlement time, and `unstake` only
    /// checks open calls. A provider can take the whole stake out between the
    /// receipt and the resolution, after which an upheld dispute holds nothing.
    /// This test pins the current behaviour so a fix has to change it.
    /// The whole point of V3: the slash is escrowed at open, so a provider that
    /// deactivates and unstakes before the arbiter rules cannot remove the money
    /// an upheld dispute owes the caller.
    function test_unstakeBeforeResolve_stillPaysCaller() public {
        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        // 10e6 is already escrowed, 90e6 is still stake.
        assertEq(dispute.heldSlash(id), 10e6);
        assertEq(registry.getProvider(providerId).stake, 90e6);

        vm.prank(provider);
        registry.deactivate(providerId);
        skip(registry.UNSTAKE_COOLDOWN() + 1);
        vm.prank(provider);
        registry.unstake(providerId);
        assertEq(registry.getProvider(providerId).stake, 0);

        vm.prank(arbiter);
        dispute.resolve(id, true);

        uint256 callerBefore = usdc.balanceOf(caller);
        skip(APPEAL_WINDOW + 1);
        dispute.finalize(id);

        assertEq(usdc.balanceOf(caller), callerBefore + 10e6);
        assertEq(dispute.heldSlash(id), 0);
        assertTrue(dispute.settled(id));
    }

    // ---------------------------------------------------------------------
    // evidence snapshot at open
    // ---------------------------------------------------------------------

    function test_boundWhenProofModeAndResponseMatches() public {
        _wireProof(ZK_EXECUTION, true);
        bytes32[] memory kinds = new bytes32[](1);
        kinds[0] = ZK_EXECUTION;
        _setKinds(kinds);

        bytes32 callId = _completedCall();
        _anchorProof(callId, ZK_EXECUTION, RESPONSE_HASH);

        expectEmitEvidenceLinked(1, ZK_EXECUTION, CLAIM_HASH, 2, true);
        uint256 id = _openDispute(callId);

        DisputeV4.LinkedEvidence[] memory rows = dispute.evidenceOf(id);
        assertEq(rows.length, 1);
        assertTrue(rows[0].present);
        assertTrue(rows[0].bound);
        assertEq(uint8(rows[0].mode), uint8(SLAEvidenceRegistryV2.VerifierMode.Proof));
        assertEq(rows[0].kind, ZK_EXECUTION);
        assertEq(rows[0].claimHash, CLAIM_HASH);
        assertEq(rows[0].responseHash, RESPONSE_HASH);
        assertEq(rows[0].statementHash, STATEMENT_HASH);
        assertEq(rows[0].assumptionHash, ASSUMPTION_HASH);
        assertEq(rows[0].verifier, adapter);
        assertGt(rows[0].anchoredAt, 0);
    }

    function test_unboundWhenStoredResponseDiffers() public {
        _wireProof(ZK_EXECUTION, true);
        bytes32[] memory kinds = new bytes32[](1);
        kinds[0] = ZK_EXECUTION;
        _setKinds(kinds);

        bytes32 callId = _completedCall();
        _anchorProof(callId, ZK_EXECUTION, OTHER_RESPONSE_HASH);

        expectEmitEvidenceLinked(1, ZK_EXECUTION, CLAIM_HASH, 2, false);
        uint256 id = _openDispute(callId);

        DisputeV4.LinkedEvidence[] memory rows = dispute.evidenceOf(id);
        assertEq(rows.length, 1);
        assertTrue(rows[0].present);
        assertFalse(rows[0].bound);
        assertEq(uint8(rows[0].reason), uint8(DisputeV4.AbsentReason.WrongResponse));
        assertEq(uint8(rows[0].mode), uint8(SLAEvidenceRegistryV2.VerifierMode.Proof));
        assertEq(rows[0].claimHash, CLAIM_HASH);
        assertEq(rows[0].responseHash, OTHER_RESPONSE_HASH);
    }

    function test_unboundWhenModeIsSignature() public {
        // The registry records `bindsResponse = true` for signature wiring by
        // construction, yet a dispute never treats a signature claim as bound.
        _wireSignature(TEE_ATTESTATION);
        assertTrue(evidence.bindsResponse(TEE_ATTESTATION));
        bytes32[] memory kinds = new bytes32[](1);
        kinds[0] = TEE_ATTESTATION;
        _setKinds(kinds);

        bytes32 callId = _completedCall();
        _anchorSignature(callId, TEE_ATTESTATION, RESPONSE_HASH);

        expectEmitEvidenceLinked(1, TEE_ATTESTATION, CLAIM_HASH, 1, false);
        uint256 id = _openDispute(callId);

        DisputeV4.LinkedEvidence[] memory rows = dispute.evidenceOf(id);
        assertEq(rows.length, 1);
        assertTrue(rows[0].present);
        assertFalse(rows[0].bound);
        assertEq(uint8(rows[0].mode), uint8(SLAEvidenceRegistryV2.VerifierMode.Signature));
        assertEq(rows[0].claimHash, CLAIM_HASH);
        assertEq(rows[0].responseHash, RESPONSE_HASH);
    }

    function test_absentWhenKindHasNoVerifier() public {
        bytes32[] memory kinds = new bytes32[](1);
        kinds[0] = NO_VERIFIER_KIND;
        _setKinds(kinds);

        bytes32 callId = _completedCall();

        expectEmitEvidenceAbsent(1, NO_VERIFIER_KIND, DisputeV4.AbsentReason.NoVerifier);
        uint256 id = _openDispute(callId);

        // The registry has no verifier for this kind, and nothing was anchored.
        SLAEvidenceRegistryV2.Evidence memory stored = evidence.getEvidence(callId, NO_VERIFIER_KIND);
        assertEq(uint64(stored.anchoredAt), 0);
        assertEq(stored.claimHash, bytes32(0));

        DisputeV4.LinkedEvidence[] memory rows = dispute.evidenceOf(id);
        assertEq(rows.length, 1);
        assertFalse(rows[0].present);
        assertFalse(rows[0].bound);
        assertEq(uint8(rows[0].reason), uint8(DisputeV4.AbsentReason.NoVerifier));
        assertEq(uint8(rows[0].mode), 0);
        assertEq(rows[0].claimHash, bytes32(0));
        assertEq(rows[0].anchoredAt, 0);
    }

    function test_absentWhenNothingAnchored() public {
        _wireProof(ZK_EXECUTION, true);
        bytes32[] memory kinds = new bytes32[](1);
        kinds[0] = ZK_EXECUTION;
        _setKinds(kinds);

        bytes32 callId = _completedCall();

        expectEmitEvidenceAbsent(1, ZK_EXECUTION, DisputeV4.AbsentReason.NoAnchor);
        uint256 id = _openDispute(callId);

        DisputeV4.LinkedEvidence[] memory rows = dispute.evidenceOf(id);
        assertEq(rows.length, 1);
        assertFalse(rows[0].present);
        assertFalse(rows[0].bound);
        assertEq(uint8(rows[0].mode), uint8(SLAEvidenceRegistryV2.VerifierMode.Proof));
        assertEq(rows[0].claimHash, bytes32(0));
        assertEq(rows[0].anchoredAt, 0);
    }

    function test_snapshotDoesNotChangeAfterResolve() public {
        _wireProof(ZK_EXECUTION, true);
        bytes32[] memory kinds = new bytes32[](1);
        kinds[0] = ZK_EXECUTION;
        _setKinds(kinds);

        bytes32 callId = _completedCall();
        _anchorProof(callId, ZK_EXECUTION, RESPONSE_HASH);
        uint256 id = _openDispute(callId);

        bytes memory before = abi.encode(dispute.evidenceOf(id));

        vm.prank(arbiter);
        dispute.resolve(id, false);
        skip(APPEAL_WINDOW + 1);
        dispute.finalize(id);

        assertEq(abi.encode(dispute.evidenceOf(id)), before);
    }

    function test_evidenceKindsCappedAtEight() public {
        bytes32[] memory nine = new bytes32[](9);
        for (uint256 i = 0; i < 9; ++i) {
            nine[i] = keccak256(abi.encode("kind", i));
        }

        vm.prank(arbiter);
        vm.expectRevert(DisputeV4.TooManyKinds.selector);
        dispute.setEvidenceKinds(nine);

        bytes32[] memory eight = new bytes32[](8);
        for (uint256 i = 0; i < 8; ++i) {
            eight[i] = nine[i];
        }
        _setKinds(eight);
        bytes32[] memory stored = dispute.evidenceKinds();
        assertEq(stored.length, 8);
        for (uint256 i = 0; i < 8; ++i) {
            assertEq(stored[i], nine[i]);
        }
    }

    function test_setEvidenceKinds_rejectsDuplicateKind() public {
        bytes32[] memory kinds = new bytes32[](2);
        kinds[0] = ZK_EXECUTION;
        kinds[1] = ZK_EXECUTION;

        vm.prank(arbiter);
        vm.expectRevert(DisputeV4.DuplicateKind.selector);
        dispute.setEvidenceKinds(kinds);
    }

    function test_setEvidenceKinds_onlyArbiter() public {
        bytes32[] memory kinds = new bytes32[](1);
        kinds[0] = ZK_EXECUTION;

        vm.prank(caller);
        vm.expectRevert(DisputeV4.NotArbiter.selector);
        dispute.setEvidenceKinds(kinds);

        _setKinds(kinds);
        assertEq(dispute.evidenceKinds()[0], ZK_EXECUTION);
    }

    /// Default-state liveness: a fresh contract has no kinds configured, so the
    /// snapshot performs zero external calls and a dispute opens anyway.
    function test_openDispute_snapshotsNothingByDefault() public {
        assertEq(dispute.evidenceKinds().length, 0);

        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        assertEq(dispute.evidenceOf(id).length, 0);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function expectEmitEvidenceLinked(
        uint256 disputeId,
        bytes32 kind,
        bytes32 claimHash,
        uint8 mode,
        bool bound
    )
        internal
    {
        vm.expectEmit(true, true, false, true, address(dispute));
        emit DisputeV4.EvidenceLinked(disputeId, kind, claimHash, mode, bound);
    }

    function expectEmitEvidenceAbsent(uint256 disputeId, bytes32 kind, DisputeV4.AbsentReason reason) internal {
        vm.expectEmit(true, true, false, true, address(dispute));
        emit DisputeV4.EvidenceAbsent(disputeId, kind, reason);
    }

    function _setKinds(bytes32[] memory kinds) internal {
        vm.prank(arbiter);
        dispute.setEvidenceKinds(kinds);
    }

    function _wireProof(bytes32 kind, bool bindsResponse_) internal {
        vm.prank(admin);
        evidence.setProofVerifier(kind, adapter, bindsResponse_);
    }

    function _wireSignature(bytes32 kind) internal {
        vm.prank(admin);
        evidence.setSignatureVerifier(kind, attestor, true);
    }

    function _anchorProof(bytes32 callId, bytes32 kind, bytes32 responseHash) internal {
        vm.prank(caller);
        evidence.anchor(callId, kind, CLAIM_HASH, responseHash, STATEMENT_HASH, ASSUMPTION_HASH, "");
    }

    function _anchorSignature(bytes32 callId, bytes32 kind, bytes32 responseHash) internal {
        bytes32 digest = evidence.anchorDigest(callId, kind, CLAIM_HASH, responseHash, STATEMENT_HASH, ASSUMPTION_HASH);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attestorKey, digest);
        vm.prank(attestor);
        evidence.anchor(callId, kind, CLAIM_HASH, responseHash, STATEMENT_HASH, ASSUMPTION_HASH, abi.encodePacked(r, s, v));
    }

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

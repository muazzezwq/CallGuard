// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";
import { PayPerCallV8 } from "../contracts/PayPerCallV8.sol";
import { DisputeV4, ISLAEvidenceV2 } from "../contracts/DisputeV4.sol";
import { DisputeV3 } from "../contracts/DisputeV3.sol";
import { DeployEvidenceV2 } from "../script/DeployEvidenceV2.s.sol";
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
    bytes32 internal constant UNBOUND_PROOF_KIND = keccak256("unbound-proof");

    uint256 internal providerId;
    DisputeV3 internal legacyDispute;
    address internal adapter;

    function setUp() public {
        deployScript = new DeployEvidenceV2();
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
        // The legacy contract slashes its own escrow at open, so it needs the
        // registry's slasher authorization too in these tests.
        registry.authorizeSlasher(address(legacyDispute));
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

        // Legacy-guard tests open the same call on the V3 contract, which also
        // pulls its dispute bond from the caller.
        vm.prank(caller);
        usdc.approve(address(legacyDispute), type(uint256).max);

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
        assertEq(uint8(rows[0].reason), uint8(DisputeV4.AbsentReason.ModeIsSignature));
        assertEq(uint8(rows[0].mode), uint8(SLAEvidenceRegistryV2.VerifierMode.Signature));
        assertEq(rows[0].claimHash, CLAIM_HASH);
        assertEq(rows[0].responseHash, RESPONSE_HASH);
    }

    function test_unboundWhenProofVerifierDoesNotBind() public {
        _wireProof(UNBOUND_PROOF_KIND, false);
        bytes32[] memory kinds = new bytes32[](1);
        kinds[0] = UNBOUND_PROOF_KIND;
        _setKinds(kinds);

        bytes32 callId = _completedCall();
        _anchorProof(callId, UNBOUND_PROOF_KIND, RESPONSE_HASH);

        expectEmitEvidenceLinked(1, UNBOUND_PROOF_KIND, CLAIM_HASH, 2, false);
        uint256 id = _openDispute(callId);

        DisputeV4.LinkedEvidence[] memory rows = dispute.evidenceOf(id);
        assertEq(rows.length, 1);
        assertTrue(rows[0].present);
        assertFalse(rows[0].bound);
        assertEq(uint8(rows[0].reason), uint8(DisputeV4.AbsentReason.VerifierNotBinding));
        assertEq(uint8(rows[0].mode), uint8(SLAEvidenceRegistryV2.VerifierMode.Proof));
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

    /// Flatness: the evidence snapshot is written at open and read by nobody in
    /// the money paths, so a dispute whose call carries a genuinely bound
    /// `zk-execution` claim must leave exactly the same caller, provider,
    /// treasury and dispute-contract balance deltas as a dispute whose call has
    /// nothing anchored — for both verdicts.
    struct Deltas {
        int256 caller;
        int256 provider;
        int256 treasury;
        int256 dispute;
    }

    function test_balancesAreIdenticalWithAndWithoutEvidence() public {
        _wireProof(ZK_EXECUTION, true);
        bytes32[] memory kinds = new bytes32[](1);
        kinds[0] = ZK_EXECUTION;
        _setKinds(kinds);

        Deltas memory upheldWithEvidence = _runFullDispute(true, true);
        Deltas memory upheldWithoutEvidence = _runFullDispute(false, true);
        Deltas memory rejectedWithEvidence = _runFullDispute(true, false);
        Deltas memory rejectedWithoutEvidence = _runFullDispute(false, false);

        // Same verdict, same provider stake: deltas must be exactly equal.
        assertEq(upheldWithEvidence.caller, upheldWithoutEvidence.caller);
        assertEq(upheldWithEvidence.provider, upheldWithoutEvidence.provider);
        assertEq(upheldWithEvidence.treasury, upheldWithoutEvidence.treasury);
        assertEq(upheldWithEvidence.dispute, upheldWithoutEvidence.dispute);

        assertEq(rejectedWithEvidence.caller, rejectedWithoutEvidence.caller);
        assertEq(rejectedWithEvidence.provider, rejectedWithoutEvidence.provider);
        assertEq(rejectedWithEvidence.treasury, rejectedWithoutEvidence.treasury);
        assertEq(rejectedWithEvidence.dispute, rejectedWithoutEvidence.dispute);

        // And the flows themselves stay the known ones, so a broken money path
        // cannot hide behind two equally-broken runs. The escrowed slash moves
        // registry → dispute → party, so the provider wallet only sees it when
        // the escrow returns to them.
        assertEq(upheldWithEvidence.caller, 10e6); // escrowed slash
        assertEq(upheldWithEvidence.provider, 0);
        assertEq(upheldWithEvidence.treasury, 0);
        assertEq(upheldWithEvidence.dispute, 0);

        assertEq(rejectedWithEvidence.caller, -2e6); // bond forfeited
        assertEq(rejectedWithEvidence.provider, 10e6); // escrow returned
        assertEq(rejectedWithEvidence.treasury, 2e6);
        assertEq(rejectedWithEvidence.dispute, 0);
    }

    /// One complete V4 dispute lifecycle: top the provider stake back to
    /// `STAKE` so every run escrows the same slash, open (optionally with a
    /// bound claim anchored first), resolve, skip the appeal window, finalize,
    /// then report the balance deltas across the whole run.
    function _runFullDispute(bool anchored, bool upheld) internal returns (Deltas memory d) {
        _replenishProviderStake();
        assertEq(registry.getProvider(providerId).stake, STAKE);

        bytes32 callId = _completedCall();
        if (anchored) {
            _anchorProof(callId, ZK_EXECUTION, RESPONSE_HASH);
        }

        // Deltas cover the dispute lifecycle only: the call's own price (paid
        // by `callService` above) must not leak into these numbers.
        uint256 callerBefore = usdc.balanceOf(caller);
        uint256 providerBefore = usdc.balanceOf(provider);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 disputeBefore = usdc.balanceOf(address(dispute));

        uint256 id = _openDispute(callId);

        DisputeV4.LinkedEvidence[] memory rows = dispute.evidenceOf(id);
        assertEq(rows.length, 1);
        if (anchored) {
            // A regression that stops binding must not pass below by comparing
            // two evidence-free disputes: this run must be genuinely bound.
            assertTrue(rows[0].bound);
        } else {
            assertFalse(rows[0].bound);
            assertFalse(rows[0].present);
        }

        vm.prank(arbiter);
        dispute.resolve(id, upheld);
        skip(APPEAL_WINDOW + 1);
        dispute.finalize(id);

        d.caller = int256(usdc.balanceOf(caller)) - int256(callerBefore);
        d.provider = int256(usdc.balanceOf(provider)) - int256(providerBefore);
        d.treasury = int256(usdc.balanceOf(treasury)) - int256(treasuryBefore);
        d.dispute = int256(usdc.balanceOf(address(dispute))) - int256(disputeBefore);
    }

    function _replenishProviderStake() internal {
        uint256 stake = registry.getProvider(providerId).stake;
        if (stake < STAKE) {
            vm.prank(provider);
            registry.addStake(providerId, STAKE - stake);
        }
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

    /// An empty allowlist is a real no-op and resets back to the fresh-deployment
    /// state: nothing configured, nothing snapshotted.
    function test_setEvidenceKinds_acceptsEmptyArray() public {
        _wireProof(ZK_EXECUTION, true);
        bytes32[] memory kinds = new bytes32[](1);
        kinds[0] = ZK_EXECUTION;
        _setKinds(kinds);

        bytes32[] memory none = new bytes32[](0);
        _setKinds(none);
        assertEq(dispute.evidenceKinds().length, 0);

        bytes32 callId = _completedCall();
        uint256 id = _openDispute(callId);

        assertEq(dispute.evidenceOf(id).length, 0);
    }

    // ---------------------------------------------------------------------
    // deploy-script wiring order (Task 12)
    // ---------------------------------------------------------------------

    bytes32 internal constant WITNESS = keccak256("witness");
    bytes32 internal constant ZK_CONSTRAINT = keccak256("zk-constraint");

    // The live zk-execution fixture (src/lib/verification/fixtures/zk-execution.json
    // and its statement/assumption twin pinned in test/ClaimHashes.t.sol).
    bytes32 internal constant FIXTURE_CALL_ID = 0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265;
    bytes32 internal constant FIXTURE_RESPONSE_HASH = 0x188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d;
    bytes32 internal constant FIXTURE_CLAIM_HASH = 0xe3baff68e7c0299a4275cc3e7553fb27da16d1929fa47a5fe04ab7b58b9f419c;
    bytes32 internal constant FIXTURE_STATEMENT_HASH = 0xf638c765d435690aa9da23cf4ab8d3e58f5b29ea8f7ee90d85829f583cd510f9;
    bytes32 internal constant FIXTURE_ASSUMPTION_HASH = 0xa007194563d9649410719f9f3ba3daf8a8ccefb11c70a25d51be40753d91fef9;

    /// Instance of the deploy script, so the test can read its pinned live
    /// values through the public getters — static `DeployEvidenceV2.CONSTANT`
    /// member access from a test is not resolvable under dynamic test linking.
    DeployEvidenceV2 internal deployScript;

    /// Live values are pinned in the deploy script's defaults, not only in tests,
    /// so the script itself is the source for the wiring parameters used here.
    function test_deployScriptLiveDefaultsMatchTheControllerValues() public view {
        assertEq(deployScript.LIVE_LEGACY_DISPUTE(), address(0xEf9f21Ece9b4C58BCb76913887E4f4846Ec36Fec));
        assertEq(deployScript.DISPUTE_BOND_DEFAULT(), 2_000_000);
        assertEq(deployScript.APPEAL_BOND_DEFAULT(), 3_000_000);
        assertEq(deployScript.DISPUTE_WINDOW_DEFAULT(), 604_800);
        assertEq(deployScript.APPEAL_WINDOW_DEFAULT(), 172_800);
        assertEq(deployScript.RESOLUTION_WINDOW_DEFAULT(), 604_800);
        assertEq(deployScript.DISPUTE_SLASH_BPS_DEFAULT(), 1_000);
        assertEq(deployScript.ZK_CONSTRAINT_ADAPTER(), address(0x8bD4fB9F364F9aAd80E4dB275B08a49B88e3664E));
        assertEq(deployScript.ZK_EXECUTION_ADAPTER(), address(0xD804F2E0EfB3D8c470d60942643B71Ea5b271a21));
    }

    /// `Proof` kinds with `bindsResponse = true`, configure all four kinds, then
    /// anchor the live fixture's claim. A kind left unwired, a wrong
    /// `bindsResponse`, or a `DisputeV4` deployed without the evidence wire
    /// cannot get through this.
    function test_wiringSequenceLeavesNoKindUnwired() public {
        // 1. The script deploys the registry with the same owner that wires it.
        vm.prank(admin);
        SLAEvidenceRegistryV2 freshRegistry = new SLAEvidenceRegistryV2(admin);

        // 2. The two Proof kinds across the two adapters, in script order.
        vm.startPrank(admin);
        freshRegistry.setProofVerifier(ZK_CONSTRAINT, deployScript.ZK_CONSTRAINT_ADAPTER(), true);
        freshRegistry.setProofVerifier(ZK_EXECUTION, deployScript.ZK_EXECUTION_ADAPTER(), true);
        vm.stopPrank();

        assertEq(uint8(freshRegistry.modeOf(ZK_CONSTRAINT)), uint8(SLAEvidenceRegistryV2.VerifierMode.Proof));
        assertEq(uint8(freshRegistry.modeOf(ZK_EXECUTION)), uint8(SLAEvidenceRegistryV2.VerifierMode.Proof));
        assertTrue(freshRegistry.bindsResponse(ZK_CONSTRAINT));
        assertTrue(freshRegistry.bindsResponse(ZK_EXECUTION));

        // 3. V4 deployed with the live-shape constructor (live windows and
        //    bonds, driven by the script's pinned defaults).
        DisputeV4 wired = new DisputeV4(
            IERC20(address(usdc)),
            registry,
            payPerCall,
            arbiter,
            appealArbiter,
            treasury,
            deployScript.DISPUTE_BOND_DEFAULT(),
            deployScript.APPEAL_BOND_DEFAULT(),
            uint32(deployScript.DISPUTE_WINDOW_DEFAULT()),
            uint32(deployScript.APPEAL_WINDOW_DEFAULT()),
            uint32(deployScript.RESOLUTION_WINDOW_DEFAULT()),
            uint16(deployScript.DISPUTE_SLASH_BPS_DEFAULT()),
            ISLAEvidenceV2(address(freshRegistry)),
            legacyDispute
        );
        // openDispute at step 7 escrows the 2e6 bond, so the caller approves.
        vm.prank(caller);
        usdc.approve(address(wired), type(uint256).max);
        // openDispute also escrows the slash, and only an authorized slasher
        // may call registry.slash().
        vm.prank(admin);
        registry.authorizeSlasher(address(wired));

        // 4. The allowlist is required: with an empty one `openDispute`
        //    snapshots nothing and the feature ships silently doing nothing.
        bytes32[] memory kinds = new bytes32[](4);
        kinds[0] = WITNESS;
        kinds[1] = TEE_ATTESTATION;
        kinds[2] = ZK_CONSTRAINT;
        kinds[3] = ZK_EXECUTION;
        vm.prank(arbiter);
        wired.setEvidenceKinds(kinds);
        assertEq(wired.evidenceKinds().length, 4);

        // 5. A completed call whose response hash is the fixture's, so the
        //    anchored claim really binds this dispute's call. The live adapter
        //    addresses are pinned, so both adapters are given the mock
        //    verifier's code here; the wiring and addresses under test stay
        //    the script's own live constants.
        vm.etch(deployScript.ZK_CONSTRAINT_ADAPTER(), address(new MockProofVerifier()).code);
        vm.etch(deployScript.ZK_EXECUTION_ADAPTER(), address(new MockProofVerifier()).code);
        bytes32 callId = _completedCallWithResponse(FIXTURE_RESPONSE_HASH);
        vm.prank(caller);
        freshRegistry.anchor(callId, ZK_EXECUTION, FIXTURE_CLAIM_HASH, FIXTURE_RESPONSE_HASH, FIXTURE_STATEMENT_HASH, FIXTURE_ASSUMPTION_HASH, "");

        // 6. The fixture's claim reads back anchored on this call.
        assertTrue(freshRegistry.isAnchored(callId, ZK_EXECUTION, FIXTURE_CLAIM_HASH));

        // 7. Open the dispute: the snapshot must report the claim bound.
        vm.prank(caller);
        uint256 id = wired.openDispute(callId, providerId, "ipfs://evidence");

        DisputeV4.LinkedEvidence[] memory rows = wired.evidenceOf(id);
        assertEq(rows.length, 4);
        DisputeV4.LinkedEvidence memory zkRow = rows[3];
        assertEq(zkRow.kind, ZK_EXECUTION);
        assertTrue(zkRow.present);
        assertTrue(zkRow.bound);
        assertEq(uint8(zkRow.mode), uint8(SLAEvidenceRegistryV2.VerifierMode.Proof));
        assertEq(zkRow.claimHash, FIXTURE_CLAIM_HASH);
        assertEq(zkRow.responseHash, FIXTURE_RESPONSE_HASH);
        assertEq(zkRow.statementHash, FIXTURE_STATEMENT_HASH);
        assertEq(zkRow.assumptionHash, FIXTURE_ASSUMPTION_HASH);
        assertEq(uint8(zkRow.reason), uint8(DisputeV4.AbsentReason.None));
    }

    // ---------------------------------------------------------------------
    // legacy guard (V3 cross-checks)
    // ---------------------------------------------------------------------

    function test_openRevertsWhenV3AlreadyHoldsTheCall() public {
        bytes32 callId = _completedCall();

        vm.prank(caller);
        legacyDispute.openDispute(callId, providerId, "ipfs://first");

        vm.expectRevert(DisputeV4.AlreadyDisputedElsewhere.selector);
        vm.prank(caller);
        dispute.openDispute(callId, providerId, "ipfs://second");
    }

    function test_oldDisputeIsStillReadableThroughV4() public {
        bytes32 callId = _completedCall();

        vm.prank(caller);
        legacyDispute.openDispute(callId, providerId, "ipfs://first");

        assertEq(dispute.legacyDispute().getDisputeByCallId(callId).caller, caller);
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
        callId = _completedCallWithResponse(RESPONSE_HASH);
    }

    /// Same flow as `_completedCall`, but the committed response hash is chosen
    /// by the caller of the helper, so an anchored claim can bind a test call
    /// exactly the way the live fixture binds its on-chain call.
    function _completedCallWithResponse(bytes32 responseHash) internal returns (bytes32 callId) {
        vm.prank(caller);
        callId = payPerCall.callService(providerId, keccak256("request"));

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

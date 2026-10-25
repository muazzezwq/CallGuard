// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

import { SLAEvidenceRegistry } from "../contracts/SLAEvidenceRegistry.sol";

/// @notice B3b evidence anchoring: one claim per (call, kind), and the claim is
///         only accepted when the configured verifier for that kind vouches for it —
///         by signature when the proof cannot be checked on chain, by proof
///         verification when it can.
contract SLAEvidenceRegistryTest is Test {
    SLAEvidenceRegistry internal registry;

    address internal admin = address(0xA11CE);
    address internal attestor;
    address internal stranger;
    uint256 internal attestorKey;
    uint256 internal strangerKey;

    bytes32 internal constant CALL_ID = keccak256("call-1");
    bytes32 internal constant RESPONSE_HASH = keccak256("pong");
    bytes32 internal constant CLAIM_HASH = keccak256("claim-1");
    bytes32 internal constant TEE_KIND = keccak256("tee-attestation");
    bytes32 internal constant WITNESS_KIND = keccak256("witness");

    function setUp() public {
        (attestor, attestorKey) = makeAddrAndKey("attestor");
        (stranger, strangerKey) = makeAddrAndKey("stranger");

        vm.prank(admin);
        registry = new SLAEvidenceRegistry(admin);
        vm.prank(admin);
        registry.setSignatureVerifier(TEE_KIND, attestor, true);
        vm.warp(1_800_000_000);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _digest(bytes32 callId, bytes32 kind, bytes32 claimHash, bytes32 responseHash)
        internal
        view
        returns (bytes32)
    {
        return registry.anchorDigest(callId, kind, claimHash, responseHash);
    }

    function _anchor() internal {
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH));
        registry.anchor(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH, sig);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    function test_constructor_setsOwner() public view {
        assertEq(registry.owner(), admin);
    }

    function test_constructor_revertsOnZeroOwner() public {
        vm.expectRevert(SLAEvidenceRegistry.InvalidAddress.selector);
        new SLAEvidenceRegistry(address(0));
    }

    function test_setSignatureVerifier_onlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(SLAEvidenceRegistry.NotOwner.selector);
        registry.setSignatureVerifier(TEE_KIND, stranger, true);
    }

    function test_setSignatureVerifier_rejectsZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(SLAEvidenceRegistry.InvalidAddress.selector);
        registry.setSignatureVerifier(TEE_KIND, address(0), true);
    }

    function test_setSignatureVerifier_emitsAndStores() public {
        address fresh = address(0xF5E5);
        vm.expectEmit(true, true, false, true, address(registry));
        emit SLAEvidenceRegistry.VerifierChanged(TEE_KIND, fresh, SLAEvidenceRegistry.VerifierMode.Signature, true);
        vm.prank(admin);
        registry.setSignatureVerifier(TEE_KIND, fresh, true);
        assertTrue(registry.signatureVerifier(TEE_KIND, fresh));
    }

    // ------------------------------------------------------------------
    // Signature mode
    // ------------------------------------------------------------------

    function test_anchor_storesSignatureEvidence() public {
        bytes32 digest = _digest(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH);
        bytes memory sig = _sign(attestorKey, digest);

        vm.expectEmit(true, true, false, true, address(registry));
        emit SLAEvidenceRegistry.EvidenceAnchored(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH, attestor);

        registry.anchor(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH, sig);

        SLAEvidenceRegistry.Evidence memory record = registry.getEvidence(CALL_ID, TEE_KIND);
        assertEq(record.claimHash, CLAIM_HASH);
        assertEq(record.responseHash, RESPONSE_HASH);
        assertEq(record.verifier, attestor);
        assertEq(record.anchoredAt, block.timestamp);
        assertTrue(registry.isAnchored(CALL_ID, TEE_KIND, CLAIM_HASH));
    }

    function test_anchor_rejectsUnallowlistedSigner() public {
        bytes memory sig = _sign(strangerKey, _digest(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH));
        vm.expectRevert(SLAEvidenceRegistry.VerifierNotAllowed.selector);
        registry.anchor(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH, sig);
    }

    function test_anchor_rejectsReplayForTheSameCallAndKind() public {
        _anchor();
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, TEE_KIND, keccak256("claim-2"), RESPONSE_HASH));
        vm.expectRevert(SLAEvidenceRegistry.AlreadyAnchored.selector);
        registry.anchor(CALL_ID, TEE_KIND, keccak256("claim-2"), RESPONSE_HASH, sig);
    }

    function test_anchor_rejectsTamperedClaim() public {
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH));
        vm.expectRevert(SLAEvidenceRegistry.VerifierNotAllowed.selector);
        registry.anchor(CALL_ID, TEE_KIND, keccak256("tampered"), RESPONSE_HASH, sig);
    }

    function test_anchor_rejectsSignatureForAnotherCall() public {
        bytes memory sig = _sign(attestorKey, _digest(keccak256("other"), TEE_KIND, CLAIM_HASH, RESPONSE_HASH));
        vm.expectRevert(SLAEvidenceRegistry.VerifierNotAllowed.selector);
        registry.anchor(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH, sig);
    }

    function test_anchor_rejectsSignatureForAnotherResponse() public {
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, TEE_KIND, CLAIM_HASH, keccak256("other-body")));
        vm.expectRevert(SLAEvidenceRegistry.VerifierNotAllowed.selector);
        registry.anchor(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH, sig);
    }

    function test_anchor_rejectsSignatureForAnotherChain() public {
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH));
        vm.chainId(5042003);
        vm.expectRevert(SLAEvidenceRegistry.VerifierNotAllowed.selector);
        registry.anchor(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH, sig);
    }

    function test_anchor_rejectsUnknownKind() public {
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, keccak256("invented"), CLAIM_HASH, RESPONSE_HASH));
        vm.expectRevert(SLAEvidenceRegistry.NoVerifierForKind.selector);
        registry.anchor(CALL_ID, keccak256("invented"), CLAIM_HASH, RESPONSE_HASH, sig);
    }

    function test_anchor_rejectsMalformedSignature() public {
        vm.expectRevert(SLAEvidenceRegistry.InvalidSignature.selector);
        registry.anchor(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH, hex"deadbeef");
    }

    function test_anchor_rejectsEmptyClaimOrResponseHash() public {
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, TEE_KIND, bytes32(0), RESPONSE_HASH));
        vm.expectRevert(SLAEvidenceRegistry.EmptyHash.selector);
        registry.anchor(CALL_ID, TEE_KIND, bytes32(0), RESPONSE_HASH, sig);

        bytes memory sig2 = _sign(attestorKey, _digest(CALL_ID, TEE_KIND, CLAIM_HASH, bytes32(0)));
        vm.expectRevert(SLAEvidenceRegistry.EmptyHash.selector);
        registry.anchor(CALL_ID, TEE_KIND, CLAIM_HASH, bytes32(0), sig2);
    }

    function test_revokedVerifier_cannotAnchorButOldRecordStays() public {
        _anchor();
        vm.prank(admin);
        registry.setSignatureVerifier(TEE_KIND, attestor, false);

        bytes32 otherCall = keccak256("call-2");
        bytes memory sig = _sign(attestorKey, _digest(otherCall, TEE_KIND, CLAIM_HASH, RESPONSE_HASH));
        vm.expectRevert(SLAEvidenceRegistry.VerifierNotAllowed.selector);
        registry.anchor(otherCall, TEE_KIND, CLAIM_HASH, RESPONSE_HASH, sig);

        assertTrue(registry.isAnchored(CALL_ID, TEE_KIND, CLAIM_HASH));
    }

    // ------------------------------------------------------------------
    // Proof mode
    // ------------------------------------------------------------------

    function test_anchor_storesProofVerifiedEvidence() public {
        MockVerifier verifier = new MockVerifier(true);
        vm.prank(admin);
        registry.setProofVerifier(TEE_KIND, address(verifier));

        registry.anchor(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH, hex"c0ffee");

        assertEq(verifier.lastCallId(), CALL_ID);
        assertEq(verifier.lastClaimHash(), CLAIM_HASH);
        assertEq(verifier.lastResponseHash(), RESPONSE_HASH);
        assertEq(registry.getEvidence(CALL_ID, TEE_KIND).verifier, address(verifier));
    }

    function test_anchor_rejectsProofTheVerifierRefuses() public {
        MockVerifier verifier = new MockVerifier(false);
        vm.prank(admin);
        registry.setProofVerifier(TEE_KIND, address(verifier));

        vm.expectRevert(SLAEvidenceRegistry.ProofRejected.selector);
        registry.anchor(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH, hex"c0ffee");
    }

    function test_anchor_rejectsProofVerifierThatReverts() public {
        MockVerifier verifier = new MockVerifier(true);
        verifier.setRevertOnVerify(true);
        vm.prank(admin);
        registry.setProofVerifier(TEE_KIND, address(verifier));

        vm.expectRevert(SLAEvidenceRegistry.VerifierFailed.selector);
        registry.anchor(CALL_ID, TEE_KIND, CLAIM_HASH, RESPONSE_HASH, hex"c0ffee");
    }

    function test_setProofVerifier_onlyOwnerAndNonZero() public {
        vm.prank(stranger);
        vm.expectRevert(SLAEvidenceRegistry.NotOwner.selector);
        registry.setProofVerifier(TEE_KIND, stranger);

        vm.prank(admin);
        vm.expectRevert(SLAEvidenceRegistry.InvalidAddress.selector);
        registry.setProofVerifier(TEE_KIND, address(0));
    }

    function test_kindCanCoexistAcrossModes() public {
        MockVerifier verifier = new MockVerifier(true);
        vm.prank(admin);
        registry.setProofVerifier(WITNESS_KIND, address(verifier));

        _anchor();
        registry.anchor(CALL_ID, WITNESS_KIND, CLAIM_HASH, RESPONSE_HASH, hex"01");

        assertEq(registry.getEvidence(CALL_ID, TEE_KIND).verifier, attestor);
        assertEq(registry.getEvidence(CALL_ID, WITNESS_KIND).verifier, address(verifier));
    }
}

/// @dev Minimal stand-in for a Groth16/UltraHonk verifier: the registry only
///      needs to know that verification returned true, not how it worked.
contract MockVerifier {
    bool private _result;
    bool private _revertOnVerify;

    bytes32 public lastCallId;
    bytes32 public lastClaimHash;
    bytes32 public lastResponseHash;

    constructor(bool result) {
        _result = result;
    }

    function setRevertOnVerify(bool value) external {
        _revertOnVerify = value;
    }

    function verify(bytes calldata, bytes32 callId, bytes32 claimHash, bytes32 responseHash)
        external
        returns (bool)
    {
        if (_revertOnVerify) revert("verifier exploded");
        lastCallId = callId;
        lastClaimHash = claimHash;
        lastResponseHash = responseHash;
        return _result;
    }
}

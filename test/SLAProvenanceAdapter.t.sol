// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

import { SLAProvenance } from "../contracts/SLAProvenance.sol";
import { SLAEvidenceRegistryV2 } from "../contracts/SLAEvidenceRegistryV2.sol";
import { SLAProvenanceAdapter } from "../contracts/zk/SLAProvenanceAdapter.sol";

/// @notice The `witness` kind on `SLAEvidenceRegistryV2` is wired to this adapter.
///         The adapter answers one question for `DisputeV4`: does the call's
///         provenance record name the response hash the dispute is about, signed by
///         an attestor that is allowlisted *now*?
///
///         The distinction the tests pin: a claim that fails those checks must read
///         as "not proven" (`false`), never as a revert. A revert reaches the
///         registry as `VerifierFailed`, which reads like a broken verifier instead
///         of a rejected claim.
contract SLAProvenanceAdapterTest is Test {
    SLAProvenance internal provenance;
    SLAProvenanceAdapter internal adapter;

    address internal admin = address(0xA11CE);
    address internal attestor;
    uint256 internal attestorKey;

    bytes32 internal constant CALL_ID = keccak256("call-1");
    bytes32 internal constant RESPONSE_HASH = keccak256("pong");
    string internal constant ORIGIN = "arcsla.vercel.app";

    function setUp() public {
        (attestor, attestorKey) = makeAddrAndKey("attestor");

        vm.prank(admin);
        provenance = new SLAProvenance(admin);
        vm.prank(admin);
        provenance.setAttestor(attestor, true);

        adapter = new SLAProvenanceAdapter(address(provenance));

        vm.warp(1_800_000_000);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _record(bytes32 callId, bytes32 payloadHash) internal {
        uint64 observedAt = uint64(block.timestamp);
        bytes memory sig =
            _sign(attestorKey, provenance.provenanceDigest(callId, payloadHash, keccak256(bytes(ORIGIN)), observedAt));
        provenance.recordProvenance(callId, payloadHash, ORIGIN, observedAt, sig);
    }

    // ------------------------------------------------------------------
    // Constructor
    // ------------------------------------------------------------------

    function test_constructor_storesProvenance() public view {
        assertEq(adapter.provenance(), address(provenance));
    }

    function test_constructor_revertsOnZeroProvenance() public {
        vm.expectRevert(SLAProvenanceAdapter.InvalidAddress.selector);
        new SLAProvenanceAdapter(address(0));
    }

    // ------------------------------------------------------------------
    // Acceptance
    // ------------------------------------------------------------------

    function test_acceptsWhenRecordNamesTheResponseHash() public {
        _record(CALL_ID, RESPONSE_HASH);
        assertTrue(adapter.verify("", CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    /// The registry passes whatever bytes the caller anchored with. The proof blob is
    /// not an input to this check, so junk bytes must not change the answer.
    function test_ignoresProofBytes() public {
        _record(CALL_ID, RESPONSE_HASH);
        assertTrue(adapter.verify(hex"deadbeef", CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    // ------------------------------------------------------------------
    // Rejection: each must answer false, never revert
    // ------------------------------------------------------------------

    function test_rejectsWhenPayloadHashIsAnotherBody() public {
        _record(CALL_ID, keccak256("some-other-body"));
        assertFalse(adapter.verify("", CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    function test_rejectsWhenTheRecordIsForAnotherCall() public {
        _record(keccak256("call-2"), RESPONSE_HASH);
        assertFalse(adapter.verify("", CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    function test_rejectsWhenNothingIsRecorded() public view {
        assertFalse(adapter.verify("", CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    /// Revocation stops new anchors but keeps old records, so the adapter has to ask
    /// the allowlist rather than trust that a record exists.
    function test_rejectsWhenTheAttestorWasRevoked() public {
        _record(CALL_ID, RESPONSE_HASH);
        vm.prank(admin);
        provenance.setAttestor(attestor, false);
        assertFalse(adapter.verify("", CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    /// A misconfigured deployment should answer false, not revert on a decode of
    /// empty returndata.
    function test_rejectsWhenTheProvenanceAddressHasNoCode() public {
        SLAProvenanceAdapter orphan = new SLAProvenanceAdapter(address(0xBEEF));
        assertFalse(orphan.verify("", CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    // ------------------------------------------------------------------
    // Integration with the registry
    // ------------------------------------------------------------------

    function _wiredRegistry() internal returns (SLAEvidenceRegistryV2 registry) {
        registry = new SLAEvidenceRegistryV2(address(this));
        registry.setProofVerifier(keccak256("witness"), address(adapter), true);
    }

    function test_registryAnchorsAWitnessClaimThroughTheAdapter() public {
        SLAEvidenceRegistryV2 registry = _wiredRegistry();
        _record(CALL_ID, RESPONSE_HASH);

        registry.anchor(
            CALL_ID,
            keccak256("witness"),
            keccak256("claim"),
            RESPONSE_HASH,
            keccak256("statement"),
            keccak256("assumption"),
            ""
        );

        assertTrue(registry.isAnchored(CALL_ID, keccak256("witness"), keccak256("claim")));
        assertEq(uint256(registry.modeOf(keccak256("witness"))), 2);
        assertTrue(registry.bindsResponse(keccak256("witness")));
    }

    /// A rejection must arrive as `ProofRejected`, which a reader can tell apart from
    /// `VerifierFailed`. That is why the adapter returns false instead of reverting.
    function test_registryRejectsAClaimTheAdapterRefuses() public {
        SLAEvidenceRegistryV2 registry = _wiredRegistry();
        _record(CALL_ID, keccak256("some-other-body"));

        vm.expectRevert(SLAEvidenceRegistryV2.ProofRejected.selector);
        registry.anchor(
            CALL_ID,
            keccak256("witness"),
            keccak256("claim"),
            RESPONSE_HASH,
            keccak256("statement"),
            keccak256("assumption"),
            ""
        );
    }
}

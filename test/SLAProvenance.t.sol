// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

import { SLAProvenance } from "../contracts/SLAProvenance.sol";

/// @notice B3b coverage: a call's payload can carry provenance signed by an
///         allowlisted attestor, and the contract rejects every signature that is
///         not exactly the one it asked for.
contract SLAProvenanceTest is Test {
    SLAProvenance internal provenance;

    address internal admin = address(0xA11CE);
    address internal attestor;
    address internal stranger = address(0xBAD);

    uint256 internal attestorKey;
    uint256 internal strangerKey;

    bytes32 internal constant CALL_ID = keccak256("call-1");
    bytes32 internal constant PAYLOAD_HASH = keccak256("pong");
    string internal constant ORIGIN = "api.coingecko.com";

    function setUp() public {
        (attestor, attestorKey) = makeAddrAndKey("attestor");
        (stranger, strangerKey) = makeAddrAndKey("stranger");

        vm.prank(admin);
        provenance = new SLAProvenance(admin);
        vm.prank(admin);
        provenance.setAttestor(attestor, true);
        vm.warp(1_800_000_000);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _digest(bytes32 callId, bytes32 payloadHash, string memory origin, uint64 observedAt)
        internal
        view
        returns (bytes32)
    {
        return provenance.provenanceDigest(callId, payloadHash, keccak256(bytes(origin)), observedAt);
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _record() internal {
        uint64 observedAt = uint64(block.timestamp);
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt));
        provenance.recordProvenance(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt, sig);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    function test_constructor_setsOwner() public view {
        assertEq(provenance.owner(), admin);
    }

    function test_constructor_revertsOnZeroOwner() public {
        vm.expectRevert(SLAProvenance.InvalidAddress.selector);
        new SLAProvenance(address(0));
    }

    function test_setAttestor_emitsAndStores() public {
        address fresh = address(0xF5E5);
        vm.expectEmit(true, false, false, true, address(provenance));
        emit SLAProvenance.AttestorChanged(fresh, true);
        vm.prank(admin);
        provenance.setAttestor(fresh, true);
        assertTrue(provenance.isAttestor(fresh));
    }

    function test_setAttestor_onlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(SLAProvenance.NotOwner.selector);
        provenance.setAttestor(stranger, true);
    }

    function test_setOwner_onlyOwnerAndNonZero() public {
        vm.prank(stranger);
        vm.expectRevert(SLAProvenance.NotOwner.selector);
        provenance.setOwner(stranger);

        vm.prank(admin);
        vm.expectRevert(SLAProvenance.InvalidAddress.selector);
        provenance.setOwner(address(0));
    }

    // ------------------------------------------------------------------
    // Happy path
    // ------------------------------------------------------------------

    function test_recordProvenance_storesAndVerifies() public {
        uint64 observedAt = uint64(block.timestamp);
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt));

        vm.expectEmit(true, true, true, true, address(provenance));
        emit SLAProvenance.ProvenanceRecorded(
            CALL_ID, PAYLOAD_HASH, attestor, keccak256(bytes(ORIGIN)), observedAt
        );

        provenance.recordProvenance(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt, sig);

        SLAProvenance.Provenance memory record = provenance.getProvenance(CALL_ID);
        assertEq(record.payloadHash, PAYLOAD_HASH);
        assertEq(record.attestor, attestor);
        assertEq(record.originHash, keccak256(bytes(ORIGIN)));
        assertEq(record.observedAt, observedAt);
        assertEq(record.recordedAt, block.timestamp);
        assertTrue(provenance.verified(CALL_ID));
        assertTrue(provenance.verifyProvenance(CALL_ID, PAYLOAD_HASH));
    }

    function test_recordProvenance_acceptsClockSkewIntoTheFuture() public {
        uint64 observedAt = uint64(block.timestamp + provenance.MAX_CLOCK_SKEW() - 1);
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt));
        provenance.recordProvenance(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt, sig);
        assertTrue(provenance.verified(CALL_ID));
    }

    function test_verifyProvenance_falseForUnknownCall() public view {
        assertFalse(provenance.verifyProvenance(CALL_ID, PAYLOAD_HASH));
    }

    function test_verifyProvenance_falseForDifferentHash() public {
        _record();
        assertFalse(provenance.verifyProvenance(CALL_ID, keccak256("something-else")));
    }

    // ------------------------------------------------------------------
    // Rejections
    // ------------------------------------------------------------------

    function test_recordProvenance_rejectsUnallowlistedSigner() public {
        uint64 observedAt = uint64(block.timestamp);
        bytes memory sig = _sign(strangerKey, _digest(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt));

        vm.expectRevert(SLAProvenance.AttestorNotAllowed.selector);
        provenance.recordProvenance(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt, sig);
    }

    function test_recordProvenance_rejectsReplay() public {
        _record();
        uint64 observedAt = uint64(block.timestamp);
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt));

        vm.expectRevert(SLAProvenance.AlreadyRecorded.selector);
        provenance.recordProvenance(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt, sig);
    }

    function test_recordProvenance_rejectsDifferentPayloadWithSameSignature() public {
        uint64 observedAt = uint64(block.timestamp);
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt));

        vm.expectRevert(SLAProvenance.AttestorNotAllowed.selector);
        provenance.recordProvenance(CALL_ID, keccak256("tampered"), ORIGIN, observedAt, sig);
    }

    function test_recordProvenance_rejectsSignatureForAnotherCall() public {
        uint64 observedAt = uint64(block.timestamp);
        bytes memory sig = _sign(attestorKey, _digest(keccak256("other-call"), PAYLOAD_HASH, ORIGIN, observedAt));

        vm.expectRevert(SLAProvenance.AttestorNotAllowed.selector);
        provenance.recordProvenance(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt, sig);
    }

    function test_recordProvenance_rejectsSignatureForAnotherOrigin() public {
        uint64 observedAt = uint64(block.timestamp);
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, PAYLOAD_HASH, "evil.example.com", observedAt));

        vm.expectRevert(SLAProvenance.AttestorNotAllowed.selector);
        provenance.recordProvenance(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt, sig);
    }

    function test_recordProvenance_rejectsSignatureForAnotherChain() public {
        uint64 observedAt = uint64(block.timestamp);
        bytes32 digest = _digest(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt);
        bytes memory sig = _sign(attestorKey, digest);

        vm.chainId(999_999);
        vm.expectRevert(SLAProvenance.AttestorNotAllowed.selector);
        provenance.recordProvenance(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt, sig);
    }

    function test_recordProvenance_rejectsMalformedSignature() public {
        uint64 observedAt = uint64(block.timestamp);
        vm.expectRevert(SLAProvenance.InvalidSignature.selector);
        provenance.recordProvenance(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt, hex"deadbeef");
    }

    function test_recordProvenance_rejectsEmptyPayloadHash() public {
        uint64 observedAt = uint64(block.timestamp);
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, bytes32(0), ORIGIN, observedAt));

        vm.expectRevert(SLAProvenance.EmptyPayloadHash.selector);
        provenance.recordProvenance(CALL_ID, bytes32(0), ORIGIN, observedAt, sig);
    }

    function test_recordProvenance_rejectsFarFutureObservation() public {
        uint64 observedAt = uint64(block.timestamp + provenance.MAX_CLOCK_SKEW() + 1);
        bytes memory sig = _sign(attestorKey, _digest(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt));

        vm.expectRevert(SLAProvenance.ObservedInFuture.selector);
        provenance.recordProvenance(CALL_ID, PAYLOAD_HASH, ORIGIN, observedAt, sig);
    }

    // ------------------------------------------------------------------
    // Revocation
    // ------------------------------------------------------------------

    function test_revokedAttestor_cannotRecordButOldRecordStays() public {
        _record();
        assertTrue(provenance.verified(CALL_ID));

        vm.prank(admin);
        provenance.setAttestor(attestor, false);

        bytes32 otherCall = keccak256("call-2");
        uint64 observedAt = uint64(block.timestamp);
        bytes memory sig = _sign(attestorKey, _digest(otherCall, PAYLOAD_HASH, ORIGIN, observedAt));

        vm.expectRevert(SLAProvenance.AttestorNotAllowed.selector);
        provenance.recordProvenance(otherCall, PAYLOAD_HASH, ORIGIN, observedAt, sig);

        // The earlier attestation is history; revoking the key does not rewrite it.
        assertTrue(provenance.verified(CALL_ID));
    }
}

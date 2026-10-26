// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { SLAEvidenceRegistry } from "../contracts/SLAEvidenceRegistry.sol";
import { IPayPerCallV8 } from "../contracts/interfaces/IPayPerCallV8.sol";
import { Risc0ExecutionAdapter } from "../contracts/zk/Risc0ExecutionAdapter.sol";

/// @dev Accepts exactly one (imageId, journalDigest) pair and reverts otherwise, the
///      same shape the real Groth16 verifier has: success returns nothing, failure
///      reverts. That is enough to test every binding the adapter owns; the real
///      pairing is exercised end to end once, on chain, with a real receipt.
contract MockRisc0Verifier {
    bytes32 public expectedImageId;
    bytes32 public expectedJournalDigest;
    bool public shouldRevert;

    function set(bytes32 imageId, bytes32 journalDigest) external {
        expectedImageId = imageId;
        expectedJournalDigest = journalDigest;
        shouldRevert = false;
    }

    function fail(bool on) external {
        shouldRevert = on;
    }

    /// @dev `view` on purpose: the real `IRiscZeroVerifier.verify` is `view`, and the
    ///      adapter is a view function, so a mock that writes would make every call
    ///      fail through staticcall and hide the binding logic behind a false negative.
    function verify(bytes calldata, bytes32 imageId, bytes32 journalDigest) external view {
        if (shouldRevert || imageId != expectedImageId || journalDigest != expectedJournalDigest) {
            revert("invalid proof");
        }
    }
}

contract MockPayPerCall {
    mapping(bytes32 => bytes32) internal requestHashes;
    bool public shouldRevert;

    function setRequestHash(bytes32 callId, bytes32 requestHash) external {
        requestHashes[callId] = requestHash;
    }

    function fail(bool on) external {
        shouldRevert = on;
    }

    function getCall(bytes32 callId) external view returns (IPayPerCallV8.Call memory call) {
        if (shouldRevert) revert("no call");
        call.requestHash = requestHashes[callId];
    }
}

/// @notice The adapter is the only place where a proof meets the chain, so the tests
///         are all about one question: can a proof about something else be passed off
///         as a proof about this call? Every field the journal carries gets its own
///         rejection test, and the fuzz test pins the rule that a bad blob reads
///         `false` instead of reverting — the registry treats a revert as a verifier
///         failure, which would make a rejection indistinguishable from a bug.
contract Risc0ExecutionAdapterTest is Test {
    bytes32 constant IMAGE_ID = keccak256("image");
    bytes32 constant HANDLER_ID = keccak256("callguard.handler.ping/1");
    bytes32 constant CALL_ID = keccak256("call");
    bytes32 constant REQUEST_HASH = keccak256("ping");
    bytes32 constant RESPONSE_HASH = keccak256("pong");

    MockRisc0Verifier verifier;
    MockPayPerCall payPerCall;
    Risc0ExecutionAdapter adapter;

    function setUp() public {
        verifier = new MockRisc0Verifier();
        payPerCall = new MockPayPerCall();
        payPerCall.setRequestHash(CALL_ID, REQUEST_HASH);
        adapter = new Risc0ExecutionAdapter(
            address(verifier), address(payPerCall), IMAGE_ID, HANDLER_ID
        );
        // Accept exactly the digest a correct journal produces.
        bytes memory journal = _journal(CALL_ID, REQUEST_HASH, RESPONSE_HASH, HANDLER_ID);
        verifier.set(IMAGE_ID, sha256(journal));
    }

    function _journal(bytes32 callId, bytes32 requestHash, bytes32 responseHash, bytes32 handlerId)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encode(callId, requestHash, responseHash, handlerId);
    }

    function _proof(bytes memory journal) internal pure returns (bytes memory) {
        return abi.encode(bytes("seal"), journal);
    }

    function _validProof() internal pure returns (bytes memory) {
        return _proof(_journal(CALL_ID, REQUEST_HASH, RESPONSE_HASH, HANDLER_ID));
    }

    function test_acceptsValidProof() public view {
        assertTrue(adapter.verify(_validProof(), CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    function test_rejectsForeignCallId() public view {
        bytes memory blob = _proof(_journal(keccak256("other call"), REQUEST_HASH, RESPONSE_HASH, HANDLER_ID));
        assertFalse(adapter.verify(blob, CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    function test_rejectsForeignResponseHash() public view {
        bytes memory blob = _proof(_journal(CALL_ID, REQUEST_HASH, keccak256("pong!"), HANDLER_ID));
        assertFalse(adapter.verify(blob, CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    function test_rejectsRequestHashNotOnChain() public {
        payPerCall.setRequestHash(CALL_ID, keccak256("something else"));
        assertFalse(adapter.verify(_validProof(), CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    function test_rejectsUnknownHandler() public view {
        bytes memory blob = _proof(_journal(CALL_ID, REQUEST_HASH, RESPONSE_HASH, keccak256("other handler")));
        assertFalse(adapter.verify(blob, CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    function test_rejectsMissingCall() public {
        payPerCall.fail(true);
        assertFalse(adapter.verify(_validProof(), CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    function test_rejectsMalformedBlob() public view {
        assertFalse(adapter.verify(hex"", CALL_ID, keccak256("claim"), RESPONSE_HASH));
        assertFalse(adapter.verify(hex"deadbeef", CALL_ID, keccak256("claim"), RESPONSE_HASH));
        assertFalse(
            adapter.verify(abi.encode(uint256(1)), CALL_ID, keccak256("claim"), RESPONSE_HASH)
        );
    }

    function test_rejectsWrongJournalLength() public view {
        bytes memory blob = _proof(abi.encode(CALL_ID, REQUEST_HASH));
        assertFalse(adapter.verify(blob, CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    function test_rejectsVerifierRevert() public {
        verifier.fail(true);
        assertFalse(adapter.verify(_validProof(), CALL_ID, keccak256("claim"), RESPONSE_HASH));
    }

    function test_passesJournalDigestAndImageId() public view {
        bytes memory journal = _journal(CALL_ID, REQUEST_HASH, RESPONSE_HASH, HANDLER_ID);
        // The mock accepts one exact (imageId, journalDigest) pair, so a `true` here is
        // the assertion that the adapter computed sha256(journal) and passed `imageId`.
        assertTrue(adapter.verify(_proof(journal), CALL_ID, keccak256("claim"), RESPONSE_HASH));
        assertEq(verifier.expectedImageId(), IMAGE_ID);
        assertEq(verifier.expectedJournalDigest(), sha256(journal));
    }

    function test_ignoresClaimHash() public view {
        assertTrue(adapter.verify(_validProof(), CALL_ID, keccak256("claim a"), RESPONSE_HASH));
        assertTrue(adapter.verify(_validProof(), CALL_ID, keccak256("claim b"), RESPONSE_HASH));
    }

    function testFuzz_neverReverts(bytes calldata proof, bytes32 callId, bytes32 claimHash, bytes32 responseHash)
        public
    {
        try adapter.verify(proof, callId, claimHash, responseHash) returns (bool ok) {
            ok;
        } catch {
            fail();
        }
    }

    function test_registryModeIsProofAfterWiring() public {
        SLAEvidenceRegistry registry = new SLAEvidenceRegistry(address(this));
        bytes32 kind = keccak256("zk-execution");
        registry.setProofVerifier(kind, address(adapter));
        assertEq(uint256(registry.modeOf(kind)), 2, "proof mode");

        bytes32 claimHash = keccak256("claim");
        registry.anchor(CALL_ID, kind, claimHash, RESPONSE_HASH, _validProof());

        assertTrue(registry.isAnchored(CALL_ID, kind, claimHash));
        SLAEvidenceRegistry.Evidence memory record = registry.getEvidence(CALL_ID, kind);
        assertEq(record.verifier, address(adapter));
        assertEq(record.responseHash, RESPONSE_HASH);
    }

    function test_registryRejectsProofForOtherResponse() public {
        SLAEvidenceRegistry registry = new SLAEvidenceRegistry(address(this));
        bytes32 kind = keccak256("zk-execution");
        registry.setProofVerifier(kind, address(adapter));

        vm.expectRevert();
        registry.anchor(CALL_ID, kind, keccak256("claim"), keccak256("not the response"), _validProof());
    }
}

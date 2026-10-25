// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

import { HonkVerifier } from "../contracts/zk/KeccakClaimVerifier.sol";
import { ZkClaimAdapter } from "../contracts/zk/ZkClaimAdapter.sol";
import { SLAEvidenceRegistry } from "../contracts/SLAEvidenceRegistry.sol";

/// @notice B3b zk path end to end: a Noir/UltraHonk proof says a private body hashes to
///         the committed response and starts with a declared byte, for this call id.
///         The adapter turns that into the registry's `IEvidenceVerifier` surface, so a
///         claim can be anchored without any allowlisted key in the loop.
contract ZkClaimEvidenceTest is Test {
    /// The live v8 call this fixture was produced for, and its committed response
    /// (keccak256("pong")). Taken from the v8 subgraph, not invented.
    bytes32 internal constant CALL_ID = 0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265;
    bytes32 internal constant RESPONSE_HASH = 0x188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d;
    uint8 internal constant FIRST_BYTE = 0x70; // "p" of "pong"
    bytes32 internal constant CLAIM_HASH = keccak256("envelope-digest-for-this-claim");
    bytes32 internal constant ZK_KIND = keccak256("zk-constraint");

    address internal admin = address(0xA11CE);

    HonkVerifier internal honk;
    ZkClaimAdapter internal adapter;
    SLAEvidenceRegistry internal registry;
    bytes internal honkProof;

    function setUp() public {
        honk = new HonkVerifier();
        adapter = new ZkClaimAdapter(address(honk));
        registry = new SLAEvidenceRegistry(admin);
        vm.prank(admin);
        registry.setProofVerifier(ZK_KIND, address(adapter));

        honkProof = vm.readFileBinary("test/fixtures/zk/keccak-call.proof");
    }

    function _blob(uint8 firstByte) internal view returns (bytes memory) {
        return abi.encode(firstByte, honkProof);
    }

    // ------------------------------------------------------------------
    // Adapter: the proof is bound to one call and one response
    // ------------------------------------------------------------------

    function test_adapter_acceptsProofForTheLiveCall() public view {
        assertTrue(adapter.verify(_blob(FIRST_BYTE), CALL_ID, CLAIM_HASH, RESPONSE_HASH));
    }

    function test_adapter_rejectsProofForAnotherCall() public view {
        // Same response body, different call id: without this check a proof could be
        // replayed onto any call that happens to share the response.
        assertFalse(adapter.verify(_blob(FIRST_BYTE), bytes32(uint256(1)), CLAIM_HASH, RESPONSE_HASH));
    }

    function test_adapter_rejectsProofForAnotherResponse() public view {
        assertFalse(adapter.verify(_blob(FIRST_BYTE), CALL_ID, CLAIM_HASH, keccak256("pongg")));
    }

    function test_adapter_rejectsUnmetPredicate() public view {
        // The proof only forces body[0] == "p"; presenting it for "q" must fail.
        assertFalse(adapter.verify(_blob(0x71), CALL_ID, CLAIM_HASH, RESPONSE_HASH));
    }

    function test_adapter_rejectsMalformedBlob() public view {
        assertFalse(adapter.verify("", CALL_ID, CLAIM_HASH, RESPONSE_HASH));
        assertFalse(adapter.verify(abi.encode(FIRST_BYTE), CALL_ID, CLAIM_HASH, RESPONSE_HASH));
    }

    function test_adapter_rejectsTruncatedProof() public view {
        bytes memory cut = new bytes(honkProof.length - 32);
        for (uint256 i = 0; i < cut.length; i++) cut[i] = honkProof[i];
        assertFalse(adapter.verify(abi.encode(FIRST_BYTE, cut), CALL_ID, CLAIM_HASH, RESPONSE_HASH));
    }

    // ------------------------------------------------------------------
    // Registry: proof-verified claims anchor without a trusted key
    // ------------------------------------------------------------------

    function test_registry_anchorsProofVerifiedClaim() public {
        vm.expectEmit(true, true, false, true, address(registry));
        emit SLAEvidenceRegistry.EvidenceAnchored(
            CALL_ID, ZK_KIND, CLAIM_HASH, RESPONSE_HASH, address(adapter)
        );
        registry.anchor(CALL_ID, ZK_KIND, CLAIM_HASH, RESPONSE_HASH, _blob(FIRST_BYTE));

        assertTrue(registry.isAnchored(CALL_ID, ZK_KIND, CLAIM_HASH));
        SLAEvidenceRegistry.Evidence memory record = registry.getEvidence(CALL_ID, ZK_KIND);
        assertEq(record.verifier, address(adapter));
        assertEq(record.responseHash, RESPONSE_HASH);
    }

    function test_registry_rejectsClaimBoundToAnotherCall() public {
        vm.expectRevert(SLAEvidenceRegistry.ProofRejected.selector);
        registry.anchor(bytes32(uint256(2)), ZK_KIND, CLAIM_HASH, RESPONSE_HASH, _blob(FIRST_BYTE));
    }

    function test_registry_rejectsSecondClaimForSameCallAndKind() public {
        registry.anchor(CALL_ID, ZK_KIND, CLAIM_HASH, RESPONSE_HASH, _blob(FIRST_BYTE));
        vm.expectRevert(SLAEvidenceRegistry.AlreadyAnchored.selector);
        registry.anchor(CALL_ID, ZK_KIND, keccak256("other-claim"), RESPONSE_HASH, _blob(FIRST_BYTE));
    }
}

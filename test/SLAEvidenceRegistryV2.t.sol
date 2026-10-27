// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

import { SLAEvidenceRegistryV2 } from "../contracts/SLAEvidenceRegistryV2.sol";

/// @notice v2 evidence anchoring: the claim's statement and assumptions become
///         contract data next to the claim and response digests, so a dispute
///         reads what was claimed, not only which hash was vouched for.
contract SLAEvidenceRegistryV2Test is Test {
    SLAEvidenceRegistryV2 internal registry;

    address internal admin = address(0xA11CE);
    address internal attestor;
    uint256 internal attestorKey;

    bytes32 internal constant CALL_ID = keccak256("call-1");
    bytes32 internal constant RESPONSE = keccak256("pong");
    bytes32 internal constant CLAIM = keccak256("claim-1");
    bytes32 internal constant STATEMENT = keccak256("statement-1");
    bytes32 internal constant ASSUMPTION = keccak256("assumption-1");
    bytes32 internal constant ZK_EXEC = keccak256("zk-execution");

    // v1 encoding, kept only to prove a v1 signature cannot replay into v2.
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant V1_EVIDENCE_TYPEHASH =
        keccak256("Evidence(bytes32 callId,bytes32 kind,bytes32 claimHash,bytes32 responseHash)");
    bytes32 private constant NAME_HASH = keccak256("CallGuardEvidence");
    bytes32 private constant V1_VERSION_HASH = keccak256("1");

    function setUp() public {
        (attestor, attestorKey) = makeAddrAndKey("attestor");

        registry = new SLAEvidenceRegistryV2(admin);
        vm.prank(admin);
        // Task brief: kind must be wired so the anchor test can sign; EmptyStatement
        // is checked before the mode lookup anyway.
        registry.setSignatureVerifier(ZK_EXEC, attestor, true);
        vm.warp(1_800_000_000);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _digest()
        internal
        view
        returns (bytes32)
    {
        return registry.anchorDigest(CALL_ID, ZK_EXEC, CLAIM, RESPONSE, STATEMENT, ASSUMPTION);
    }

    function _sign() internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attestorKey, _digest());
        return abi.encodePacked(r, s, v);
    }

    // ------------------------------------------------------------------
    // Digest binding
    // ------------------------------------------------------------------

    /// @notice Rebuilds the four-field v1 digest with the v1 typehash and version,
    ///         over the v2 contract's own domain (address + chainid), so a
    ///         signature made for v1 cannot recover an allowlisted key in v2.
    function _v1Digest() internal view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, V1_VERSION_HASH, block.chainid, address(registry))
        );
        bytes32 structHash = keccak256(abi.encode(V1_EVIDENCE_TYPEHASH, CALL_ID, ZK_EXEC, CLAIM, RESPONSE));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function test_digestMovesWhenOnlyTheStatementMoves() public view {
        bytes32 a = registry.anchorDigest(CALL_ID, ZK_EXEC, CLAIM, RESPONSE, STATEMENT, ASSUMPTION);
        bytes32 b = registry.anchorDigest(CALL_ID, ZK_EXEC, CLAIM, RESPONSE, keccak256("other sentence"), ASSUMPTION);
        assertTrue(a != b);
    }

    function test_signatureOverNewDigestIsAccepted() public {
        bytes32 digest = registry.anchorDigest(CALL_ID, ZK_EXEC, CLAIM, RESPONSE, STATEMENT, ASSUMPTION);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attestorKey, digest);
        registry.anchor(CALL_ID, ZK_EXEC, CLAIM, RESPONSE, STATEMENT, ASSUMPTION, abi.encodePacked(r, s, v));
        assertTrue(registry.isAnchored(CALL_ID, ZK_EXEC, CLAIM));
    }

    function test_v1DigestSignatureIsRejected() public {
        bytes32 v1 = _v1Digest();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attestorKey, v1);
        vm.expectRevert(SLAEvidenceRegistryV2.VerifierNotAllowed.selector);
        registry.anchor(CALL_ID, ZK_EXEC, CLAIM, RESPONSE, STATEMENT, ASSUMPTION, abi.encodePacked(r, s, v));
    }

    // ------------------------------------------------------------------
    // Anchoring
    // ------------------------------------------------------------------

    function test_anchorRejectsZeroStatementHash() public {
        vm.prank(attestor);
        vm.expectRevert(SLAEvidenceRegistryV2.EmptyStatement.selector);
        registry.anchor(CALL_ID, ZK_EXEC, CLAIM, RESPONSE, bytes32(0), ASSUMPTION, hex"");
    }

    function test_anchorStoresBothClaimHashes() public {
        bytes memory sig = _sign();
        vm.prank(attestor);
        registry.anchor(CALL_ID, ZK_EXEC, CLAIM, RESPONSE, STATEMENT, ASSUMPTION, sig);
        SLAEvidenceRegistryV2.Evidence memory e = registry.getEvidence(CALL_ID, ZK_EXEC);
        assertEq(e.statementHash, STATEMENT);
        assertEq(e.assumptionHash, ASSUMPTION);
        assertEq(e.responseHash, RESPONSE);
    }
}

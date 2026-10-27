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

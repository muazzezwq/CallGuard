// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

import { HonkVerifier } from "../contracts/zk/KeccakClaimVerifier.sol";

/// @notice Raw verifier check: the fixture proof really does satisfy the circuit, and a
///         tampered proof does not. The adapter tests cover the call binding around it.
contract HonkKeccakClaimTest is Test {
    HonkVerifier internal verifier;
    bytes internal proof;
    bytes32[] internal publicInputs;

    function setUp() public {
        verifier = new HonkVerifier();
        proof = vm.readFileBinary("test/fixtures/zk/keccak-call.proof");

        bytes memory raw = vm.readFileBinary("test/fixtures/zk/keccak-call.inputs");
        require(raw.length % 32 == 0, "public inputs must be 32-byte words");
        uint256 count = raw.length / 32;
        publicInputs = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            bytes32 word;
            assembly {
                word := mload(add(add(raw, 0x20), mul(i, 0x20)))
            }
            publicInputs[i] = word;
        }
    }

    function test_verifiesProofForTheLiveCallPayload() public view {
        assertTrue(verifier.verify(proof, publicInputs));
    }

    /// @dev The generated verifier reports failure by reverting (ShpleminiFailed), so a
    ///      rejection is a revert here; the adapter is what turns it into `false`.
    function test_rejectsTamperedProof() public {
        bytes memory tampered = proof;
        tampered[tampered.length - 1] = bytes1(uint8(tampered[tampered.length - 1]) ^ 0x01);
        vm.expectRevert();
        verifier.verify(tampered, publicInputs);
    }

    function test_rejectsWrongPublicInput() public {
        bytes32[] memory moved = publicInputs;
        moved[0] = bytes32(uint256(0x8d)); // call id first byte changed
        vm.expectRevert();
        verifier.verify(proof, moved);
    }

    function test_publicInputLayoutIsCallIdThenResponseThenPredicate() public view {
        assertEq(publicInputs.length, 65);
        assertEq(publicInputs[0], bytes32(uint256(0x8c)));
        assertEq(publicInputs[32], bytes32(uint256(0x18)));
        assertEq(publicInputs[64], bytes32(uint256(0x70)));
    }

    function test_snapshotProofSize() public {
        emit log_named_uint("proof bytes", proof.length);
        emit log_named_uint("public inputs", publicInputs.length);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ControlID } from "risc0-ethereum/contracts/src/groth16/ControlID.sol";
import { IRiscZeroVerifier } from "risc0-ethereum/contracts/src/IRiscZeroVerifier.sol";
import { RiscZeroGroth16Verifier } from "risc0-ethereum/contracts/src/groth16/RiscZeroGroth16Verifier.sol";

/// @notice The RISC Zero Groth16 verifier is vendored, not written here, so the only
///         things worth testing are the two that can silently go wrong: the version
///         constants we deploy with drifting from the vendored source, and the verifier
///         being unusable on Arc (it must deploy and reject a seal rather than revert
///         for another reason).
contract Risc0VerifierTest is Test {
    bytes32 constant CONTROL_ROOT = 0xa54dc85ac99f851c92d7c96d7318af41dbe7c0194edfcc37eb4d422a998c1f56;
    bytes32 constant BN254_CONTROL_ID = 0x04446e66d300eb7fb45c9726bb53c793dda407a62e9601618bb43c5c14657ac0;

    function test_pinnedConstantsMatchVendoredSource() public pure {
        assertEq(ControlID.CONTROL_ROOT, CONTROL_ROOT);
        assertEq(ControlID.BN254_CONTROL_ID, BN254_CONTROL_ID);
    }

    function test_rejectsGarbageSeal() public {
        IRiscZeroVerifier verifier = new RiscZeroGroth16Verifier(CONTROL_ROOT, BN254_CONTROL_ID);
        vm.expectRevert();
        verifier.verify(hex"deadbeef", bytes32(uint256(1)), bytes32(uint256(2)));
    }
}

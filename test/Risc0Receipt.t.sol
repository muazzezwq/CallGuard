// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { ControlID } from "risc0-ethereum/contracts/src/groth16/ControlID.sol";
import { IRiscZeroVerifier } from "risc0-ethereum/contracts/src/IRiscZeroVerifier.sol";
import { IRiscZeroSelectable } from "risc0-ethereum/contracts/src/IRiscZeroSelectable.sol";
import { RiscZeroGroth16Verifier } from "risc0-ethereum/contracts/src/groth16/RiscZeroGroth16Verifier.sol";
import { VerificationFailed } from "risc0-ethereum/contracts/src/IRiscZeroVerifier.sol";

/// @notice The committed receipt has to verify against the vendored verifier before anyone
///         anchors it on chain. If this test fails, the proof and the constants disagree and the
///         chain would reject the anchor; if this test passes and the chain still rejects, the
///         difference is in the chain, not in the receipt.
contract Risc0ReceiptTest is Test {
    bytes32 constant CONTROL_ROOT = 0xa54dc85ac99f851c92d7c96d7318af41dbe7c0194edfcc37eb4d422a998c1f56;
    bytes32 constant BN254_CONTROL_ID = 0x04446e66d300eb7fb45c9726bb53c793dda407a62e9601618bb43c5c14657ac0;
    // `Digest::from(PING_ID)` bytes: eight little-endian words, which is what the guest id is.
    bytes32 constant IMAGE_ID = 0x5fc483d58bc5eb7aa650ff3df138de5d435d97f39e2c06f74e7b40c48504b9fa;
    // sha256 of the 128-byte journal committed with the seal.
    bytes32 constant JOURNAL_DIGEST = 0xa86c1ab94f589c55348d7ae47ff9024009fe0d91db100499d0660227c4893694;

    function verifier() internal returns (IRiscZeroVerifier) {
        return new RiscZeroGroth16Verifier(CONTROL_ROOT, BN254_CONTROL_ID);
    }

    function sealedBytes() internal view returns (bytes memory) {
        return vm.readFileBinary("test/fixtures/zk-execution/seal.bin");
    }

    function test_committedSealVerifiesAgainstVendoredVerifier() public {
        bytes memory seal = sealedBytes();
        bytes memory journal = vm.readFileBinary("test/fixtures/zk-execution/journal.bin");
        assertEq(seal.length, 260, "seal is selector + Groth16 proof");
        assertEq(journal.length, 128, "journal is four 32-byte fields");
        assertEq(sha256(journal), JOURNAL_DIGEST, "journal digest pins the journal");

        // Reverts VerificationFailed() when the pairing check fails.
        verifier().verify(seal, IMAGE_ID, JOURNAL_DIGEST);
    }

    function test_selectorMatchesTheSeal() public {
        bytes memory seal = sealedBytes();
        bytes4 embedded;
        assembly {
            embedded := mload(add(seal, 32))
        }
        assertEq(embedded, IRiscZeroSelectable(address(verifier())).SELECTOR(), "seal selector");
    }

    function test_committedImageIdIsTheOneTheSealProves() public {
        bytes memory seal = sealedBytes();
        assertEq(
            vm.trim(vm.readFile("test/fixtures/zk-execution/image_id.txt")),
            "0x5fc483d58bc5eb7aa650ff3df138de5d435d97f39e2c06f74e7b40c48504b9fa",
            "image id fixture"
        );
        verifier().verify(seal, IMAGE_ID, JOURNAL_DIGEST);
    }

    /// The words of a guest id are little-endian. Reading them big-endian yields an id that looks
    /// like a hash but commits to nothing, and the chain only says `VerificationFailed`. This is
    /// the regression: the same seal must be rejected against the misread id.
    function test_wordSwappedImageIdIsRejected() public {
        bytes memory seal = sealedBytes();
        bytes memory big = abi.encodePacked(IMAGE_ID);
        bytes memory misread = new bytes(32);
        for (uint256 i = 0; i < 8; i++) {
            misread[i * 4 + 0] = big[i * 4 + 3];
            misread[i * 4 + 1] = big[i * 4 + 2];
            misread[i * 4 + 2] = big[i * 4 + 1];
            misread[i * 4 + 3] = big[i * 4 + 0];
        }
        assertEq(bytes32(misread), 0xd583c45f7aebc58b3dff50a65dde38f1f3975d43f7062c9ec4407b4efab90485, "the old, wrong id");
        IRiscZeroVerifier v = verifier();
        vm.expectRevert(VerificationFailed.selector);
        v.verify(seal, bytes32(misread), JOURNAL_DIGEST);
    }
}

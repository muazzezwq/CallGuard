// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IEvidenceVerifier } from "../SLAEvidenceRegistry.sol";

interface IVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

/// @title ZkClaimAdapter
/// @notice Presents an UltraHonk proof about a call's committed response in the shape
///         `SLAEvidenceRegistry` expects, so a `zk-constraint` claim anchors on proof
///         verification instead of on an allowlisted signing key.
/// @dev    The circuit's public inputs are, in order: `call_id` (32 bytes as 32 field
///         elements), `response_hash` (32 bytes as 32 elements), and the predicate's
///         public byte. They are rebuilt here from the three hashes the registry already
///         has, so a caller cannot present a proof about one call for another: changing
///         `callId`, `responseHash` or the predicate changes a public input and the
///         pairing check fails.
///
///         `claimHash` is deliberately not part of the circuit. It commits to the
///         off-chain envelope (statement, assumptions, issuedAt), which is metadata about
///         how the claim is described, not a fact the circuit can constrain. The registry
///         stores it next to the proof so the description cannot be swapped afterwards.
///
///         Reverts from the verifier are turned into `false`: the generated verifier
///         signals a failed pairing check by reverting, and the registry only needs a
///         boolean.
contract ZkClaimAdapter is IEvidenceVerifier {
    uint256 private constant HASH_WORDS = 32;
    uint256 private constant PUBLIC_INPUTS = HASH_WORDS * 2 + 1;

    IVerifier public immutable verifier;

    error InvalidVerifier();

    constructor(address verifierAddress) {
        if (verifierAddress == address(0)) revert InvalidVerifier();
        verifier = IVerifier(verifierAddress);
    }

    /// @param proof `abi.encode(uint8 firstByte, bytes honkProof)`.
    function verify(bytes calldata proof, bytes32 callId, bytes32 claimHash, bytes32 responseHash)
        external
        view
        returns (bool)
    {
        claimHash; // named for the registry's interface; it is not a circuit input

        // A malformed blob must read as "not proven" rather than bubbling a decode revert,
        // because the registry treats a revert as a verifier failure, not a rejection.
        if (proof.length < 96) return false;

        uint8 firstByte;
        bytes memory honkProof;
        try this.decodeBlob(proof) returns (uint8 byte0, bytes memory raw) {
            firstByte = byte0;
            honkProof = raw;
        } catch {
            return false;
        }

        bytes32[] memory publicInputs = new bytes32[](PUBLIC_INPUTS);
        for (uint256 i = 0; i < HASH_WORDS; i++) {
            publicInputs[i] = bytes32(uint256(uint8(callId[i])));
            publicInputs[HASH_WORDS + i] = bytes32(uint256(uint8(responseHash[i])));
        }
        publicInputs[PUBLIC_INPUTS - 1] = bytes32(uint256(firstByte));

        try verifier.verify(honkProof, publicInputs) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }

    /// @dev Exposed only so `verify` can catch a bad blob; not part of the verifier surface.
    function decodeBlob(bytes calldata proof) external pure returns (uint8, bytes memory) {
        return abi.decode(proof, (uint8, bytes));
    }
}

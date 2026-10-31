// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IEvidenceVerifier } from "../SLAEvidenceRegistry.sol";
import { IPayPerCallV8 } from "../interfaces/IPayPerCallV8.sol";
import { IRiscZeroVerifier } from "risc0-ethereum/contracts/src/IRiscZeroVerifier.sol";

/// @title Risc0ExecutionAdapter
/// @notice Presents a RISC Zero zkVM receipt about a call's execution in the shape
///         `SLAEvidenceRegistry` expects, so a `zk-execution` claim anchors on proof
///         verification instead of on an allowlisted signing key.
/// @dev    What the proof says, exactly: a program with image id `imageId` ran on a
///         private request whose keccak256 is `requestHash` and committed a journal
///         naming this call and this response, with the body hashing to `responseHash`.
///         It says nothing about whether the body is a *correct* answer — only a
///         deterministic handler can make that claim at all, and the envelope's
///         statement and assumptions carry the scope.
///
///         The binding is read from chain, never from the caller: `requestHash` comes
///         from `PayPerCallV8.getCall(callId)`, so a proof about a different request can
///         not be presented as a proof about this call. `callId`, `responseHash` and
///         `handlerId` are each compared against the journal for the same reason.
///
///         `claimHash` is committed by the guest as the journal's fifth word, so the
///         seal covers the envelope digest (statement + assumptions) as well. An
///         envelope swapped for a different one no longer verifies: the journal it
///         would have to carry is not the journal this image produced. The guest takes
///         `claim_hash` as private input, so the description is not public until the
///         journal is published alongside the anchor.
contract Risc0ExecutionAdapter is IEvidenceVerifier {
    /// @notice Groth16 verifier for the pinned RISC Zero version. Root of trust is this
    ///         bytecode: if it accepts the seal, the execution happened.
    IRiscZeroVerifier public immutable verifier;
    /// @notice The v8 contract the request commitment is read from.
    IPayPerCallV8 public immutable payPerCall;
    /// @notice Guest program identity. A different program produces a different id and
    ///         the verifier rejects the seal.
    bytes32 public immutable imageId;
    /// @notice The handler the guest implements, so a future handler cannot be confused
    ///         with this one inside the same journal shape.
    bytes32 public immutable handlerId;

    error ZeroAddress();
    error ZeroDigest();

    constructor(address verifierAddress, address payPerCallAddress, bytes32 imageId_, bytes32 handlerId_) {
        if (verifierAddress == address(0) || payPerCallAddress == address(0)) revert ZeroAddress();
        if (imageId_ == bytes32(0) || handlerId_ == bytes32(0)) revert ZeroDigest();
        verifier = IRiscZeroVerifier(verifierAddress);
        payPerCall = IPayPerCallV8(payPerCallAddress);
        imageId = imageId_;
        handlerId = handlerId_;
    }

    /// @param proof `abi.encode(bytes seal, bytes journal)`.
    function verify(bytes calldata proof, bytes32 callId, bytes32 claimHash, bytes32 responseHash)
        external
        view
        returns (bool)
    {
        // A malformed blob must read as "not proven" rather than bubbling a decode revert,
        // because the registry treats a revert as a verifier failure, not a rejection.
        if (proof.length < 96) return false;

        bytes memory seal;
        bytes memory journal;
        try this.decodeProof(proof) returns (bytes memory seal_, bytes memory journal_) {
            seal = seal_;
            journal = journal_;
        } catch {
            return false;
        }

        // 5 × bytes32, ABI encoded: callId, requestHash, responseHash, handlerId, claimHash.
        if (journal.length != 160) return false;

        bytes32 journalCallId;
        bytes32 journalRequestHash;
        bytes32 journalResponseHash;
        bytes32 journalHandler;
        bytes32 journalClaimHash;
        (journalCallId, journalRequestHash, journalResponseHash, journalHandler, journalClaimHash) =
            abi.decode(journal, (bytes32, bytes32, bytes32, bytes32, bytes32));

        if (journalCallId != callId) return false;
        if (journalResponseHash != responseHash) return false;
        if (journalHandler != handlerId) return false;
        // The seal covers the envelope digest: a different statement means a journal this
        // image never produced, so the verifier rejects the proof below.
        if (journalClaimHash != claimHash) return false;

        bytes32 onChainRequestHash;
        try payPerCall.getCall(callId) returns (IPayPerCallV8.Call memory record) {
            onChainRequestHash = record.requestHash;
        } catch {
            return false;
        }
        if (onChainRequestHash == bytes32(0) || onChainRequestHash != journalRequestHash) return false;

        // `verify` returns nothing and reverts on failure, so a successful call is the
        // acceptance signal; the journal digest is what pins the observed output.
        try verifier.verify(seal, imageId, sha256(journal)) {
            return true;
        } catch {
            return false;
        }
    }

    /// @dev Exposed only so `verify` can catch a bad blob; not part of the verifier surface.
    function decodeProof(bytes calldata proof) external pure returns (bytes memory, bytes memory) {
        return abi.decode(proof, (bytes, bytes));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SLAProvenance } from "../SLAProvenance.sol";

/// @title SLAProvenanceAdapter
/// @notice Proof-mode verifier for the `witness` evidence kind on
///         `SLAEvidenceRegistryV2`.
/// @dev    The claim this checks is narrow: an allowlisted attestor recorded this
///         call's payload, and that payload hash is the response hash the dispute is
///         about. It says nothing about whether the answer is correct, and nothing
///         about whether the attestor is independent of the provider — both are
///         assumptions the envelope names.
///
///         Everything the check needs is already on chain in `SLAProvenance`, so the
///         proof blob is unused and callers anchor with empty bytes.
///
///         The allowlist is read at verification time, not at recording time, so a
///         revoked key cannot anchor new claims. Records it already attested stay
///         readable: revocation stops new claims, it does not rewrite history.
///
///         A refusal returns `false` instead of reverting. The registry maps a false
///         answer to `ProofRejected` and a revert to `VerifierFailed`, and those are
///         different sentences to a reader: one means the claim did not hold, the
///         other means the verifier itself broke.
contract SLAProvenanceAdapter {
    error InvalidAddress();

    /// @notice The provenance registry this adapter reads. Immutable, because a
    ///         mutable pointer would let an owner change what "verified" means for a
    ///         kind that is already wired.
    address public immutable provenance;

    constructor(address provenance_) {
        if (provenance_ == address(0)) revert InvalidAddress();
        provenance = provenance_;
    }

    /// @notice `IEvidenceVerifier.verify`. `proof` and `claimHash` are unused: the
    ///         commitment digest is not reconstructable on chain, and the answer comes
    ///         from `SLAProvenance` rather than from bytes the caller supplies.
    function verify(bytes calldata, bytes32 callId, bytes32, bytes32 responseHash) external view returns (bool) {
        // A misconfigured address would make the struct decode revert on empty
        // returndata, so it is answered as "not proven" rather than as a broken
        // verifier.
        if (provenance.code.length == 0) return false;

        SLAProvenance.Provenance memory record = SLAProvenance(provenance).getProvenance(callId);
        if (record.recordedAt == 0) return false;
        if (record.payloadHash != responseHash) return false;
        return SLAProvenance(provenance).isAttestor(record.attestor);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SLAEvidenceRegistryV2
/// @notice Anchors a named claim about a call — now including what the claim
///         states and which assumptions it rests on.
/// @dev    v1 stored only `(claimHash, responseHash)`; v2 adds `statementHash`
///         and `assumptionHash`, so the claim's words are contract data a
///         dispute can read instead of off-chain-only envelope content. The
///         digest grows to six fields and the version byte bumps to "2".
///
///         As in v1, the registry stores a digest, not a verdict about truth.
///         Anchoring proves that a verifier accepted the artifact for this
///         claim at this time; it does not prove the statement is true.
///
///         Two verification modes, because the two artifact families differ in
///         what an EVM can check:
///
///         - `Signature`: the proof was verified off chain (Nitro signs with
///           P-384, which has no EVM precompile), so an allowlisted verifier
///           key signs the claim. Root of trust: that key.
///         - `Proof`: the verifier contract checks the proof on chain. Root of
///           trust: the verifier bytecode.
contract SLAEvidenceRegistryV2 {
    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotOwner();
    error InvalidAddress();
    error InvalidSignature();
    error VerifierNotAllowed();
    error NoVerifierForKind();
    error AlreadyAnchored();
    error EmptyHash();
    error EmptyStatement();
    error ProofRejected();
    error VerifierFailed();

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event OwnerChanged(address indexed previousOwner, address indexed newOwner);
    event VerifierChanged(bytes32 indexed kind, address indexed verifier, VerifierMode mode, bool allowed, bool bindsResponse);
    event EvidenceAnchored(
        bytes32 indexed callId,
        bytes32 indexed kind,
        bytes32 claimHash,
        bytes32 responseHash,
        address verifier
    );

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum VerifierMode {
        None,
        Signature,
        Proof
    }

    struct Evidence {
        bytes32 kind;
        bytes32 claimHash;
        bytes32 responseHash;
        bytes32 statementHash;
        bytes32 assumptionHash;
        address verifier;
        uint64 anchoredAt;
    }

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant EVIDENCE_TYPEHASH = keccak256(
        "Evidence(bytes32 callId,bytes32 kind,bytes32 claimHash,bytes32 responseHash,bytes32 statementHash,bytes32 assumptionHash)"
    );
    bytes32 private constant NAME_HASH = keccak256("CallGuardEvidence");
    bytes32 private constant VERSION_HASH = keccak256("2");

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    address public owner;

    mapping(bytes32 => VerifierMode) public modeOf;
    mapping(bytes32 => mapping(address => bool)) public signatureVerifier;
    mapping(bytes32 => address) public proofVerifier;
    mapping(bytes32 => bool) public bindsResponse;
    mapping(bytes32 => mapping(bytes32 => Evidence)) private _evidence;
    mapping(bytes32 => mapping(bytes32 => bool)) private _anchored;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert InvalidAddress();
        owner = initialOwner;
        emit OwnerChanged(address(0), initialOwner);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setOwner(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Allows or revokes a key that vouches for off-chain-verified claims.
    /// @dev    Revoking stops new anchors for that kind and leaves history intact.
    ///         A signature-mode digest already covers `responseHash`, so
    ///         `bindsResponse` is true by construction for that mode; `bound`
    ///         in DisputeV4 still requires `Proof` mode, so this changes no verdict.
    function setSignatureVerifier(bytes32 kind, address verifier, bool allowed) external onlyOwner {
        if (verifier == address(0)) revert InvalidAddress();
        if (allowed) modeOf[kind] = VerifierMode.Signature;
        signatureVerifier[kind][verifier] = allowed;
        // Only grant the flag, never revoke it here: revoking an old signature key
        // says nothing about the proof wiring that `setProofVerifier` recorded, and
        // stamping `true` on a `Proof`-mode kind would tell `DisputeV4` that a
        // verifier the owner recorded as non-binding does bind the response.
        if (allowed) bindsResponse[kind] = true;
        emit VerifierChanged(kind, verifier, modeOf[kind], allowed, bindsResponse[kind]);
    }

    /// @notice Points a kind at a verifier contract that checks proofs on chain, and
    ///         records whether that proof binds the call's `responseHash`.
    /// @dev    `bindsResponse` is the owner's assertion, checked against the adapter's
    ///         `verify` (which reads the journal's `callId` and `responseHash`). The
    ///         registry does not derive this flag and cannot check it on its own; it
    ///         only records what the owner attests about the verifier it installed.
    function setProofVerifier(bytes32 kind, address verifier, bool bindsResponse_) external onlyOwner {
        if (verifier == address(0)) revert InvalidAddress();
        modeOf[kind] = VerifierMode.Proof;
        proofVerifier[kind] = verifier;
        bindsResponse[kind] = bindsResponse_;
        emit VerifierChanged(kind, verifier, VerifierMode.Proof, true, bindsResponse_);
    }

    // ---------------------------------------------------------------------
    // Anchoring
    // ---------------------------------------------------------------------

    /// @notice Anchors one claim about one call.
    /// @param callId         The PayPerCallV8 call id the claim is about.
    /// @param kind           keccak256 of the claim kind, e.g. `keccak256("zk-execution")`.
    /// @param claimHash      Digest of the off-chain evidence envelope (proof bytes excluded).
    /// @param responseHash   The `responseHash` committed for the call; keeps the claim
    ///                       tied to the body the provider actually signed.
    /// @param statementHash  Digest of what the claim states.
    /// @param assumptionHash Digest of the assumptions the claim rests on.
    /// @param proof          Signature or proof bytes, depending on the kind's mode.
    function anchor(
        bytes32 callId,
        bytes32 kind,
        bytes32 claimHash,
        bytes32 responseHash,
        bytes32 statementHash,
        bytes32 assumptionHash,
        bytes calldata proof
    ) external {
        if (callId == bytes32(0) || claimHash == bytes32(0) || responseHash == bytes32(0)) {
            revert EmptyHash();
        }
        if (statementHash == bytes32(0) || assumptionHash == bytes32(0)) revert EmptyStatement();
        if (_anchored[callId][kind]) revert AlreadyAnchored();

        VerifierMode mode = modeOf[kind];
        if (mode == VerifierMode.None) revert NoVerifierForKind();

        address verifier;
        if (mode == VerifierMode.Signature) {
            verifier = _recoverSigner(
                anchorDigest(callId, kind, claimHash, responseHash, statementHash, assumptionHash), proof
            );
            if (!signatureVerifier[kind][verifier]) revert VerifierNotAllowed();
        } else {
            verifier = proofVerifier[kind];
            bool accepted;
            try IEvidenceVerifier(verifier).verify(proof, callId, claimHash, responseHash) returns (bool result) {
                accepted = result;
            } catch {
                revert VerifierFailed();
            }
            if (!accepted) revert ProofRejected();
        }

        _evidence[callId][kind] = Evidence({
            kind: kind,
            claimHash: claimHash,
            responseHash: responseHash,
            statementHash: statementHash,
            assumptionHash: assumptionHash,
            verifier: verifier,
            anchoredAt: uint64(block.timestamp)
        });
        _anchored[callId][kind] = true;

        emit EvidenceAnchored(callId, kind, claimHash, responseHash, verifier);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice EIP-712 digest a signature-mode verifier must sign. Exposed so clients
    ///         cannot guess the encoding wrong.
    function anchorDigest(
        bytes32 callId,
        bytes32 kind,
        bytes32 claimHash,
        bytes32 responseHash,
        bytes32 statementHash,
        bytes32 assumptionHash
    ) public view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this))
        );
        bytes32 structHash =
            keccak256(abi.encode(EVIDENCE_TYPEHASH, callId, kind, claimHash, responseHash, statementHash, assumptionHash));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    function getEvidence(bytes32 callId, bytes32 kind) external view returns (Evidence memory) {
        return _evidence[callId][kind];
    }

    /// @notice True when the stored claim for this `(callId, kind)` is exactly `claimHash`.
    function isAnchored(bytes32 callId, bytes32 kind, bytes32 claimHash) external view returns (bool) {
        return _anchored[callId][kind] && _evidence[callId][kind].claimHash == claimHash;
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _recoverSigner(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidSignature();
        // Reject the upper half of the curve order: a malleable signature would let a
        // second encoding of the same signature pass a bytes-equality check.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert InvalidSignature();
        }
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }
}

/// @notice Minimal verifier surface: the registry only needs "did this proof pass".
interface IEvidenceVerifier {
    function verify(bytes calldata proof, bytes32 callId, bytes32 claimHash, bytes32 responseHash)
        external
        returns (bool);
}

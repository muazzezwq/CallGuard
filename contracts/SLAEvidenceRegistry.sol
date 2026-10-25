// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SLAEvidenceRegistry
/// @notice Anchors a named claim about a call, together with who vouched for it.
/// @dev    The receipt binds a provider to a `responseHash`; `SLAProvenance` records
///         that a witness saw the payload. Neither says anything about execution. This
///         registry is the additive slot for stronger artifacts — a Nitro attestation
///         document, a zk proof — without touching `PayPerCallV8`, `ServiceRegistryV8`
///         or `DisputeV3`.
///
///         Two verification modes, because the two artifact families differ in what an
///         EVM can check:
///
///         - `Signature`: the proof was verified off chain (Nitro signs with P-384,
///           which has no EVM precompile), so an allowlisted verifier key signs the
///           claim. Root of trust: that key.
///         - `Proof`: the verifier contract checks the proof on chain (bn254 pairing
///           is available on Arc). Root of trust: the verifier bytecode.
///
///         The registry stores a digest, not a verdict about truth. A claim is one
///         `(callId, kind)` pair, and the stored `claimHash` is the off-chain envelope
///         digest, so the artifact itself can live anywhere and stay verifiable.
contract SLAEvidenceRegistry {
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
    error ProofRejected();
    error VerifierFailed();

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event OwnerChanged(address indexed previousOwner, address indexed newOwner);
    event VerifierChanged(bytes32 indexed kind, address indexed verifier, VerifierMode mode, bool allowed);
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
        address verifier;
        uint64 anchoredAt;
    }

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant EVIDENCE_TYPEHASH = keccak256(
        "Evidence(bytes32 callId,bytes32 kind,bytes32 claimHash,bytes32 responseHash)"
    );
    bytes32 private constant NAME_HASH = keccak256("CallGuardEvidence");
    bytes32 private constant VERSION_HASH = keccak256("1");

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    address public owner;

    mapping(bytes32 => VerifierMode) public modeOf;
    mapping(bytes32 => mapping(address => bool)) public signatureVerifier;
    mapping(bytes32 => address) public proofVerifier;
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
    function setSignatureVerifier(bytes32 kind, address verifier, bool allowed) external onlyOwner {
        if (verifier == address(0)) revert InvalidAddress();
        if (allowed) modeOf[kind] = VerifierMode.Signature;
        signatureVerifier[kind][verifier] = allowed;
        emit VerifierChanged(kind, verifier, VerifierMode.Signature, allowed);
    }

    /// @notice Points a kind at a verifier contract that checks proofs on chain.
    function setProofVerifier(bytes32 kind, address verifier) external onlyOwner {
        if (verifier == address(0)) revert InvalidAddress();
        modeOf[kind] = VerifierMode.Proof;
        proofVerifier[kind] = verifier;
        emit VerifierChanged(kind, verifier, VerifierMode.Proof, true);
    }

    // ---------------------------------------------------------------------
    // Anchoring
    // ---------------------------------------------------------------------

    /// @notice Anchors one claim about one call.
    /// @param callId       The PayPerCallV8 call id the claim is about.
    /// @param kind         keccak256 of the claim kind, e.g. `keccak256("tee-attestation")`.
    /// @param claimHash    Digest of the off-chain evidence envelope (proof bytes excluded).
    /// @param responseHash The `responseHash` committed for the call; keeps the claim tied
    ///                     to the body the provider actually signed.
    /// @param proof        Signature or proof bytes, depending on the kind's mode.
    function anchor(
        bytes32 callId,
        bytes32 kind,
        bytes32 claimHash,
        bytes32 responseHash,
        bytes calldata proof
    ) external {
        if (callId == bytes32(0) || claimHash == bytes32(0) || responseHash == bytes32(0)) {
            revert EmptyHash();
        }
        if (_anchored[callId][kind]) revert AlreadyAnchored();

        VerifierMode mode = modeOf[kind];
        if (mode == VerifierMode.None) revert NoVerifierForKind();

        address verifier;
        if (mode == VerifierMode.Signature) {
            verifier = _recoverSigner(anchorDigest(callId, kind, claimHash, responseHash), proof);
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
    function anchorDigest(bytes32 callId, bytes32 kind, bytes32 claimHash, bytes32 responseHash)
        public
        view
        returns (bytes32)
    {
        bytes32 domainSeparator = keccak256(
            abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this))
        );
        bytes32 structHash = keccak256(abi.encode(EVIDENCE_TYPEHASH, callId, kind, claimHash, responseHash));
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

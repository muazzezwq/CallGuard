// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SLAProvenance
/// @notice Records that an allowlisted attestor saw a specific payload for a call.
/// @dev    `PayPerCallV8` binds a receipt to a `responseHash`: that proves the
///         provider committed to a body, not that the body came from the endpoint
///         the caller paid for. This contract adds the missing provenance slot.
///
///         An attestor (a zkTLS notary, a TEE signer, or an operator-run witness)
///         signs `(chainId, contract, callId, payloadHash, originHash, observedAt)`.
///         Anyone may submit that signature; the contract recovers the signer with
///         `ecrecover` and accepts the record only if the signer is allowlisted.
///
///         Honest about the trust model: the contract verifies *who attested*, not
///         that the attestation is true. A single allowlisted key means one key must
///         be trusted; the allowlist exists so that key can be an independent notary
///         instead of the provider's own wallet. Nothing here proves the payload is a
///         correct answer — that still needs attested execution.
contract SLAProvenance {
    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotOwner();
    error InvalidAddress();
    error InvalidSignature();
    error AttestorNotAllowed();
    error AlreadyRecorded();
    error EmptyPayloadHash();
    error ObservedInFuture();

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event OwnerChanged(address indexed previousOwner, address indexed newOwner);
    event AttestorChanged(address indexed attestor, bool allowed);
    event ProvenanceRecorded(
        bytes32 indexed callId,
        bytes32 payloadHash,
        address indexed attestor,
        bytes32 indexed originHash,
        uint64 observedAt
    );

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    struct Provenance {
        bytes32 payloadHash;
        address attestor;
        bytes32 originHash;
        uint64 observedAt;
        uint64 recordedAt;
    }

    /// @dev Allows small clock skew between the attestor and the chain.
    uint64 public constant MAX_CLOCK_SKEW = 300;

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant PROVENANCE_TYPEHASH = keccak256(
        "Provenance(bytes32 callId,bytes32 payloadHash,bytes32 originHash,uint64 observedAt)"
    );
    bytes32 private constant NAME_HASH = keccak256("CallGuardProvenance");
    bytes32 private constant VERSION_HASH = keccak256("1");

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    address public owner;
    mapping(address => bool) public isAttestor;
    mapping(bytes32 => Provenance) private _records;
    mapping(bytes32 => bool) public verified;

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

    /// @notice Adds or removes an attestor key. Revoking stops new records; it does
    ///         not erase records that key already attested.
    function setAttestor(address attestor, bool allowed) external onlyOwner {
        if (attestor == address(0)) revert InvalidAddress();
        isAttestor[attestor] = allowed;
        emit AttestorChanged(attestor, allowed);
    }

    // ---------------------------------------------------------------------
    // Recording
    // ---------------------------------------------------------------------

    /// @notice Records an attestor's signature over one call's payload.
    /// @param callId      The PayPerCallV8 call id the payload belongs to.
    /// @param payloadHash keccak256 of the exact bytes the attestor saw.
    /// @param origin      The endpoint host, e.g. `api.coingecko.com`. Hashed on chain.
    /// @param observedAt  When the attestor saw the payload (unix seconds).
    /// @param signature   65-byte EIP-712 signature by an allowlisted attestor.
    function recordProvenance(
        bytes32 callId,
        bytes32 payloadHash,
        string calldata origin,
        uint64 observedAt,
        bytes calldata signature
    ) external {
        if (payloadHash == bytes32(0)) revert EmptyPayloadHash();
        if (verified[callId]) revert AlreadyRecorded();
        if (observedAt > block.timestamp + MAX_CLOCK_SKEW) revert ObservedInFuture();

        bytes32 originHash = keccak256(bytes(origin));
        bytes32 digest = provenanceDigest(callId, payloadHash, originHash, observedAt);
        address signer = _recover(digest, signature);
        if (!isAttestor[signer]) revert AttestorNotAllowed();

        _records[callId] = Provenance({
            payloadHash: payloadHash,
            attestor: signer,
            originHash: originHash,
            observedAt: observedAt,
            recordedAt: uint64(block.timestamp)
        });
        verified[callId] = true;

        emit ProvenanceRecorded(callId, payloadHash, signer, originHash, observedAt);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice EIP-712 digest an attestor must sign. Exposed so clients cannot guess
    ///         the encoding wrong.
    function provenanceDigest(
        bytes32 callId,
        bytes32 payloadHash,
        bytes32 originHash,
        uint64 observedAt
    ) public view returns (bytes32) {
        bytes32 domainSeparator = keccak256(
            abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this))
        );
        bytes32 structHash = keccak256(abi.encode(PROVENANCE_TYPEHASH, callId, payloadHash, originHash, observedAt));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    /// @notice Returns the provenance record for a call. `recordedAt == 0` means none.
    function getProvenance(bytes32 callId) external view returns (Provenance memory) {
        return _records[callId];
    }

    /// @notice Convenience check: does this call have a payload attested by an
    ///         allowlisted key that matches `expectedPayloadHash`?
    function verifyProvenance(bytes32 callId, bytes32 expectedPayloadHash) external view returns (bool) {
        Provenance memory record = _records[callId];
        if (record.recordedAt == 0) return false;
        return record.payloadHash == expectedPayloadHash;
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert InvalidSignature();
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }
}

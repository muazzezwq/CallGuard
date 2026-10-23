// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { IPayPerCallV8 } from "./interfaces/IPayPerCallV8.sol";
import { IServiceRegistryV8 } from "./interfaces/IServiceRegistryV8.sol";

/// @dev Minimal EIP-3009 surface used by Arc USDC.
interface IUSDC3009 {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}

/// @title PayPerCallV8
/// @notice Escrow and availability enforcement for CallGuard P0.
/// @dev    A call snapshots the provider's SLA terms version. Receipts are
///         EIP-712 signed under the ArcSLA / 2 domain and bind the terms
///         version, so a later terms update cannot rewrite an open call.
contract PayPerCallV8 is IPayPerCallV8, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @dev Extra seconds allowed for receipt transaction inclusion.
    uint32 public constant SUBMIT_GRACE = 5;

    /// @dev Keeper share of the slash, in basis points.
    uint16 public constant keeperBountyBps = 500;

    /// @dev Absolute USDC cap on a single keeper bounty (6 decimals).
    uint256 public constant MAX_KEEPER_BOUNTY = 5e6;

    /// @dev Per-caller concurrent call cap when a provider leaves it at zero.
    uint32 public constant DEFAULT_MAX_CONCURRENT = 10;

    /// @dev EIP-712 type hash for the v8 Receipt struct.
    bytes32 public constant RECEIPT_TYPEHASH =
        keccak256("Receipt(bytes32 callId,bytes32 responseHash,uint64 respondedAt,uint32 termsVersion)");

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error InvalidAddress();
    error InvalidBeneficiary();
    error InvalidStatus();
    error ZeroResponseHash();
    error RespondedAfterDeadline();
    error DeadlineExceeded();
    error DeadlineNotReached();
    error TermsVersionMismatch();
    error ReceiptAlreadyUsed();
    error InvalidSignature();
    error ProviderNotActive();
    error InsufficientProviderStake();
    error TooManyConcurrentCalls();
    error CallIdCollision();
    error AuthorizationAlreadyUsed();
    error AuthorizationExpired();
    error AuthorizationNotYetValid();
    error NothingToClaim();

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    IERC20 public immutable usdc;
    IServiceRegistryV8 internal immutable _registry;

    mapping(bytes32 => Call) internal _calls;
    mapping(bytes32 => bool) public usedReceipts;
    mapping(address => uint256) public claimable;
    mapping(uint256 => mapping(address => uint32)) public openCallsPerCaller;

    /// @dev Bumped on every call so callIds cannot collide across identical
    ///      requests from the same beneficiary in the same block.
    uint256 public nonce;

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(IERC20 _usdc, IServiceRegistryV8 registry_) EIP712("ArcSLA", "2") {
        if (address(_usdc) == address(0) || address(registry_) == address(0)) revert InvalidAddress();
        usdc = _usdc;
        _registry = registry_;
    }

    // ---------------------------------------------------------------------
    // Calls
    // ---------------------------------------------------------------------

    function callService(uint256 providerId, bytes32 requestHash) external nonReentrant returns (bytes32 callId) {
        OpenResult memory open = _createCall(providerId, requestHash, msg.sender);

        usdc.safeTransferFrom(msg.sender, address(this), open.amount);
        _registry.markCallStarted(providerId);
        emit CallStarted(
            open.callId, providerId, msg.sender, open.amount, open.termsVersion, open.termsHash, requestHash, open.deadline
        );

        return open.callId;
    }

    function callServiceFor(uint256 providerId, bytes32 requestHash, address beneficiary)
        external
        nonReentrant
        returns (bytes32 callId)
    {
        if (beneficiary == address(0)) revert InvalidBeneficiary();

        OpenResult memory open = _createCall(providerId, requestHash, beneficiary);

        usdc.safeTransferFrom(msg.sender, address(this), open.amount);
        _registry.markCallStarted(providerId);
        emit CallStarted(
            open.callId,
            providerId,
            beneficiary,
            open.amount,
            open.termsVersion,
            open.termsHash,
            requestHash,
            open.deadline
        );

        return open.callId;
    }

    function callServiceWithAuthorization(
        uint256 providerId,
        bytes32 requestHash,
        address beneficiary,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 authNonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant returns (bytes32 callId) {
        if (beneficiary == address(0)) revert InvalidBeneficiary();
        if (block.timestamp < validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp > validBefore) revert AuthorizationExpired();
        if (IUSDC3009(address(usdc)).authorizationState(beneficiary, authNonce)) {
            revert AuthorizationAlreadyUsed();
        }

        OpenResult memory open = _createCall(providerId, requestHash, beneficiary);

        IUSDC3009(address(usdc)).transferWithAuthorization(
            beneficiary,
            address(this),
            open.amount,
            validAfter,
            validBefore,
            authNonce,
            v,
            r,
            s
        );

        _registry.markCallStarted(providerId);
        emit CallStarted(
            open.callId,
            providerId,
            beneficiary,
            open.amount,
            open.termsVersion,
            open.termsHash,
            requestHash,
            open.deadline
        );

        return open.callId;
    }

    // ---------------------------------------------------------------------
    // Close — receipt
    // ---------------------------------------------------------------------

    function submitReceipt(
        bytes32 callId,
        bytes32 responseHash,
        uint64 respondedAt,
        uint32 termsVersion,
        bytes calldata signature
    ) external nonReentrant {
        Call storage c = _calls[callId];
        if (c.status == CallStatus.None) revert InvalidStatus();
        if (responseHash == bytes32(0)) revert ZeroResponseHash();
        if (respondedAt > c.deadline) revert RespondedAfterDeadline();
        if (block.timestamp > uint256(c.deadline) + SUBMIT_GRACE) revert DeadlineExceeded();
        if (termsVersion != c.termsVersion) revert TermsVersionMismatch();

        bytes32 digest = hashReceipt(
            Receipt({
                callId: callId,
                responseHash: responseHash,
                respondedAt: respondedAt,
                termsVersion: termsVersion
            })
        );

        if (usedReceipts[digest]) revert ReceiptAlreadyUsed();
        if (c.status != CallStatus.Pending) revert InvalidStatus();

        address signer = ECDSA.recover(digest, signature);
        IServiceRegistryV8.ProviderView memory provider = _registry.getProvider(c.providerId);
        if (signer != provider.signer) revert InvalidSignature();

        usedReceipts[digest] = true;

        c.responseHash = responseHash;
        c.completedAt = uint32(block.timestamp);
        c.status = CallStatus.Completed;

        _decrementOpenCalls(c.providerId, c.caller);
        _registry.markCallFinished(c.providerId);
        _registry.incCompleted(c.providerId);

        // Pull model: the provider owner withdraws with claim().
        claimable[provider.owner] += c.amount;

        emit ReceiptSubmitted(callId, responseHash, respondedAt, termsVersion);
    }

    // ---------------------------------------------------------------------
    // Close — timeout
    // ---------------------------------------------------------------------

    function claimTimeout(bytes32 callId)
        external
        nonReentrant
        returns (uint256 refunded, uint256 slashed, uint256 bounty)
    {
        Call storage c = _calls[callId];
        if (c.status != CallStatus.Pending) revert InvalidStatus();
        if (block.timestamp <= uint256(c.deadline) + SUBMIT_GRACE) revert DeadlineNotReached();

        c.status = CallStatus.Slashed;

        _decrementOpenCalls(c.providerId, c.caller);
        _registry.markCallFinished(c.providerId);
        _registry.incSlashed(c.providerId);

        IServiceRegistryV8.ProviderView memory provider = _registry.getProvider(c.providerId);
        IServiceRegistryV8.SLATerms memory terms = _registry.getTerms(c.providerId, c.termsVersion);

        uint256 slashAmount = Math.mulDiv(provider.stake, terms.slashBps, 10_000);
        uint256 bountyAmount = Math.mulDiv(slashAmount, keeperBountyBps, 10_000);
        if (bountyAmount > MAX_KEEPER_BOUNTY) bountyAmount = MAX_KEEPER_BOUNTY;
        if (slashAmount == 0) bountyAmount = 0;

        refunded = c.amount;
        slashed = slashAmount - bountyAmount;
        bounty = bountyAmount;

        claimable[c.caller] += refunded + slashed;

        if (slashAmount > 0) {
            _registry.slash(c.providerId, slashAmount, address(this));
        }
        if (bountyAmount > 0) {
            claimable[msg.sender] += bountyAmount;
            emit KeeperBountyPaid(callId, msg.sender, bountyAmount);
        }

        emit CallSlashed(callId, refunded, slashed, bountyAmount);
    }

    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();

        claimable[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit Claimed(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getCall(bytes32 callId) external view returns (Call memory) {
        return _calls[callId];
    }

    function hashReceipt(Receipt memory receipt) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                RECEIPT_TYPEHASH, receipt.callId, receipt.responseHash, receipt.respondedAt, receipt.termsVersion
            )
        );
        return _hashTypedDataV4(structHash);
    }

    function registry() external view returns (address) {
        return address(_registry);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    struct OpenResult {
        bytes32 callId;
        uint256 amount;
        uint32 termsVersion;
        bytes32 termsHash;
        uint32 deadline;
    }

    function _createCall(uint256 providerId, bytes32 requestHash, address beneficiary)
        internal
        returns (OpenResult memory open)
    {
        IServiceRegistryV8.ProviderView memory provider = _registry.getProvider(providerId);
        if (!provider.active) revert ProviderNotActive();

        IServiceRegistryV8.SLATerms memory terms = _registry.getTerms(providerId, provider.latestTermsVersion);

        // The stake must still cover the call price after this terms version's
        // slash. This prevents opening calls that a timeout could not back.
        uint256 expectedSlash = Math.mulDiv(provider.stake, terms.slashBps, 10_000);
        if (expectedSlash < provider.pricePerCall) revert InsufficientProviderStake();

        uint32 baseCap = provider.maxConcurrentCalls == 0 ? DEFAULT_MAX_CONCURRENT : provider.maxConcurrentCalls;
        uint32 cap = provider.zkTier >= 2 ? baseCap * 2 : baseCap;
        if (openCallsPerCaller[providerId][beneficiary] >= cap) revert TooManyConcurrentCalls();

        uint256 currentNonce = nonce++;
        open.callId = keccak256(
            abi.encodePacked(providerId, beneficiary, currentNonce, block.timestamp, requestHash, block.chainid)
        );
        if (_calls[open.callId].status != CallStatus.None) revert CallIdCollision();

        open.amount = provider.pricePerCall;
        open.termsVersion = provider.latestTermsVersion;
        open.termsHash = terms.termsHash;
        open.deadline = uint32(block.timestamp) + terms.maxResponseTime;

        _calls[open.callId] = Call({
            providerId: providerId,
            caller: beneficiary,
            amount: open.amount,
            startedAt: uint32(block.timestamp),
            deadline: open.deadline,
            completedAt: 0,
            termsVersion: open.termsVersion,
            termsHash: open.termsHash,
            requestHash: requestHash,
            responseHash: bytes32(0),
            status: CallStatus.Pending
        });

        openCallsPerCaller[providerId][beneficiary]++;
    }

    function _decrementOpenCalls(uint256 providerId, address caller) internal {
        uint32 count = openCallsPerCaller[providerId][caller];
        if (count > 0) {
            openCallsPerCaller[providerId][caller] = count - 1;
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import { IServiceRegistry, IERC8004ReputationRegistry } from "./interfaces/IServiceRegistry.sol";

/// @notice ERC-8183 Pipeline Hook — called before/after each service call.
///         Allows the AgenticCommerce job pipeline to track SLA lifecycle events.
///         Both hooks are best-effort: a reverting hook never blocks the call.
interface IERC8183Hook {
    /// @param jobId      ERC-8183 job identifier (keccak of callId for ArcSLA).
    /// @param providerId ServiceRegistry provider id.
    /// @param caller     Address opening the call.
    /// @param amount     USDC amount locked in escrow.
    function beforeCall(bytes32 jobId, uint256 providerId, address caller, uint256 amount) external;

    /// @param jobId    ERC-8183 job identifier.
    /// @param success  true = receipt submitted (SLA met), false = timeout/slash.
    function afterCall(bytes32 jobId, bool success) external;
}

/// @dev Minimal EIP-3009 interface for USDC transferWithAuthorization.
interface IUSDC {
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

/// @title PayPerCall
/// @notice Escrow USDC per service call. Provider commits to an SLA by
///         signing an EIP-712 typed Receipt. A valid receipt transfers the
///         escrow to the provider; a timeout without a receipt refunds the
///         caller and slashes the provider's stake.
///
/// @dev    v2 Signing flow — providers MUST sign using EIP-712 typed data
///         under the ArcSLA / v1 domain. Wallets render readable fields
///         (callId, responseHash) instead of an opaque hex blob.
contract PayPerCall is ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using MessageHashUtils for bytes32;

    // ---------------------------------------------------------------------
    // EIP-712 typehash for Receipt
    // ---------------------------------------------------------------------

    /// @dev EIP-712 type hash for the Receipt struct.
    /// Type string MUST match exactly (no spaces between fields, fields
    /// comma-separated, struct name and parentheses included).
    bytes32 public constant RECEIPT_TYPEHASH = keccak256(
        "Receipt(bytes32 callId,bytes32 responseHash,uint64 respondedAt)"
    );

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @notice Extra seconds added to the deadline window for submitReceipt.
    /// @dev    Protects providers from being slashed due to block propagation
    ///         latency. On Arc (~0.5s blocks) 5 seconds = ~10 blocks of buffer.
    ///         claimTimeout requires the full grace period to have passed too,
    ///         so the two windows never overlap.
    uint32 public constant SUBMIT_GRACE = 5;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ProviderNotActive();
    error InvalidStatus();
    error DeadlineExceeded();
    error DeadlineNotReached();
    error InvalidSignature();
    error CallIdCollision();
    error ReceiptAlreadyUsed();
    error AuthorizationAlreadyUsed();
    error AuthorizationExpired();
    error AuthorizationNotYetValid();
    error InvalidAuthorization();
    error InsufficientProviderStake();
    error InvalidBeneficiary();
    error NothingToClaim();
    /// @notice Caller has reached the provider's per-caller concurrent call cap.
    error TooManyConcurrentCalls();
    error StealthAnnouncerNotSet();

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum CallStatus {
        None,
        Pending,
        Completed,
        Slashed
    }

    struct Call {
        uint256 providerId;
        address caller;
        uint256 amount;
        uint32 startedAt;
        uint32 deadline;
        bytes32 requestHash;
        bytes32 responseHash;
        CallStatus status;
    }

    /// @notice EIP-712 typed receipt that the provider signs off-chain.
    /// @dev    `respondedAt` is the Unix timestamp (seconds) at which the
    ///         provider claims to have produced the response. It is NOT
    ///         enforced on-chain — the contract only checks that the TX lands
    ///         before deadline + SUBMIT_GRACE. The field exists so that:
    ///           (a) wallets render a human-readable "responded at HH:MM:SS",
    ///           (b) off-chain dispute tooling can compare respondedAt against
    ///               the call's deadline to prove the provider answered in time
    ///               even if the TX was delayed by network congestion.
    ///         A provider who backdates respondedAt gains nothing on-chain, but
    ///         loses credibility in any off-chain dispute — the signed value is
    ///         cryptographically bound to the receipt digest.
    struct Receipt {
        bytes32 callId;
        bytes32 responseHash;
        uint64  respondedAt; // Unix timestamp when provider produced the response
    }

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    IERC20 public immutable usdc;
    IServiceRegistry public immutable registry;

    /// @notice Optional ERC-8004 ReputationRegistry.
    ///         Set to address(0) to disable. Can be set once via setReputationRegistry().
    ///         Arc Testnet: 0x8004B663056A597Dffe9eCcC1965A193B7388713
    IERC8004ReputationRegistry public reputationRegistry;

    mapping(bytes32 => Call) internal _calls;
    uint256 public nonce; // bumped on every call to keep callIds unique

    /// @notice Tracks EIP-712 digests of receipts that have already been
    ///         consumed. Prevents the same signature from being replayed.
    mapping(bytes32 => bool) public usedReceipts;

    mapping(address => uint256) public claimable;

    /// @notice Tracks how many calls are open for each (providerId, caller) pair.
    ///         Decremented on receipt submit or timeout claim.
    ///         Capped at provider.maxConcurrentCalls (default 10 when 0).
    mapping(uint256 => mapping(address => uint32)) public openCallsPerCaller;

    /// @dev Default cap used when provider sets maxConcurrentCalls = 0.
    uint32 public constant DEFAULT_MAX_CONCURRENT = 10;

    // ---------------------------------------------------------------------
    // ERC-8183 Pipeline Hook
    // ---------------------------------------------------------------------

    /// @notice Optional ERC-8183 AgenticCommerce pipeline hook.
    ///         Set to address(0) to disable. Both hooks are best-effort (try/catch).
    IERC8183Hook public pipelineHook;

    event PipelineHookSet(address indexed hook);
    event PipelineHookCalled(bytes32 indexed jobId, bool before, bool success);

    // ---------------------------------------------------------------------
    // EIP-5564 Stealth Address Support
    // ---------------------------------------------------------------------

    /// @notice Optional EIP-5564 announcer contract.
    ///         Set to address(0) to disable. Can be set via setStealthAnnouncer().
    address public stealthAnnouncer;

    event StealthAnnouncerSet(address indexed announcer);
    event StealthCallStarted(bytes32 indexed callId, address indexed stealthAddress);

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event CallStarted(
        bytes32 indexed callId,
        uint256 indexed providerId,
        address indexed caller,
        uint256 amount,
        bytes32 requestHash,
        uint32 deadline
    );
    event ReceiptSubmitted(bytes32 indexed callId, bytes32 responseHash, uint64 respondedAt);
    event CallSlashed(bytes32 indexed callId, uint256 refunded, uint256 slashed);
    event Claimed(address indexed account, uint256 amount);
    /// @notice ERC-8004 ReputationRegistry address updated.
    event ReputationRegistrySet(address indexed registry_);
    /// @notice Reputation event recorded on-chain (best-effort; not reverting on failure).
    event ReputationRecorded(uint256 indexed providerId, int8 score, bool success);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(IERC20 _usdc, IServiceRegistry _registry) EIP712("ArcSLA", "1") {
        usdc = _usdc;
        registry = _registry;
    }

    /// @notice Set (or clear) the ERC-8183 pipeline hook address.
    ///         Only the ServiceRegistry admin (owner of provider id 1) can call.
    ///         Pass address(0) to disable hooks.
    function setPipelineHook(address hook) external {
        IServiceRegistry.ProviderView memory adm = registry.getProvider(1);
        require(adm.owner != address(0), "PayPerCall: no provider registered");
        require(msg.sender == adm.owner, "PayPerCall: not admin");
        pipelineHook = IERC8183Hook(hook);
        emit PipelineHookSet(hook);
    }

    /// @dev Internal helper — fires ERC-8183 beforeCall hook best-effort.
    function _hookBefore(bytes32 callId, uint256 providerId, address caller, uint256 amount) internal {
        IERC8183Hook h = pipelineHook;
        if (address(h) == address(0)) return;
        try h.beforeCall(callId, providerId, caller, amount) {
            emit PipelineHookCalled(callId, true, true);
        } catch {
            emit PipelineHookCalled(callId, true, false);
        }
    }

    /// @dev Internal helper — fires ERC-8183 afterCall hook best-effort.
    function _hookAfter(bytes32 callId, bool success) internal {
        IERC8183Hook h = pipelineHook;
        if (address(h) == address(0)) return;
        try h.afterCall(callId, success) {
            emit PipelineHookCalled(callId, false, true);
        } catch {
            emit PipelineHookCalled(callId, false, false);
        }
    }

    /// @notice Set (or clear) the ERC-8004 ReputationRegistry address.
    ///         Only the ServiceRegistry owner can call this — enforced via
    ///         `registry.getProvider(0)` owner check so no extra owner state is needed.
    ///         Pass address(0) to disable reputation recording.
    /// @dev    The first provider (id=0) is the protocol deployer — a sensible proxy
    ///         for "admin" without adding an Ownable dependency.
    function setReputationRegistry(address registry_) external {
        // Caller must be the owner of provider id 0 (protocol admin).
        IServiceRegistry.ProviderView memory admin = registry.getProvider(0);
        require(msg.sender == admin.owner, "PayPerCall: not admin");
        reputationRegistry = IERC8004ReputationRegistry(registry_);
        emit ReputationRegistrySet(registry_);
    }

    /// @dev Internal helper — records a reputation event best-effort.
    ///      Never reverts; a failing registry call only emits ReputationRecorded(false).
    function _recordReputation(uint256 providerId, int8 score, string memory eventUri) internal {
        IERC8004ReputationRegistry rep = reputationRegistry;
        if (address(rep) == address(0)) return;
        try rep.record(providerId, score, eventUri) {
            emit ReputationRecorded(providerId, score, true);
        } catch {
            emit ReputationRecorded(providerId, score, false);
        }
    }

    // ---------------------------------------------------------------------
    // EIP-712 helpers
    // ---------------------------------------------------------------------

    /// @notice Returns the EIP-712 domain separator for this contract.
    /// @dev Useful for off-chain integrations that want to verify the
    ///      domain they're signing against.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Computes the EIP-712 digest for a Receipt.
    /// @dev Domain separator (name "ArcSLA", version "1", current chainId,
    ///      this contract address) is prepended automatically by
    ///      `_hashTypedDataV4`.
    function hashReceipt(Receipt memory receipt) public view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            RECEIPT_TYPEHASH,
            receipt.callId,
            receipt.responseHash,
            receipt.respondedAt
        ));
        return _hashTypedDataV4(structHash);
    }

    // ---------------------------------------------------------------------
    // Open a call
    // ---------------------------------------------------------------------

    function callService(uint256 providerId, bytes32 requestHash) external nonReentrant returns (bytes32 callId) {
        return _callServiceFor(providerId, requestHash, msg.sender);
    }

    function callServiceFor(uint256 providerId, bytes32 requestHash, address beneficiary)
        external
        nonReentrant
        returns (bytes32 callId)
    {
        return _callServiceFor(providerId, requestHash, beneficiary);
    }

    /// @notice x402 / EIP-3009 entry point. Caller authorises the USDC transfer
    ///         inline — no prior approve() required.
    /// @param providerId   Target provider ID.
    /// @param requestHash  Keccak256 hash of the request payload.
    /// @param beneficiary  Address to credit on timeout / refund (use msg.sender for normal callers).
    /// @param validAfter   EIP-3009 validAfter timestamp.
    /// @param validBefore  EIP-3009 validBefore timestamp (must be > block.timestamp).
    /// @param authNonce    EIP-3009 nonce (must be unique per authorizer).
    /// @param v            Signature v.
    /// @param r            Signature r.
    /// @param s            Signature s.
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

        if (IUSDC(address(usdc)).authorizationState(beneficiary, authNonce)) {
            revert AuthorizationAlreadyUsed();
        }

        IServiceRegistry.ProviderView memory p = registry.getProvider(providerId);
        if (!p.active) revert ProviderNotActive();

        uint256 expectedSlash = (p.stake * p.slashBps) / 10_000;
        if (expectedSlash < p.pricePerCall) revert InsufficientProviderStake();

        // Rate-limit check for x402 path. zkML Tier 2 = cap x2.
        uint32 baseCap = p.maxConcurrentCalls == 0 ? DEFAULT_MAX_CONCURRENT : p.maxConcurrentCalls;
        uint32 cap = p.zkTier >= 2 ? baseCap * 2 : baseCap;
        if (openCallsPerCaller[providerId][beneficiary] >= cap) revert TooManyConcurrentCalls();

        uint256 currentNonce = nonce++;
        callId = keccak256(
            abi.encodePacked(providerId, beneficiary, currentNonce, block.timestamp, requestHash, block.chainid)
        );
        if (_calls[callId].status != CallStatus.None) revert CallIdCollision();

        uint32 deadline = uint32(block.timestamp) + p.maxResponseTime;

        _calls[callId] = Call({
            providerId: providerId,
            caller: beneficiary,
            amount: p.pricePerCall,
            startedAt: uint32(block.timestamp),
            deadline: deadline,
            requestHash: requestHash,
            responseHash: bytes32(0),
            status: CallStatus.Pending
        });

        IUSDC(address(usdc)).transferWithAuthorization(
            beneficiary,
            address(this),
            p.pricePerCall,
            validAfter,
            validBefore,
            authNonce,
            v,
            r,
            s
        );

        registry.markCallStarted(providerId);

        // Track open call against rate-limit counter (x402 path).
        openCallsPerCaller[providerId][beneficiary]++;

        emit CallStarted(callId, providerId, beneficiary, p.pricePerCall, requestHash, deadline);
    }

    function _callServiceFor(uint256 providerId, bytes32 requestHash, address beneficiary)
        internal
        returns (bytes32 callId)
    {
        if (beneficiary == address(0)) revert InvalidBeneficiary();

        IServiceRegistry.ProviderView memory p = registry.getProvider(providerId);
        if (!p.active) revert ProviderNotActive();

        // Ensure slash bonus can cover at least the call price — protects callers
        // from providers whose stake has been depleted by previous slashes.
        uint256 expectedSlash = (p.stake * p.slashBps) / 10_000;
        if (expectedSlash < p.pricePerCall) revert InsufficientProviderStake();

        // Rate-limit: enforce per-caller concurrent call cap.
        // zkML Tier 2 providers get double the cap.
        uint32 baseCap = p.maxConcurrentCalls == 0 ? DEFAULT_MAX_CONCURRENT : p.maxConcurrentCalls;
        uint32 cap = p.zkTier >= 2 ? baseCap * 2 : baseCap;
        if (openCallsPerCaller[providerId][beneficiary] >= cap) revert TooManyConcurrentCalls();

        uint256 currentNonce = nonce++;
        callId = keccak256(
            abi.encodePacked(providerId, beneficiary, currentNonce, block.timestamp, requestHash, block.chainid)
        );
        if (_calls[callId].status != CallStatus.None) revert CallIdCollision();

        uint32 deadline = uint32(block.timestamp) + p.maxResponseTime;

        _calls[callId] = Call({
            providerId: providerId,
            caller: beneficiary,
            amount: p.pricePerCall,
            startedAt: uint32(block.timestamp),
            deadline: deadline,
            requestHash: requestHash,
            responseHash: bytes32(0),
            status: CallStatus.Pending
        });

        // Pull USDC into escrow BEFORE notifying the registry — if the
        // transfer fails, pendingCalls doesn't drift.
        usdc.safeTransferFrom(msg.sender, address(this), p.pricePerCall);
        registry.markCallStarted(providerId);

        // Track open call against rate-limit counter.
        openCallsPerCaller[providerId][beneficiary]++;

        emit CallStarted(callId, providerId, beneficiary, p.pricePerCall, requestHash, deadline);

        // ERC-8183 Pipeline Hook — best-effort beforeCall notification.
        _hookBefore(callId, providerId, beneficiary, p.pricePerCall);
    }

    // ---------------------------------------------------------------------
    // Close a call — happy path (EIP-712 typed receipt)
    // ---------------------------------------------------------------------

    /// @notice Submit a signed receipt to close the call and release escrow.
    /// @param callId       The call identifier returned by callService.
    /// @param responseHash keccak256 of the provider's response payload.
    /// @param respondedAt  Unix timestamp (seconds) when the provider produced
    ///                     the response. NOT enforced on-chain — stored in the
    ///                     event for off-chain dispute resolution. The provider
    ///                     must include this value in the EIP-712 signature.
    /// @param signature    EIP-712 signature over Receipt(callId, responseHash, respondedAt).
    function submitReceipt(
        bytes32 callId,
        bytes32 responseHash,
        uint64  respondedAt,
        bytes calldata signature
    ) external nonReentrant {
        Call storage c = _calls[callId];
        if (c.status != CallStatus.Pending) revert InvalidStatus();
        if (block.timestamp > uint256(c.deadline) + SUBMIT_GRACE) revert DeadlineExceeded();

        // EIP-712 typed digest — wallets display structured Receipt fields
        // including the human-readable respondedAt timestamp.
        bytes32 digest = hashReceipt(Receipt({
            callId: callId,
            responseHash: responseHash,
            respondedAt: respondedAt
        }));

        // Replay protection — the same digest cannot be consumed twice.
        if (usedReceipts[digest]) revert ReceiptAlreadyUsed();
        usedReceipts[digest] = true;

        address signer = ECDSA.recover(digest, signature);

        IServiceRegistry.ProviderView memory p = registry.getProvider(c.providerId);
        if (signer != p.signer) revert InvalidSignature();

        // Effects before interactions.
        c.responseHash = responseHash;
        c.status = CallStatus.Completed;

        // Decrement rate-limit counter — slot is now free for a new call.
        if (openCallsPerCaller[c.providerId][c.caller] > 0) {
            openCallsPerCaller[c.providerId][c.caller]--;
        }

        registry.markCallFinished(c.providerId);
        registry.incCompleted(c.providerId); // bump reputation

        // ERC-8004: record positive reputation event (+1) on-chain.
        // eventUri encodes callId so the registry can deduplicate.
        _recordReputation(c.providerId, 1, string(abi.encodePacked("callguard:success:", _bytes32ToHex(callId))));

        claimable[p.owner] += c.amount;

        emit ReceiptSubmitted(callId, responseHash, respondedAt);

        // ERC-8183 Pipeline Hook — afterCall(success=true).
        _hookAfter(callId, true);
    }

    // ---------------------------------------------------------------------
    // Close a call — timeout path
    // ---------------------------------------------------------------------

    function claimTimeout(bytes32 callId) external nonReentrant {
        Call storage c = _calls[callId];
        if (c.status != CallStatus.Pending) revert InvalidStatus();
        if (block.timestamp <= uint256(c.deadline) + SUBMIT_GRACE) revert DeadlineNotReached();

        c.status = CallStatus.Slashed;

        // Decrement rate-limit counter — free the slot.
        if (openCallsPerCaller[c.providerId][c.caller] > 0) {
            openCallsPerCaller[c.providerId][c.caller]--;
        }

        IServiceRegistry.ProviderView memory p = registry.getProvider(c.providerId);
        uint256 slashAmount = (p.stake * p.slashBps) / 10_000;

        // Order matters:
        //   1. Mark pending call finished first (so the registry's accounting is clean
        //      before any external transfer).
        //   2. Bump reputation counter.
        //   3. Credit the caller refund from escrow.
        //   4. Slash stake into this contract and credit caller for pull withdrawal.
        registry.markCallFinished(c.providerId);
        registry.incSlashed(c.providerId);

        // ERC-8004: record negative reputation event (-1) on-chain.
        _recordReputation(c.providerId, -1, string(abi.encodePacked("callguard:slash:", _bytes32ToHex(callId))));

        claimable[c.caller] += c.amount;

        if (slashAmount > 0) {
            registry.slash(c.providerId, slashAmount, address(this));
            claimable[c.caller] += slashAmount;
        }

        emit CallSlashed(callId, c.amount, slashAmount);

        // ERC-8183 Pipeline Hook — afterCall(success=false).
        _hookAfter(callId, false);
    }

    // ---------------------------------------------------------------------
    // EIP-5564 Stealth Address
    // ---------------------------------------------------------------------

    /// @notice Set (or clear) the EIP-5564 announcer contract address.
    ///         Only the first registered provider's owner (protocol admin) can call.
    ///         Provider id 1 is always the first registration.
    function setStealthAnnouncer(address announcer) external {
        IServiceRegistry.ProviderView memory adminProv = registry.getProvider(1);
        require(adminProv.owner != address(0), "PayPerCall: no provider registered");
        require(msg.sender == adminProv.owner, "PayPerCall: not admin");
        stealthAnnouncer = announcer;
        emit StealthAnnouncerSet(announcer);
    }

    /// @notice Open a call where the caller's identity is hidden behind an
    ///         EIP-5564 stealth address. The stealthAddress is the one-time
    ///         address derived off-chain by the caller. All escrow and refunds
    ///         go to stealthAddress, not msg.sender.
    ///
    ///         USDC must be approved/authorised to this contract by msg.sender
    ///         before calling. For gasless auth use callServiceWithAuthorization.
    ///
    /// @param providerId       Target provider.
    /// @param requestHash      keccak256 of the request payload.
    /// @param stealthAddress   EIP-5564 derived one-time address.
    /// @param ephemeralPubKey  Ephemeral public key (65 bytes, uncompressed).
    /// @param metadata         Stealth metadata blob (view key hint, scheme tag).
    function callServiceStealth(
        uint256 providerId,
        bytes32 requestHash,
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external nonReentrant returns (bytes32 callId) {
        // FIX: validate stealthAddress is not address(0)
        if (stealthAddress == address(0)) revert InvalidBeneficiary();
        callId = _callServiceFor(providerId, requestHash, stealthAddress);

        // Announce on-chain so the recipient can scan for incoming stealth payments.
        if (stealthAnnouncer != address(0)) {
            // EIP-5564 schemeId 1 = SECP256K1 ECDH
            (bool ok,) = stealthAnnouncer.call(
                abi.encodeWithSignature(
                    "announce(uint256,address,bytes,bytes)",
                    uint256(1),
                    stealthAddress,
                    ephemeralPubKey,
                    metadata
                )
            );
            // best-effort — never revert if announcer fails
            emit StealthCallStarted(callId, stealthAddress);
            (ok); // suppress unused variable warning
        } else {
            emit StealthCallStarted(callId, stealthAddress);
        }
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

    // ---------------------------------------------------------------------
    // Internal utilities
    // ---------------------------------------------------------------------

    /// @dev Convert bytes32 to a lowercase hex string (without "0x" prefix).
    ///      Used to build human-readable eventUri strings for ERC-8004.
    function _bytes32ToHex(bytes32 b) internal pure returns (string memory) {
        bytes memory hex_ = new bytes(64);
        bytes memory alphabet = "0123456789abcdef";
        for (uint256 i = 0; i < 32; i++) {
            hex_[i * 2]     = alphabet[uint8(b[i] >> 4)];
            hex_[i * 2 + 1] = alphabet[uint8(b[i] & 0x0f)];
        }
        return string(hex_);
    }
}

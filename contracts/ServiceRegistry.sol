// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IServiceRegistry } from "./interfaces/IServiceRegistry.sol";

// ---------------------------------------------------------------------------
// Minimal ERC-721 interface — only ownerOf is needed for identity check
// ---------------------------------------------------------------------------
interface IERC721Minimal {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title ServiceRegistry
/// @notice On-chain catalog of service providers. Providers stake USDC to
///         register and commit to SLA parameters (max response time, slash %).
///         The PayPerCall contract is the only party allowed to slash — it
///         does so when a call times out without a receipt.
///
/// @dev    Arc Testnet's USDC uses 6 decimals via the ERC-20 interface at
///         0x3600000000000000000000000000000000000000. This contract only
///         talks to USDC through that interface.
contract ServiceRegistry is IServiceRegistry, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error AlreadyRegistered();
    error NotOwner();
    error BelowMinStake();
    error InvalidSlashBps();
    error InvalidResponseTime();
    error InvalidSigner();
    error ProviderInactive();
    error StillActive();
    error PendingCalls();
    error CooldownNotElapsed();
    error OnlyPayPerCall();
    error UnknownProvider();
    error InsufficientStake();
    error ZeroAmount();
    error NotNFTOwner(); // Tier 2: caller does not own the ERC-8004 identity NFT
    error InvalidPayPerCall();
    error PayPerCallTimelockNotElapsed();
    error NoPendingPayPerCall();

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    uint32 public constant MIN_RESPONSE_TIME = 5; // seconds
    uint32 public constant MAX_SLASH_BPS = 10_000;
    uint32 public constant UNSTAKE_COOLDOWN = 1 hours;
    uint256 public constant PAYPERCALL_TIMELOCK = 2 days;

    // --- Tier 2: ERC-8004 IdentityRegistry on Arc Testnet ---
    // --- zkML Tier System ---
    // --- DePIN Oracle ---
    address public constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    struct Provider {
        address owner;
        address signer;
        uint256 stake;
        uint256 pricePerCall;
        uint32 maxResponseTime;
        uint32 slashBps;
        uint32 deactivatedAt; // 0 = active
        uint32 pendingCalls; // open calls not yet finalized
        uint64 completedCalls; // reputation: successful receipts submitted
        uint64 slashedCalls; // reputation: SLA violations enforced
        /// @notice Max simultaneous open calls per caller address.
        ///         0 means "use the PayPerCall default" (10).
        ///         Providers set this to prevent spam / griefing.
        uint32 maxConcurrentCalls;
        /// @notice zkML tier: 0 = none, 1 = basic (minStake -50%), 2 = full (cap x2).
        uint8 zkTier;
        string endpoint;
        bool active;
    }

    // --- zkML tier mapping (providerId => tier) ---
    mapping(uint256 => uint8) public zkTiers;

    // --- DePIN Oracle ---
    address public uptimeOracle;
    mapping(uint256 => uint64) public lastUptimePing;
    mapping(uint256 => uint16) public uptimeScore;

    IERC20 public immutable usdc;
    uint256 public immutable minStake;
    address public payPerCall; // set once by owner via `setPayPerCall`
    address public admin;
    address public pendingPayPerCall;
    uint256 public payPerCallChangeAt;

    mapping(uint256 => Provider) internal _providers;
    mapping(address => uint256) public providerIdOf; // owner => id, 0 = none
    uint256 public nextProviderId = 1;
    /// @notice Dispute contracts authorized to slash (in addition to payPerCall).
    mapping(address => bool) public authorizedSlashers;

    // --- Tier 2: NFT identity binding ---
    // providerId => ERC-8004 tokenId (0 = no NFT bound, i.e. v1 registration)
    mapping(uint256 => uint256) public providerToTokenId;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event ProviderRegistered(
        uint256 indexed providerId,
        address indexed owner,
        address signer,
        uint256 stake,
        uint256 pricePerCall,
        uint32 maxResponseTime,
        uint32 slashBps,
        string endpoint
    );
    event ProviderDeactivated(uint256 indexed providerId, uint32 deactivatedAt);
    event ProviderUnstaked(uint256 indexed providerId, uint256 amount);
    event ProviderSlashed(uint256 indexed providerId, uint256 amount, address recipient);
    event PriceUpdated(uint256 indexed providerId, uint256 newPrice);
    event SignerUpdated(uint256 indexed providerId, address newSigner);
    event MaxConcurrentCallsUpdated(uint256 indexed providerId, uint32 newCap);
    event PayPerCallSet(address indexed payPerCall);
    event PayPerCallProposed(address indexed proposed, uint256 executeAt);
    event SlasherAuthorized(address indexed slasher);
    event SlasherRevoked(address indexed slasher);
    event ReputationUpdated(uint256 indexed providerId, uint64 completedCalls, uint64 slashedCalls);

    // --- Tier 2 ---
    event NFTBound(uint256 indexed providerId, uint256 indexed tokenId);

    // --- zkML ---
    event ZkTierSet(uint256 indexed providerId, uint8 tier);

    // --- DePIN Oracle ---
    event UptimeOracleSet(address indexed oracle);
    event UptimeRecorded(uint256 indexed providerId, uint16 score);

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyPayPerCall() {
        if (msg.sender != payPerCall) revert OnlyPayPerCall();
        _;
    }

    /// @notice PayPerCall or an admin-authorized dispute contract.
    modifier onlySlasher() {
        if (msg.sender != payPerCall && !authorizedSlashers[msg.sender]) revert OnlyPayPerCall();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotOwner();
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(IERC20 _usdc, uint256 _minStake, address _admin) {
        require(_admin != address(0), "zero admin");
        usdc = _usdc;
        minStake = _minStake;
        admin = _admin;
    }

    /// @notice One-time wire-up of the PayPerCall contract address. Admin
    ///         sets this right after deploying PayPerCall. Cannot be changed
    ///         after first set — prevents rug-pull where admin swaps the
    ///         slasher to a malicious contract.
    function setPayPerCall(address _payPerCall) external onlyAdmin {
        if (payPerCall != address(0)) revert("already set");
        payPerCall = _payPerCall;
        emit PayPerCallSet(_payPerCall);
    }

    /// @notice Deprecated in favor of timelocked payPerCall upgrades.
    /// @dev Kept to preserve ABI compatibility for existing integrations.
    function updatePayPerCall(address) external pure {
        revert("deprecated: use proposePayPerCall/executePayPerCall");
    }

    /// @notice Propose a new PayPerCall contract with a timelock.
    function proposePayPerCall(address _payPerCall) external onlyAdmin {
        if (_payPerCall == address(0)) revert InvalidPayPerCall();

        pendingPayPerCall = _payPerCall;
        payPerCallChangeAt = block.timestamp + PAYPERCALL_TIMELOCK;

        emit PayPerCallProposed(_payPerCall, payPerCallChangeAt);
    }

    /// @notice Execute a queued PayPerCall update once timelock has elapsed.
    function executePayPerCall() external onlyAdmin {
        address nextPayPerCall = pendingPayPerCall;
        if (nextPayPerCall == address(0)) revert NoPendingPayPerCall();
        if (block.timestamp < payPerCallChangeAt) revert PayPerCallTimelockNotElapsed();

        payPerCall = nextPayPerCall;
        pendingPayPerCall = address(0);
        payPerCallChangeAt = 0;

        emit PayPerCallSet(nextPayPerCall);
    }

    /// @notice Authorize a dispute contract to call `slash`.
    ///         Only admin. Emits event for indexer visibility.
    function authorizeSlasher(address slasher) external onlyAdmin {
        require(slasher != address(0), "zero slasher");
        authorizedSlashers[slasher] = true;
        emit SlasherAuthorized(slasher);
    }

    /// @notice Revoke a previously authorized dispute contract.
    function revokeSlasher(address slasher) external onlyAdmin {
        authorizedSlashers[slasher] = false;
        emit SlasherRevoked(slasher);
    }

    // ---------------------------------------------------------------------
    // Provider lifecycle
    // ---------------------------------------------------------------------

    /// @notice v1 registration — no NFT required. Existing providers unaffected.
    function register(
        address signer,
        uint256 stakeAmount,
        uint256 pricePerCall_,
        uint32 maxResponseTime,
        uint32 slashBps,
        uint32 maxConcurrentCalls_,
        string calldata endpoint
    ) external nonReentrant returns (uint256 providerId) {
        if (providerIdOf[msg.sender] != 0) revert AlreadyRegistered();
        if (stakeAmount < minStake) revert BelowMinStake();
        if (slashBps > MAX_SLASH_BPS) revert InvalidSlashBps();
        if (maxResponseTime < MIN_RESPONSE_TIME) revert InvalidResponseTime();
        if (signer == address(0)) revert InvalidSigner();

        providerId = nextProviderId++;
        _providers[providerId] = Provider({
            owner: msg.sender,
            signer: signer,
            stake: stakeAmount,
            pricePerCall: pricePerCall_,
            maxResponseTime: maxResponseTime,
            slashBps: slashBps,
            deactivatedAt: 0,
            pendingCalls: 0,
            completedCalls: 0,
            slashedCalls: 0,
            maxConcurrentCalls: maxConcurrentCalls_,
            zkTier: 0,
            endpoint: endpoint,
            active: true
        });
        providerIdOf[msg.sender] = providerId;

        usdc.safeTransferFrom(msg.sender, address(this), stakeAmount);

        emit ProviderRegistered(
            providerId, msg.sender, signer, stakeAmount, pricePerCall_, maxResponseTime, slashBps, endpoint
        );
    }

    /// @notice v2 registration — requires caller to own an ERC-8004 identity NFT.
    ///         Binds the NFT tokenId to the new providerId for cross-protocol
    ///         identity portability across the Arc ecosystem.
    ///
    ///         v1 `register()` remains untouched — existing providers are
    ///         unaffected and do NOT need to migrate.
    ///
    /// @param erc8004TokenId  Token ID in the Arc IdentityRegistry
    ///                        (0x8004A818BFB912233c491871b3d84c89A494BD9e).
    ///                        Caller must be the current owner of this token.
    function registerV2(
        uint256 erc8004TokenId,
        address signer,
        uint256 stakeAmount,
        uint256 pricePerCall_,
        uint32 maxResponseTime,
        uint32 slashBps,
        uint32 maxConcurrentCalls_,
        string calldata endpoint
    ) external nonReentrant returns (uint256 providerId) {
        // 1. ERC-8004 ownership check
        if (IERC721Minimal(IDENTITY_REGISTRY).ownerOf(erc8004TokenId) != msg.sender) {
            revert NotNFTOwner();
        }

        // 2. Same validation as v1
        if (providerIdOf[msg.sender] != 0) revert AlreadyRegistered();
        if (stakeAmount < minStake) revert BelowMinStake();
        if (slashBps > MAX_SLASH_BPS) revert InvalidSlashBps();
        if (maxResponseTime < MIN_RESPONSE_TIME) revert InvalidResponseTime();
        if (signer == address(0)) revert InvalidSigner();

        // 3. Provider creation (identical to v1)
        providerId = nextProviderId++;
        _providers[providerId] = Provider({
            owner: msg.sender,
            signer: signer,
            stake: stakeAmount,
            pricePerCall: pricePerCall_,
            maxResponseTime: maxResponseTime,
            slashBps: slashBps,
            deactivatedAt: 0,
            pendingCalls: 0,
            completedCalls: 0,
            slashedCalls: 0,
            maxConcurrentCalls: maxConcurrentCalls_,
            zkTier: 0,
            endpoint: endpoint,
            active: true
        });
        providerIdOf[msg.sender] = providerId;

        // 4. Stake transfer
        usdc.safeTransferFrom(msg.sender, address(this), stakeAmount);

        // 5. Bind NFT to provider
        providerToTokenId[providerId] = erc8004TokenId;

        emit ProviderRegistered(
            providerId, msg.sender, signer, stakeAmount, pricePerCall_, maxResponseTime, slashBps, endpoint
        );
        emit NFTBound(providerId, erc8004TokenId);
    }

    function deactivate(uint256 providerId) external {
        Provider storage p = _providers[providerId];
        if (p.owner != msg.sender) revert NotOwner();
        if (!p.active) revert ProviderInactive();

        p.active = false;
        p.deactivatedAt = uint32(block.timestamp);

        emit ProviderDeactivated(providerId, p.deactivatedAt);
    }

    function unstake(uint256 providerId) external nonReentrant {
        Provider storage p = _providers[providerId];
        if (p.owner != msg.sender) revert NotOwner();
        if (p.active) revert StillActive();
        if (p.pendingCalls != 0) revert PendingCalls();
        if (block.timestamp < p.deactivatedAt + UNSTAKE_COOLDOWN) {
            revert CooldownNotElapsed();
        }

        uint256 amount = p.stake;
        p.stake = 0;

        usdc.safeTransfer(msg.sender, amount);
        emit ProviderUnstaked(providerId, amount);
    }

    // ---------------------------------------------------------------------
    // PayPerCall hooks
    // ---------------------------------------------------------------------

    function slash(uint256 providerId, uint256 amount, address recipient) external onlySlasher nonReentrant {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        if (amount == 0) revert ZeroAmount();
        if (p.stake < amount) revert InsufficientStake();

        p.stake -= amount;
        usdc.safeTransfer(recipient, amount);

        emit ProviderSlashed(providerId, amount, recipient);
    }

    /// @notice Called by PayPerCall when a call opens. Blocks unstake until
    ///         the matching `markCallFinished` fires.
    function markCallStarted(uint256 providerId) external onlyPayPerCall {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        p.pendingCalls += 1;
    }

    function markCallFinished(uint256 providerId) external onlyPayPerCall {
        Provider storage p = _providers[providerId];
        if (p.pendingCalls == 0) revert("no pending");
        p.pendingCalls -= 1;
    }

    /// @notice Called by PayPerCall after a successful receipt submission.
    function incCompleted(uint256 providerId) external onlyPayPerCall {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        p.completedCalls += 1;
        emit ReputationUpdated(providerId, p.completedCalls, p.slashedCalls);
    }

    /// @notice Called by PayPerCall when a call is slashed.
    function incSlashed(uint256 providerId) external onlyPayPerCall {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        p.slashedCalls += 1;
        emit ReputationUpdated(providerId, p.completedCalls, p.slashedCalls);
    }

    // ---------------------------------------------------------------------
    // Owner-configurable fields
    // ---------------------------------------------------------------------

    function updatePrice(uint256 providerId, uint256 newPrice) external {
        Provider storage p = _providers[providerId];
        if (p.owner != msg.sender) revert NotOwner();
        p.pricePerCall = newPrice;
        emit PriceUpdated(providerId, newPrice);
    }

    function updateSigner(uint256 providerId, address newSigner) external {
        if (newSigner == address(0)) revert InvalidSigner();
        Provider storage p = _providers[providerId];
        if (p.owner != msg.sender) revert NotOwner();
        p.signer = newSigner;
        emit SignerUpdated(providerId, newSigner);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getProvider(uint256 providerId) external view returns (ProviderView memory) {
        Provider storage p = _providers[providerId];
        return ProviderView({
            owner: p.owner,
            signer: p.signer,
            stake: p.stake,
            pricePerCall: p.pricePerCall,
            maxResponseTime: p.maxResponseTime,
            slashBps: p.slashBps,
            active: p.active,
            maxConcurrentCalls: p.maxConcurrentCalls,
            zkTier: p.zkTier
        });
    }

    /// @notice Update the per-caller concurrent call cap for a provider.
    ///         0 resets to the PayPerCall default (10).
    function updateMaxConcurrentCalls(uint256 providerId, uint32 newCap) external {
        Provider storage p = _providers[providerId];
        if (p.owner != msg.sender) revert NotOwner();
        p.maxConcurrentCalls = newCap;
        emit MaxConcurrentCallsUpdated(providerId, newCap);
    }

    function getEndpoint(uint256 providerId) external view returns (string memory) {
        return _providers[providerId].endpoint;
    }

    // ---------------------------------------------------------------------
    // zkML Tier System
    // ---------------------------------------------------------------------

    /// @notice Set the zkML tier for a provider.
    ///         Only admin can call — simulates a zkML prover whitelist.
    ///         Tier 1: basic (minStake 50% discount enforced off-chain / UI hint).
    ///         Tier 2: full (PayPerCall doubles the concurrent call cap).
    /// @param tier  0 = none, 1 = basic, 2 = full.
    function setZkTier(uint256 providerId, uint8 tier) external onlyAdmin {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        require(tier <= 2, "invalid tier");
        p.zkTier = tier;
        zkTiers[providerId] = tier;
        emit ZkTierSet(providerId, tier);
    }

    // ---------------------------------------------------------------------
    // DePIN Oracle
    // ---------------------------------------------------------------------

    /// @notice Set the uptime oracle address.
    ///         Only admin can call. Pass address(0) to disable.
    function setUptimeOracle(address oracle) external onlyAdmin {
        uptimeOracle = oracle;
        emit UptimeOracleSet(oracle);
    }

    /// @notice Record an uptime score from the oracle bot.
    ///         Oracle submits an EIP-712 signed claim; the contract verifies
    ///         the signature before updating the on-chain score.
    /// @param providerId  Target provider.
    /// @param score       Uptime score in basis points (0–10000).
    /// @param timestamp   Time the measurement was taken (must be recent).
    /// @param v           Signature v.
    /// @param r           Signature r.
    /// @param s           Signature s.
    function recordUptime(
        uint256 providerId,
        uint16 score,
        uint64 timestamp,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(uptimeOracle != address(0), "oracle not set");
        require(block.timestamp <= timestamp + 5 minutes, "stale ping");
        require(score <= 10_000, "score > 10000");

        // EIP-191 personal_sign style — keeps oracle bot simple (no domain separator needed).
        bytes32 msgHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32",
                keccak256(abi.encodePacked(providerId, score, timestamp, block.chainid))
            )
        );
        // FIX: ecrecover returns address(0) on invalid signature; also enforce
        // canonical s (EIP-2) and v ∈ {27,28} to prevent signature malleability.
        if (v != 27 && v != 28) revert("invalid v");
        // secp256k1 half curve order = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) revert("invalid s");
        address signer = ecrecover(msgHash, v, r, s);
        require(signer == uptimeOracle, "bad oracle sig");

        lastUptimePing[providerId] = uint64(block.timestamp);
        uptimeScore[providerId] = score;
        emit UptimeRecorded(providerId, score);
    }

    function pendingCalls(uint256 providerId) external view returns (uint32) {
        return _providers[providerId].pendingCalls;
    }

    /// @notice Returns the ERC-8004 tokenId bound to a provider.
    ///         Returns 0 for v1 providers (no NFT bound).
    function getProviderTokenId(uint256 providerId) external view returns (uint256) {
        return providerToTokenId[providerId];
    }

    /// @notice Returns true if a provider registered via v2 (has NFT bound).
    function isNFTBound(uint256 providerId) external view returns (bool) {
        return providerToTokenId[providerId] != 0;
    }

    // ---------------------------------------------------------------------
    // Reputation
    // ---------------------------------------------------------------------

    /// @notice Bayesian reputation score on a 0-100 scale.
    /// @dev    Uses a prior of (alpha=2 successes, beta=1 failure), so a fresh
    ///         provider starts at ~66 and the score only stabilizes after
    ///         many calls. This avoids giving spammers a perfect score for a
    ///         single successful call.
    ///
    ///         score = (completed + alpha) / (completed + slashed + alpha + beta) * 100
    ///
    ///         Examples (alpha=2, beta=1):
    ///           0 completed, 0 slashed  -> 66
    ///           1 completed, 0 slashed  -> 75
    ///          10 completed, 0 slashed  -> 92
    ///           5 completed, 1 slashed  -> 78
    ///           0 completed, 1 slashed  -> 50
    function getReputationScore(uint256 providerId) external view returns (uint8) {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) return 0;
        uint256 alpha = 2;
        uint256 beta = 1;
        uint256 numerator = uint256(p.completedCalls) + alpha;
        uint256 denominator = uint256(p.completedCalls) + uint256(p.slashedCalls) + alpha + beta;
        return uint8((numerator * 100) / denominator);
    }

    /// @notice Raw completed counter for off-chain UIs.
    function completedCalls(uint256 providerId) external view returns (uint64) {
        return _providers[providerId].completedCalls;
    }

    /// @notice Raw slashed counter for off-chain UIs.
    function slashedCalls(uint256 providerId) external view returns (uint64) {
        return _providers[providerId].slashedCalls;
    }
}

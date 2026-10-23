// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IServiceRegistryV8 } from "./interfaces/IServiceRegistryV8.sol";

/// @title ServiceRegistryV8
/// @notice Provider registry for CallGuard v8. Adds versioned SLA terms and
///         stake top-up on top of the v7 provider/stake model.
/// @dev    The v8 pair is a fresh deployment. v7 stays deployed and read-only;
///         do not point the v7 registry at v8 while v7 has pending calls.
contract ServiceRegistryV8 is IServiceRegistryV8, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error AlreadyRegistered();
    error NotOwner();
    error NotAdmin();
    error BelowMinStake();
    error InvalidSlashBps();
    error InvalidResponseTime();
    error InvalidAvailabilityTarget();
    error InvalidSigner();
    error InvalidAdmin();
    error InvalidSlasher();
    error InvalidPayPerCall();
    error PayPerCallAlreadySet();
    error ProviderInactive();
    error StillActive();
    error PendingCalls();
    error CooldownNotElapsed();
    error OnlyPayPerCall();
    error OnlySlasher();
    error UnknownProvider();
    error InsufficientStake();
    error ZeroAmount();
    error UnknownTerms();
    error NoPendingTerms();
    error TermsTimelockNotElapsed();
    error NoPendingCalls();

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    uint32 public constant MIN_RESPONSE_TIME = 5;
    uint16 public constant MAX_SLASH_BPS = 10_000;
    uint16 public constant MAX_AVAILABILITY_BPS = 10_000;
    uint32 public constant TERMS_TIMELOCK = 2 days;
    uint32 public constant UNSTAKE_COOLDOWN = 1 hours;

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    struct Provider {
        address owner;
        address signer;
        uint256 stake;
        uint256 pricePerCall;
        uint32 deactivatedAt;
        uint32 pendingCalls;
        uint64 completedCalls;
        uint64 slashedCalls;
        uint32 maxConcurrentCalls;
        uint8 zkTier;
        string endpoint;
        bool active;
    }

    IERC20 public immutable usdc;
    uint256 public immutable minStake;
    address public admin;
    address public payPerCall;

    mapping(uint256 => Provider) internal _providers;
    mapping(address => uint256) public providerIdOf;
    uint256 public nextProviderId = 1;

    /// @notice Dispute contracts authorized to slash in addition to PayPerCall.
    mapping(address => bool) public authorizedSlashers;

    mapping(uint256 => mapping(uint32 => SLATerms)) internal _terms;
    mapping(uint256 => uint32) internal _latestTermsVersion;
    mapping(uint256 => TermsInput) internal _pendingTerms;
    mapping(uint256 => uint32) internal _pendingTermsVersion;
    mapping(uint256 => uint64) internal _pendingTermsExecuteAt;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event ProviderDeactivated(uint256 indexed providerId, uint32 deactivatedAt);
    event ProviderUnstaked(uint256 indexed providerId, uint256 amount);
    event PriceUpdated(uint256 indexed providerId, uint256 newPrice);
    event SignerUpdated(uint256 indexed providerId, address newSigner);
    event MaxConcurrentCallsUpdated(uint256 indexed providerId, uint32 newCap);
    event PayPerCallSet(address indexed payPerCall);
    event SlasherAuthorized(address indexed slasher);
    event SlasherRevoked(address indexed slasher);

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyPayPerCall() {
        if (msg.sender != payPerCall) revert OnlyPayPerCall();
        _;
    }

    modifier onlySlasher() {
        if (msg.sender != payPerCall && !authorizedSlashers[msg.sender]) {
            revert OnlySlasher();
        }
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(IERC20 _usdc, uint256 _minStake, address _admin) {
        if (_admin == address(0)) revert InvalidAdmin();
        usdc = _usdc;
        minStake = _minStake;
        admin = _admin;
    }

    /// @notice One-time wire-up of the v8 PayPerCall contract.
    function setPayPerCall(address _payPerCall) external onlyAdmin {
        if (payPerCall != address(0)) revert PayPerCallAlreadySet();
        if (_payPerCall == address(0)) revert InvalidPayPerCall();
        payPerCall = _payPerCall;
        emit PayPerCallSet(_payPerCall);
    }

    /// @notice Hand registry administration to a separate address.
    /// @dev Lets a hot deployer pay gas and wire the pair, then hand admin to a
    ///      multisig without ever putting the multisig key in the deploy shell.
    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert InvalidAdmin();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    /// @notice Authorize a dispute contract to call `slash`.
    function authorizeSlasher(address slasher) external onlyAdmin {
        if (slasher == address(0)) revert InvalidSlasher();
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

    function register(
        address signer,
        uint256 stakeAmount,
        uint256 pricePerCall,
        uint32 maxResponseTime,
        uint16 slashBps,
        uint16 availabilityTargetBps,
        uint32 maxConcurrentCalls,
        string calldata endpoint,
        bytes32 termsHash,
        string calldata termsUri
    ) external nonReentrant returns (uint256 providerId) {
        if (providerIdOf[msg.sender] != 0) revert AlreadyRegistered();
        if (stakeAmount < minStake) revert BelowMinStake();
        _validateTerms(maxResponseTime, slashBps, availabilityTargetBps);
        if (signer == address(0)) revert InvalidSigner();

        providerId = nextProviderId++;
        _providers[providerId] = Provider({
            owner: msg.sender,
            signer: signer,
            stake: stakeAmount,
            pricePerCall: pricePerCall,
            deactivatedAt: 0,
            pendingCalls: 0,
            completedCalls: 0,
            slashedCalls: 0,
            maxConcurrentCalls: maxConcurrentCalls,
            zkTier: 0,
            endpoint: endpoint,
            active: true
        });
        providerIdOf[msg.sender] = providerId;

        _terms[providerId][1] = SLATerms({
            version: 1,
            maxResponseTime: maxResponseTime,
            slashBps: slashBps,
            availabilityTargetBps: availabilityTargetBps,
            termsHash: termsHash,
            termsUri: termsUri,
            effectiveAt: uint64(block.timestamp),
            active: true
        });
        _latestTermsVersion[providerId] = 1;

        usdc.safeTransferFrom(msg.sender, address(this), stakeAmount);

        emit ProviderRegistered(providerId, msg.sender, signer, stakeAmount, pricePerCall, 1, termsHash, endpoint);
        emit TermsUpdated(providerId, 1, termsHash, uint64(block.timestamp));
    }

    /// @notice Add USDC to an existing provider's stake.
    function addStake(uint256 providerId, uint256 amount) external nonReentrant {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        if (p.owner != msg.sender) revert NotOwner();
        if (amount == 0) revert ZeroAmount();

        p.stake += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit StakeAdded(providerId, amount, p.stake);
    }

    function deactivate(uint256 providerId) external {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        if (p.owner != msg.sender) revert NotOwner();
        if (!p.active) revert ProviderInactive();

        p.active = false;
        p.deactivatedAt = uint32(block.timestamp);

        emit ProviderDeactivated(providerId, p.deactivatedAt);
    }

    function unstake(uint256 providerId) external nonReentrant {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        if (p.owner != msg.sender) revert NotOwner();
        if (p.active) revert StillActive();
        if (p.pendingCalls != 0) revert PendingCalls();
        if (block.timestamp < uint256(p.deactivatedAt) + UNSTAKE_COOLDOWN) {
            revert CooldownNotElapsed();
        }

        uint256 amount = p.stake;
        p.stake = 0;

        usdc.safeTransfer(msg.sender, amount);
        emit ProviderUnstaked(providerId, amount);
    }

    // ---------------------------------------------------------------------
    // Terms
    // ---------------------------------------------------------------------

    function proposeTermsUpdate(uint256 providerId, TermsInput calldata input)
        external
        returns (uint32 proposedVersion)
    {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        if (p.owner != msg.sender) revert NotOwner();
        _validateTerms(input.maxResponseTime, input.slashBps, input.availabilityTargetBps);

        proposedVersion = _latestTermsVersion[providerId] + 1;
        _pendingTerms[providerId] = input;
        _pendingTermsVersion[providerId] = proposedVersion;
        _pendingTermsExecuteAt[providerId] = uint64(block.timestamp + TERMS_TIMELOCK);

        emit TermsProposed(providerId, proposedVersion, input.termsHash, _pendingTermsExecuteAt[providerId]);
    }

    function executeTermsUpdate(uint256 providerId) external returns (uint32 version) {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        if (p.owner != msg.sender) revert NotOwner();

        version = _pendingTermsVersion[providerId];
        if (version == 0) revert NoPendingTerms();

        uint64 executeAt = _pendingTermsExecuteAt[providerId];
        if (block.timestamp < executeAt) revert TermsTimelockNotElapsed();

        TermsInput storage pending = _pendingTerms[providerId];
        bytes32 termsHash = pending.termsHash;
        uint64 effectiveAt = uint64(block.timestamp);

        _terms[providerId][version] = SLATerms({
            version: version,
            maxResponseTime: pending.maxResponseTime,
            slashBps: pending.slashBps,
            availabilityTargetBps: pending.availabilityTargetBps,
            termsHash: termsHash,
            termsUri: pending.termsUri,
            effectiveAt: effectiveAt,
            active: true
        });
        _latestTermsVersion[providerId] = version;

        delete _pendingTerms[providerId];
        _pendingTermsVersion[providerId] = 0;
        _pendingTermsExecuteAt[providerId] = 0;

        emit TermsUpdated(providerId, version, termsHash, effectiveAt);
    }

    function cancelTermsUpdate(uint256 providerId) external {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        if (p.owner != msg.sender) revert NotOwner();

        uint32 version = _pendingTermsVersion[providerId];
        if (version == 0) revert NoPendingTerms();

        delete _pendingTerms[providerId];
        _pendingTermsVersion[providerId] = 0;
        _pendingTermsExecuteAt[providerId] = 0;

        emit TermsProposalCancelled(providerId, version);
    }

    function getPendingTerms(uint256 providerId)
        external
        view
        returns (TermsInput memory input, uint32 proposedVersion, uint64 executeAt)
    {
        return (_pendingTerms[providerId], _pendingTermsVersion[providerId], _pendingTermsExecuteAt[providerId]);
    }

    function getTerms(uint256 providerId, uint32 version) external view returns (SLATerms memory) {
        uint32 latest = _latestTermsVersion[providerId];
        if (version == 0 || version > latest) revert UnknownTerms();
        return _terms[providerId][version];
    }

    function latestTermsVersion(uint256 providerId) external view returns (uint32) {
        return _latestTermsVersion[providerId];
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

    function markCallStarted(uint256 providerId) external onlyPayPerCall {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        p.pendingCalls += 1;
    }

    function markCallFinished(uint256 providerId) external onlyPayPerCall {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        if (p.pendingCalls == 0) revert NoPendingCalls();
        p.pendingCalls -= 1;
    }

    function incCompleted(uint256 providerId) external onlyPayPerCall {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        p.completedCalls += 1;
        emit ReputationUpdated(providerId, p.completedCalls, p.slashedCalls);
    }

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
        if (p.owner == address(0)) revert UnknownProvider();
        if (p.owner != msg.sender) revert NotOwner();
        p.pricePerCall = newPrice;
        emit PriceUpdated(providerId, newPrice);
    }

    function updateSigner(uint256 providerId, address newSigner) external {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        if (p.owner != msg.sender) revert NotOwner();
        if (newSigner == address(0)) revert InvalidSigner();
        p.signer = newSigner;
        emit SignerUpdated(providerId, newSigner);
    }

    function updateMaxConcurrentCalls(uint256 providerId, uint32 newCap) external {
        Provider storage p = _providers[providerId];
        if (p.owner == address(0)) revert UnknownProvider();
        if (p.owner != msg.sender) revert NotOwner();
        p.maxConcurrentCalls = newCap;
        emit MaxConcurrentCallsUpdated(providerId, newCap);
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
            latestTermsVersion: _latestTermsVersion[providerId],
            active: p.active,
            pendingCalls: p.pendingCalls,
            completedCalls: p.completedCalls,
            slashedCalls: p.slashedCalls,
            maxConcurrentCalls: p.maxConcurrentCalls,
            zkTier: p.zkTier
        });
    }

    function getEndpoint(uint256 providerId) external view returns (string memory) {
        return _providers[providerId].endpoint;
    }

    function pendingCalls(uint256 providerId) external view returns (uint32) {
        return _providers[providerId].pendingCalls;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _validateTerms(uint32 maxResponseTime, uint16 slashBps, uint16 availabilityTargetBps) internal pure {
        if (maxResponseTime < MIN_RESPONSE_TIME) revert InvalidResponseTime();
        if (slashBps > MAX_SLASH_BPS) revert InvalidSlashBps();
        if (availabilityTargetBps > MAX_AVAILABILITY_BPS) revert InvalidAvailabilityTarget();
    }
}

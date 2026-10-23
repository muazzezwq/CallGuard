// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IServiceRegistryV8
/// @notice Provider registry for CallGuard v8. Adds versioned SLA terms and
///         stake top-up on top of the v7 provider/stake model.
/// @dev    This is an interface only. The implementation must preserve the
///         v7 rule that only the active PayPerCall contract can mark calls.
interface IServiceRegistryV8 {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Input used to propose a new SLA terms version.
    struct TermsInput {
        uint32 maxResponseTime;
        uint16 slashBps;
        /// @notice Rolling availability target in basis points. 0 = unspecified.
        uint16 availabilityTargetBps;
        /// @notice Hash of the off-chain terms document.
        bytes32 termsHash;
        /// @notice IPFS CID or HTTPS URI for the terms document.
        string termsUri;
    }

    /// @notice Immutable SLA terms version.
    struct SLATerms {
        uint32 version;
        uint32 maxResponseTime;
        uint16 slashBps;
        uint16 availabilityTargetBps;
        bytes32 termsHash;
        string termsUri;
        uint64 effectiveAt;
        bool active;
    }

    /// @notice Provider view used by PayPerCall and the frontend.
    struct ProviderView {
        address owner;
        address signer;
        uint256 stake;
        uint256 pricePerCall;
        uint32 latestTermsVersion;
        bool active;
        uint32 pendingCalls;
        uint64 completedCalls;
        uint64 slashedCalls;
        uint32 maxConcurrentCalls;
        uint8 zkTier;
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event ProviderRegistered(
        uint256 indexed providerId,
        address indexed owner,
        address signer,
        uint256 stake,
        uint256 pricePerCall,
        uint32 indexed termsVersion,
        bytes32 termsHash,
        string endpoint
    );
    event StakeAdded(uint256 indexed providerId, uint256 amount, uint256 newStake);
    event TermsProposed(
        uint256 indexed providerId, uint32 indexed proposedVersion, bytes32 termsHash, uint64 executeAt
    );
    event TermsUpdated(uint256 indexed providerId, uint32 indexed version, bytes32 termsHash, uint64 effectiveAt);
    event TermsProposalCancelled(uint256 indexed providerId, uint32 indexed proposedVersion);
    event ProviderSlashed(uint256 indexed providerId, uint256 amount, address recipient);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event ReputationUpdated(uint256 indexed providerId, uint64 completedCalls, uint64 slashedCalls);

    // ---------------------------------------------------------------------
    // Provider lifecycle
    // ---------------------------------------------------------------------

    /// @notice Register a provider and create SLA terms version 1.
    /// @param signer Address that signs receipts for this provider.
    /// @param stakeAmount Initial USDC stake, pulled from the caller.
    /// @param pricePerCall USDC price per call, 6 decimals.
    /// @param maxResponseTime SLA response window in seconds.
    /// @param slashBps Slash in basis points of stake per timeout.
    /// @param availabilityTargetBps Rolling availability target. 0 = unspecified.
    /// @param maxConcurrentCalls Per-caller concurrent call cap. 0 = default.
    /// @param endpoint Provider endpoint recorded for discovery.
    /// @param termsHash Hash of the off-chain terms document.
    /// @param termsUri IPFS CID or HTTPS URI for the terms document.
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
    ) external returns (uint256 providerId);

    /// @notice Add USDC to an existing provider's stake.
    function addStake(uint256 providerId, uint256 amount) external;

    // ---------------------------------------------------------------------
    // Terms
    // ---------------------------------------------------------------------

    /// @notice Propose a new terms version. It becomes executable after the
    ///         registry's terms timelock.
    function proposeTermsUpdate(uint256 providerId, TermsInput calldata input) external returns (uint32 proposedVersion);

    /// @notice Execute the pending terms update and create the next version.
    function executeTermsUpdate(uint256 providerId) external returns (uint32 version);

    /// @notice Cancel a pending terms update.
    function cancelTermsUpdate(uint256 providerId) external;

    /// @notice Read the pending terms update.
    /// @return input The proposed terms.
    /// @return proposedVersion The version that will be created.
    /// @return executeAt The earliest execution timestamp.
    function getPendingTerms(uint256 providerId)
        external
        view
        returns (TermsInput memory input, uint32 proposedVersion, uint64 executeAt);

    /// @notice Read a specific terms version.
    /// @dev Reverts if the version does not exist.
    function getTerms(uint256 providerId, uint32 version) external view returns (SLATerms memory);

    /// @notice Latest terms version for a provider.
    function latestTermsVersion(uint256 providerId) external view returns (uint32);

    // ---------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------

    function getProvider(uint256 providerId) external view returns (ProviderView memory);

    function getEndpoint(uint256 providerId) external view returns (string memory);

    function minStake() external view returns (uint256);

    function admin() external view returns (address);

    function transferAdmin(address newAdmin) external;

    function payPerCall() external view returns (address);

    // ---------------------------------------------------------------------
    // PayPerCall hooks
    // ---------------------------------------------------------------------

    /// @notice Slash a provider's stake. Restricted to PayPerCall or an
    ///         authorized dispute contract.
    function slash(uint256 providerId, uint256 amount, address recipient) external;

    function markCallStarted(uint256 providerId) external;

    function markCallFinished(uint256 providerId) external;

    function incCompleted(uint256 providerId) external;

    function incSlashed(uint256 providerId) external;
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IServiceRegistry
/// @notice Minimal surface that PayPerCall depends on. Keeping this as an
///         interface means PayPerCall doesn't need the full ServiceRegistry
///         implementation at compile time.
interface IServiceRegistry {
    struct ProviderView {
        address owner;
        address signer;
        uint256 stake;
        uint256 pricePerCall;
        uint32 maxResponseTime;
        uint32 slashBps;
        bool active;
        /// @notice Per-caller concurrent call cap (0 = use default of 10).
        uint32 maxConcurrentCalls;
        /// @notice zkML tier: 0 = none, 1 = basic (stake -50%), 2 = full (cap x2).
        uint8 zkTier;
    }

    function getProvider(uint256 providerId) external view returns (ProviderView memory);

    function admin() external view returns (address);

    function slash(uint256 providerId, uint256 amount, address recipient) external;

    function markCallStarted(uint256 providerId) external;

    function markCallFinished(uint256 providerId) external;

    /// @notice Called by PayPerCall on successful receipt submission.
    function incCompleted(uint256 providerId) external;

    /// @notice Called by PayPerCall when a call is slashed due to timeout.
    function incSlashed(uint256 providerId) external;
}

// ---------------------------------------------------------------------------
// ERC-8004 ReputationRegistry — minimal write interface
// Arc Testnet address: 0x8004B663056A597Dffe9eCcC1965A193B7388713
// Used by PayPerCall to record reputation events on-chain.
// ---------------------------------------------------------------------------
interface IERC8004ReputationRegistry {
    /// @notice Record a reputation event for an agent.
    /// @param agentId  ERC-8004 identity token ID (matches providerId in ServiceRegistry).
    /// @param score    Signed delta score (+1 for success, -1 for slash). Registry clamps.
    /// @param eventUri IPFS / HTTPS URI with structured event metadata (callId, timestamp, etc).
    function record(uint256 agentId, int8 score, string calldata eventUri) external;
}

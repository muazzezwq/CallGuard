// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IDisputeV2
/// @notice Call-bound dispute and arbitration surface for CallGuard v8.
/// @dev    The implementation must read the settlement timestamp from
///         PayPerCallV8.Call.completedAt. It must not accept a caller-supplied
///         settledAt value.
interface IDisputeV2 {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum Status {
        None,
        Pending,
        Upheld,
        Rejected,
        Appealed,
        AppealUpheld,
        AppealRejected
    }

    struct DisputeRecord {
        bytes32 callId;
        address caller;
        uint256 providerId;
        uint64 openedAt;
        uint64 resolvedAt;
        uint64 appealAt;
        uint256 bond;
        uint256 appealBond;
        Status status;
        string evidenceUri;
        string appealUri;
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event DisputeOpened(uint256 indexed disputeId, bytes32 indexed callId, address indexed caller, uint256 providerId);
    event DisputeResolved(uint256 indexed disputeId, Status status, uint256 slashAmount);
    event DisputeAppealed(uint256 indexed disputeId, string evidenceUri);
    event AppealResolved(uint256 indexed disputeId, Status status, uint256 slashAmount);
    event BondReclaimed(uint256 indexed disputeId, address indexed caller, uint256 amount);
    event ArbiterChanged(address indexed previous, address indexed next);
    event AppealArbiterChanged(address indexed previous, address indexed next);
    event TreasuryChanged(address indexed previous, address indexed next);
    event DisputeFinalized(uint256 indexed disputeId, Status status, uint256 slashAmount);

    // ---------------------------------------------------------------------
    // Caller actions
    // ---------------------------------------------------------------------

    /// @notice Open a dispute for a completed call.
    /// @dev Reverts unless the call is Completed and the current time is within
    ///      disputeWindow of Call.completedAt.
    function openDispute(bytes32 callId, uint256 providerId, string calldata evidenceUri)
        external
        returns (uint256 disputeId);

    /// @notice Appeal a resolved dispute once.
    function appeal(uint256 disputeId, string calldata evidenceUri) external;

    /// @notice Reclaim the bond when the arbiter misses the resolution window.
    function reclaimExpiredBond(uint256 disputeId) external;

    /// @notice Release a first-instance upward slash after the appeal window
    ///         closes without an appeal.
    function finalize(uint256 disputeId) external;

    // ---------------------------------------------------------------------
    // Arbiter actions
    // ---------------------------------------------------------------------

    function resolve(uint256 disputeId, bool upheld) external;

    function resolveAppeal(uint256 disputeId, bool upheld) external;

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getDispute(uint256 disputeId) external view returns (DisputeRecord memory);

    function getDisputeByCallId(bytes32 callId) external view returns (DisputeRecord memory);

    function disputeIdByCallId(bytes32 callId) external view returns (uint256);

    function disputeWindow() external view returns (uint32);

    function appealWindow() external view returns (uint32);

    function resolutionWindow() external view returns (uint32);

    function disputeBond() external view returns (uint256);

    function appealBond() external view returns (uint256);

    function arbiter() external view returns (address);

    function appealArbiter() external view returns (address);

    function treasury() external view returns (address);

    function disputeSlashBps() external view returns (uint16);

    function heldSlash(uint256 disputeId) external view returns (uint256);

    function settled(uint256 disputeId) external view returns (bool);
}

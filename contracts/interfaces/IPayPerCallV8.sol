// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPayPerCallV8
/// @notice Escrow and SLA enforcement surface for CallGuard v8.
/// @dev    Interface only. The implementation must use EIP-712 domain
///         ("ArcSLA", "2") and type
///         Receipt(bytes32 callId,bytes32 responseHash,uint64 respondedAt,uint32 termsVersion).
interface IPayPerCallV8 {
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
        /// @notice Set by submitReceipt; used by DisputeV2 for its window.
        uint32 completedAt;
        uint32 termsVersion;
        bytes32 termsHash;
        bytes32 requestHash;
        bytes32 responseHash;
        CallStatus status;
    }

    struct Receipt {
        bytes32 callId;
        bytes32 responseHash;
        uint64 respondedAt;
        uint32 termsVersion;
    }

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event CallStarted(
        bytes32 indexed callId,
        uint256 indexed providerId,
        address indexed caller,
        uint256 amount,
        uint32 termsVersion,
        bytes32 termsHash,
        bytes32 requestHash,
        uint32 deadline
    );
    event ReceiptSubmitted(bytes32 indexed callId, bytes32 responseHash, uint64 respondedAt, uint32 termsVersion);
    event CallSlashed(bytes32 indexed callId, uint256 refunded, uint256 slashed, uint256 keeperBounty);
    event KeeperBountyPaid(bytes32 indexed callId, address indexed keeper, uint256 amount);
    event Claimed(address indexed account, uint256 amount);

    // ---------------------------------------------------------------------
    // Calls
    // ---------------------------------------------------------------------

    /// @notice Open a call and pull the provider's price into escrow.
    function callService(uint256 providerId, bytes32 requestHash) external returns (bytes32 callId);

    /// @notice Open a call for a different beneficiary.
    function callServiceFor(uint256 providerId, bytes32 requestHash, address beneficiary)
        external
        returns (bytes32 callId);

    /// @notice Open a call with an inline EIP-3009 authorization.
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
    ) external returns (bytes32 callId);

    // ---------------------------------------------------------------------
    // Close
    // ---------------------------------------------------------------------

    /// @notice Submit a provider-signed receipt.
    /// @dev Reverts when the response hash is zero, respondedAt is after the
    ///      deadline, the transaction is after deadline + SUBMIT_GRACE, the
    ///      terms version does not match the call, or the digest was used.
    function submitReceipt(
        bytes32 callId,
        bytes32 responseHash,
        uint64 respondedAt,
        uint32 termsVersion,
        bytes calldata signature
    ) external;

    /// @notice Refund the caller and slash the provider after the grace period.
    /// @return refunded Escrow amount credited to the caller.
    /// @return slashed Slash amount credited to the caller after the bounty.
    /// @return bounty Bounty credited to msg.sender.
    function claimTimeout(bytes32 callId) external returns (uint256 refunded, uint256 slashed, uint256 bounty);

    /// @notice Withdraw a claimable balance.
    function claim() external;

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getCall(bytes32 callId) external view returns (Call memory);

    function hashReceipt(Receipt calldata receipt) external view returns (bytes32);

    function usedReceipts(bytes32 digest) external view returns (bool);

    function claimable(address account) external view returns (uint256);

    function registry() external view returns (address);

    function SUBMIT_GRACE() external view returns (uint32);

    function keeperBountyBps() external view returns (uint16);

    function MAX_KEEPER_BOUNTY() external view returns (uint256);
}

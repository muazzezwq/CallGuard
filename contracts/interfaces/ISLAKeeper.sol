// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISLAKeeper
/// @notice Permissionless timeout crank for CallGuard v8.
/// @dev    The keeper never holds user funds. Refunds and slash credits stay in
///         PayPerCallV8.claimable; only the bounded bounty is paid to the caller
///         of this contract.
interface ISLAKeeper {
    event TimeoutClaimed(
        bytes32 indexed callId, address indexed keeper, uint256 refunded, uint256 slashed, uint256 bounty
    );
    event BatchClaimed(address indexed keeper, uint256 count);
    event BountyWithdrawn(address indexed keeper, uint256 amount);

    /// @notice True when PayPerCallV8.claimTimeout would succeed.
    function isClaimable(bytes32 callId) external view returns (bool);

    /// @notice Claim one timed-out call.
    /// @return refunded Escrow amount credited to the caller.
    /// @return slashed Slash amount credited to the caller after the bounty.
    /// @return bounty Bounty credited to msg.sender.
    function claim(bytes32 callId) external returns (uint256 refunded, uint256 slashed, uint256 bounty);

    /// @notice Claim several timed-out calls. Skips calls that are not claimable.
    function claimBatch(bytes32[] calldata callIds)
        external
        returns (uint256[] memory refunded, uint256[] memory slashed, uint256[] memory bounties);

    function payPerCall() external view returns (address);

    function bountyBps() external view returns (uint16);

    function maxBounty() external view returns (uint256);

    /// @notice Bounty accrued to a keeper, withdrawable with withdrawBounty().
    function bountyClaimable(address keeper) external view returns (uint256);

    /// @notice Withdraw the caller's accrued keeper bounty.
    function withdrawBounty() external;
}

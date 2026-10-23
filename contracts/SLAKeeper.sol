// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IPayPerCallV8 } from "./interfaces/IPayPerCallV8.sol";
import { ISLAKeeper } from "./interfaces/ISLAKeeper.sol";

/// @title SLAKeeper
/// @notice Permissionless timeout crank. The keeper never custodies caller
///         refunds: those stay in PayPerCallV8.claimable. Only the bounded
///         keeper bounty is pulled here and credited to the calling keeper.
contract SLAKeeper is ISLAKeeper, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error InvalidAddress();
    error NothingToWithdraw();

    IPayPerCallV8 internal immutable _payPerCall;
    IERC20 internal immutable _usdc;

    /// @notice Bounty accrued to each keeper, withdrawable with withdrawBounty().
    mapping(address => uint256) public bountyClaimable;

    constructor(IPayPerCallV8 payPerCall_, IERC20 usdc_) {
        if (address(payPerCall_) == address(0) || address(usdc_) == address(0)) revert InvalidAddress();
        _payPerCall = payPerCall_;
        _usdc = usdc_;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function isClaimable(bytes32 callId) public view returns (bool) {
        IPayPerCallV8.Call memory call_ = _payPerCall.getCall(callId);
        return call_.status == IPayPerCallV8.CallStatus.Pending
            && block.timestamp > uint256(call_.deadline) + _payPerCall.SUBMIT_GRACE();
    }

    function payPerCall() external view returns (address) {
        return address(_payPerCall);
    }

    function usdc() external view returns (address) {
        return address(_usdc);
    }

    function bountyBps() external view returns (uint16) {
        return _payPerCall.keeperBountyBps();
    }

    function maxBounty() external view returns (uint256) {
        return _payPerCall.MAX_KEEPER_BOUNTY();
    }

    // ---------------------------------------------------------------------
    // Claims
    // ---------------------------------------------------------------------

    function claim(bytes32 callId)
        external
        nonReentrant
        returns (uint256 refunded, uint256 slashed, uint256 bounty)
    {
        (refunded, slashed, bounty) = _payPerCall.claimTimeout(callId);

        if (bounty > 0) {
            _payPerCall.claim();
            bountyClaimable[msg.sender] += bounty;
        }

        emit TimeoutClaimed(callId, msg.sender, refunded, slashed, bounty);
    }

    function claimBatch(bytes32[] calldata callIds)
        external
        nonReentrant
        returns (uint256[] memory refunded, uint256[] memory slashed, uint256[] memory bounties)
    {
        uint256 length = callIds.length;
        refunded = new uint256[](length);
        slashed = new uint256[](length);
        bounties = new uint256[](length);

        uint256 claimed;
        uint256 totalBounty;

        for (uint256 i; i < length; i++) {
            if (!isClaimable(callIds[i])) continue;

            (refunded[i], slashed[i], bounties[i]) = _payPerCall.claimTimeout(callIds[i]);
            totalBounty += bounties[i];
            claimed++;
        }

        if (totalBounty > 0) {
            _payPerCall.claim();
            bountyClaimable[msg.sender] += totalBounty;
        }

        emit BatchClaimed(msg.sender, claimed);
    }

    function withdrawBounty() external nonReentrant {
        uint256 amount = bountyClaimable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        bountyClaimable[msg.sender] = 0;
        _usdc.safeTransfer(msg.sender, amount);

        emit BountyWithdrawn(msg.sender, amount);
    }
}

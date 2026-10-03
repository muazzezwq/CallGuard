// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IPayPerCall } from "./interfaces/IPayPerCall.sol";

/// @title CrossChainReceiver
/// @notice Receives CCTP-minted USDC on Arc Testnet and automatically
///         triggers PayPerCall.callService() with encoded parameters.
/// @dev    Only callable by Circle's official MessageTransmitter.
contract CrossChainReceiver is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    address public constant MESSAGE_TRANSMITTER = 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275;

    IERC20 public immutable usdc;
    IPayPerCall public immutable payPerCall;

    event CrossChainCallTriggered(
        bytes32 indexed callId,
        uint256 indexed providerId,
        address indexed originalCaller,
        uint256 amount
    );

    error UnauthorizedCaller();
    error InvalidHookData();

    constructor(IERC20 _usdc, IPayPerCall _payPerCall)
        Ownable(msg.sender)
    {
        usdc = _usdc;
        payPerCall = _payPerCall;
    }

    /// @notice Circle CCTP callback — called after USDC mint on Arc
    /// @dev hookData: abi.encode(uint256 providerId, bytes32 requestHash, address originalCaller)
    function handleReceiveFinalizedTransfer(
        address token,
        uint256 amount,
        address depositor,
        bytes calldata hookData,
        bytes32,
        bytes32
    ) external nonReentrant {
        if (msg.sender != MESSAGE_TRANSMITTER) revert UnauthorizedCaller();
        if (address(token) != address(usdc)) revert InvalidHookData();
        if (hookData.length != 96) revert InvalidHookData();

        uint256 providerId = abi.decode(hookData[0:32], (uint256));
        bytes32 requestHash = abi.decode(hookData[32:64], (bytes32));
        address originalCaller = abi.decode(hookData[64:96], (address));

        if (depositor != address(this)) revert InvalidHookData();

        usdc.forceApprove(address(payPerCall), amount);

        // NOTE: msg.sender in callService() = address(this) = CrossChainReceiver
        // originalCaller is tracked via event only
        bytes32 callId = payPerCall.callService(providerId, requestHash);

        emit CrossChainCallTriggered(callId, providerId, originalCaller, amount);
    }

    /// @notice Emergency withdrawal — owner only
    function recoverTokens(IERC20 token, uint256 amount, address to) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}

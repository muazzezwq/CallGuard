// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IPayPerCall } from "./interfaces/IPayPerCall.sol";

interface IServiceRegistryView {
    function getProvider(uint256 providerId) external view returns (
        address owner,
        address signer,
        uint256 stake,
        uint256 pricePerCall,
        uint32 maxResponseTime,
        uint32 slashBps,
        bool active,
        uint32 maxConcurrentCalls,
        uint8 zkTier
    );
}

/// @title CrossChainReceiver
/// @notice Receives CCTP-minted USDC on Arc Testnet and automatically
///         triggers PayPerCall.callService() with encoded parameters.
/// @dev    Only callable by Circle's official MessageTransmitter.
contract CrossChainReceiver is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    address public constant MESSAGE_TRANSMITTER = 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275;

    IERC20 public immutable usdc;
    IPayPerCall public immutable payPerCall;
    /// @notice Optional registry for amount-vs-price checks. address(0) = skip.
    IServiceRegistryView public registry;
    /// @notice Processed CCTP messages — prevents double-delivery double-spend.
    mapping(bytes32 => bool) public processedMessages;

    event CrossChainCallTriggered(
        bytes32 indexed callId,
        uint256 indexed providerId,
        address indexed originalCaller,
        uint256 amount
    );

    error UnauthorizedCaller();
    error InvalidHookData();
    error AlreadyProcessed();
    error AmountMismatch();

    constructor(IERC20 _usdc, IPayPerCall _payPerCall)
        Ownable(msg.sender)
    {
        usdc = _usdc;
        payPerCall = _payPerCall;
    }

    /// @notice Circle CCTP callback — called after USDC mint on Arc
    /// @dev hookData: abi.encode(uint256 providerId, bytes32 requestHash, address originalCaller)
    ///      Refunds on timeout accrue to originalCaller via PayPerCall.claim().
    function handleReceiveFinalizedTransfer(
        address token,
        uint256 amount,
        address depositor,
        bytes calldata hookData,
        bytes32 messageId,
        bytes32 nonce
    ) external nonReentrant {
        if (msg.sender != MESSAGE_TRANSMITTER) revert UnauthorizedCaller();
        if (address(token) != address(usdc)) revert InvalidHookData();
        if (hookData.length != 96) revert InvalidHookData();

        // Idempotency — transmitter retries/redeliveries must not double-spend.
        bytes32 msgKey = keccak256(abi.encode(token, amount, depositor, hookData, messageId, nonce));
        if (processedMessages[msgKey]) revert AlreadyProcessed();
        processedMessages[msgKey] = true;

        uint256 providerId = abi.decode(hookData[0:32], (uint256));
        bytes32 requestHash = abi.decode(hookData[32:64], (bytes32));
        address originalCaller = abi.decode(hookData[64:96], (address));

        if (depositor != address(this)) revert InvalidHookData();
        if (originalCaller == address(0)) revert InvalidHookData();

        // Amount must match the provider price when registry is wired —
        // otherwise surplus locks in this contract (shortfall reverts below).
        if (address(registry) != address(0)) {
            (, , , uint256 pricePerCall, , , , , ) = registry.getProvider(providerId);
            if (amount != pricePerCall) revert AmountMismatch();
        }

        usdc.forceApprove(address(payPerCall), amount);

        bytes32 callId = payPerCall.callServiceFor(providerId, requestHash, originalCaller);

        emit CrossChainCallTriggered(callId, providerId, originalCaller, amount);
    }

    /// @notice Wire (or clear) the registry used for amount checks. Owner only.
    function setRegistry(address _registry) external onlyOwner {
        registry = IServiceRegistryView(_registry);
    }

    /// @notice Emergency withdrawal — owner only
    function recoverTokens(IERC20 token, uint256 amount, address to) external onlyOwner {
        token.safeTransfer(to, amount);
    }
}

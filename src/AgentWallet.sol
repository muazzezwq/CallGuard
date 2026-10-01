// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IPayPerCall } from "./interfaces/IPayPerCall.sol";

contract AgentWallet is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error NotOwner();
    error NotAgent();
    error ZeroAddress();
    error PausedState();
    error ExceedsMaxPerCall();
    error ExceedsDailyLimit();
    error ProviderNotWhitelisted();
    error AlreadyWhitelisted();
    error NotWhitelisted();
    error ActualSpendMismatch(uint256 expected, uint256 actual);

    event Deposited(address owner, uint256 amount);
    event Withdrawn(address owner, uint256 amount);
    event AgentCallMade(bytes32 callId, uint256 providerId, uint256 amount, uint256 remainingToday);
    event LimitUpdated(uint256 dailyLimit, uint256 maxPerCall);
    event AgentUpdated(address newAgent);
    event Paused(address by);
    event Unpaused(address by);

    address public owner;
    address public agent;
    address public usdc;
    address public payPerCall;
    uint256 public dailyLimit;
    uint256 public maxPerCall;
    uint256 public spentToday;
    uint256 public lastResetTime;
    bool public paused;
    uint256 public totalSpent;
    uint256 public totalCalls;

    mapping(uint256 => bool) public whitelistedProviders;
    uint256[] public whitelistIds;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(
        address _usdc,
        address _payPerCall,
        address _agent,
        uint256 _dailyLimit,
        uint256 _maxPerCall
    ) {
        if (_usdc == address(0) || _payPerCall == address(0) || _agent == address(0)) {
            revert ZeroAddress();
        }

        owner = msg.sender;
        usdc = _usdc;
        payPerCall = _payPerCall;
        agent = _agent;
        dailyLimit = _dailyLimit;
        maxPerCall = _maxPerCall;
        lastResetTime = block.timestamp;
    }

    function deposit(uint256 amount) external onlyOwner {
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external onlyOwner {
        IERC20(usdc).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function agentCall(
        uint256 providerId,
        bytes32 requestHash,
        uint256 amount,
        bytes calldata extraData
    ) external onlyAgent nonReentrant returns (bytes32 callId) {
        if (paused) revert PausedState();

        resetDailyIfNeeded();

        if (amount > maxPerCall) revert ExceedsMaxPerCall();
        if (spentToday + amount > dailyLimit) revert ExceedsDailyLimit();

        if (whitelistIds.length != 0 && !whitelistedProviders[providerId]) {
            revert ProviderNotWhitelisted();
        }

        // Reserved for future protocol extension.
        extraData;

        IERC20 token = IERC20(usdc);
        uint256 currentAllowance = token.allowance(address(this), payPerCall);
        if (currentAllowance < amount) {
            token.safeIncreaseAllowance(payPerCall, amount - currentAllowance);
        }

        uint256 balanceBefore = token.balanceOf(address(this));
        callId = IPayPerCall(payPerCall).callService(providerId, requestHash);
        uint256 balanceAfter = token.balanceOf(address(this));

        uint256 actualSpent = balanceBefore - balanceAfter;
        if (actualSpent != amount) {
            revert ActualSpendMismatch(amount, actualSpent);
        }

        spentToday += actualSpent;
        totalSpent += actualSpent;
        unchecked {
            totalCalls += 1;
        }

        uint256 remainingToday = dailyLimit - spentToday;
        emit AgentCallMade(callId, providerId, actualSpent, remainingToday);
    }

    function setAgent(address newAgent) external onlyOwner {
        if (newAgent == address(0)) revert ZeroAddress();
        agent = newAgent;
        emit AgentUpdated(newAgent);
    }

    function setDailyLimit(uint256 limit) external onlyOwner {
        dailyLimit = limit;
        emit LimitUpdated(dailyLimit, maxPerCall);
    }

    function setMaxPerCall(uint256 max) external onlyOwner {
        maxPerCall = max;
        emit LimitUpdated(dailyLimit, maxPerCall);
    }

    function addToWhitelist(uint256 providerId) external onlyOwner {
        if (whitelistedProviders[providerId]) revert AlreadyWhitelisted();

        whitelistedProviders[providerId] = true;
        whitelistIds.push(providerId);
    }

    function removeFromWhitelist(uint256 providerId) external onlyOwner {
        if (!whitelistedProviders[providerId]) revert NotWhitelisted();

        whitelistedProviders[providerId] = false;

        uint256 len = whitelistIds.length;
        for (uint256 i = 0; i < len; ++i) {
            if (whitelistIds[i] == providerId) {
                whitelistIds[i] = whitelistIds[len - 1];
                whitelistIds.pop();
                break;
            }
        }
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function getStats()
        external
        view
        returns (uint256 balance, uint256 spentToday_, uint256 remainingToday, uint256 totalSpent_, uint256 totalCalls_)
    {
        balance = IERC20(usdc).balanceOf(address(this));
        spentToday_ = _currentSpentToday();
        remainingToday = dailyLimit > spentToday_ ? dailyLimit - spentToday_ : 0;
        totalSpent_ = totalSpent;
        totalCalls_ = totalCalls;
    }

    function resetDailyIfNeeded() internal {
        if (block.timestamp >= lastResetTime + 1 days) {
            spentToday = 0;
            lastResetTime = block.timestamp;
        }
    }

    function _currentSpentToday() internal view returns (uint256) {
        if (block.timestamp >= lastResetTime + 1 days) {
            return 0;
        }
        return spentToday;
    }
}

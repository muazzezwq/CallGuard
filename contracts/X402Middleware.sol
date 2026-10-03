// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPayPerCall {
    function callService(uint256 providerId, bytes32 requestHash)
        external returns (bytes32 callId);
}

/// @title X402Middleware
/// @notice Bridges HTTP 402 (x402) payments to ArcSLA's on-chain SLA enforcement.
///
/// @dev x402 flow:
///   1. Agent → GET /service (off-chain, no payment)
///   2. Provider → 402 + payment details (payTo = this contract)
///   3. Agent → approves + calls executePayment() with USDC
///   4. This contract → calls PayPerCall.callService() → SLA clock starts
///   5. Provider → delivers service off-chain → submits receipt → gets paid
///
///   Why a middleware contract?
///   - x402 sends payment to a fixed address (payTo in the 402 response)
///   - We need that payment to trigger callService() atomically
///   - This contract accepts USDC + immediately opens a PayPerCall call
///   - Provider's signer submits receipt as usual → escrow released

contract X402Middleware is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ----------------------------------------------------------------
    // Immutables
    // ----------------------------------------------------------------

    IERC20  public immutable usdc;
    IPayPerCall public immutable payPerCall;

    // ----------------------------------------------------------------
    // State
    // ----------------------------------------------------------------

    /// @notice Maps requestHash → callId for off-chain lookup
    mapping(bytes32 => bytes32) public callIdByRequest;

    /// @notice Maps callId → original caller (agent address)
    mapping(bytes32 => address) public callerByCallId;

    // ----------------------------------------------------------------
    // Events
    // ----------------------------------------------------------------

    event X402CallOpened(
        bytes32 indexed callId,
        uint256 indexed providerId,
        address indexed caller,
        bytes32 requestHash,
        uint256 amount
    );

    // ----------------------------------------------------------------
    // Errors
    // ----------------------------------------------------------------

    error InsufficientPayment(uint256 required, uint256 received);
    error DuplicateRequest(bytes32 requestHash);

    // ----------------------------------------------------------------
    // Constructor
    // ----------------------------------------------------------------

    constructor(IERC20 _usdc, IPayPerCall _payPerCall)
        Ownable(msg.sender)
    {
        usdc = _usdc;
        payPerCall = _payPerCall;
    }

    // ----------------------------------------------------------------
    // Core: x402 payment → callService()
    // ----------------------------------------------------------------

    /// @notice Called by agent after receiving 402. Pays USDC and opens
    ///         an ArcSLA call in the same transaction.
    ///
    /// @param providerId   ArcSLA provider to call
    /// @param requestHash  keccak256 of the agent's request payload
    /// @param amount       USDC amount (must match provider's pricePerCall)
    ///
    /// @return callId      On-chain call ID (use to submit receipt or claim timeout)
    function executePayment(
        uint256 providerId,
        bytes32 requestHash,
        uint256 amount
    ) external nonReentrant returns (bytes32 callId) {
        // Prevent duplicate requests (idempotency)
        if (callIdByRequest[requestHash] != bytes32(0)) {
            revert DuplicateRequest(requestHash);
        }

        // Pull USDC from agent
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Approve PayPerCall to pull USDC from this contract
        usdc.forceApprove(address(payPerCall), amount);

        // Open ArcSLA call — SLA clock starts here
        callId = payPerCall.callService(providerId, requestHash);

        // Store mapping for off-chain lookup
        callIdByRequest[requestHash] = callId;
        callerByCallId[callId] = msg.sender;

        emit X402CallOpened(callId, providerId, msg.sender, requestHash, amount);
    }

    // ----------------------------------------------------------------
    // Views
    // ----------------------------------------------------------------

    /// @notice Look up callId by requestHash (for provider's receipt submission)
    function getCallId(bytes32 requestHash) external view returns (bytes32) {
        return callIdByRequest[requestHash];
    }

    /// @notice Look up original agent address by callId
    function getCaller(bytes32 callId) external view returns (address) {
        return callerByCallId[callId];
    }

    // ----------------------------------------------------------------
    // Emergency recovery (owner only)
    // ----------------------------------------------------------------

    function recoverTokens(IERC20 token, uint256 amount, address to)
        external onlyOwner
    {
        token.safeTransfer(to, amount);
    }
}

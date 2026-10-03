// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Subscription
/// @notice Pre-paid call bundles for CallGuard.
///         A caller buys N calls from a specific provider up-front.
///         Each bundled call skips the per-call USDC transfer — the
///         provider unlocks payment by submitting a receipt as usual,
///         but draws from the subscriber's pre-paid balance instead of
///         a per-call escrow.
///
///         Model:
///         subscribe(providerId, calls, duration)
///           → locks (calls × pricePerCall) USDC for `duration` seconds
///         useCall(subscriptionId)
///           → called by PayPerCall when a sub call is opened; decrements remaining
///         releaseExpired(subscriptionId)
///           → after expiry, unused balance returned to subscriber

interface IServiceRegistry {
    function getProvider(uint256 providerId) external view returns (
        address owner,
        address signer,
        uint256 stake,
        uint256 pricePerCall,
        uint32  maxResponseTime,
        uint32  slashBps,
        bool    active
    );
}

contract Subscription is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error ProviderInactive();
    error InvalidDuration();
    error InvalidCallCount();
    error NotSubscriber();
    error SubscriptionExpired();
    error SubscriptionActive();
    error NoCallsLeft();
    error AlreadyExpired();
    error OnlyPayPerCall();

    // -----------------------------------------------------------------------
    // Types
    // -----------------------------------------------------------------------

    struct Sub {
        address subscriber;
        uint256 providerId;
        uint256 pricePerCall;   // locked at subscribe time
        uint32  remaining;      // calls left
        uint32  total;          // original call count
        uint64  expiresAt;      // unix timestamp
        uint256 lockedBalance;  // USDC still locked
        bool    cancelled;
    }

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    IERC20            public immutable usdc;
    IServiceRegistry  public immutable registry;
    address           public payPerCall; // can call useCall()

    uint32  public constant MIN_DURATION = 1 hours;
    uint32  public constant MAX_DURATION = 365 days;
    uint32  public constant MIN_CALLS    = 1;
    uint32  public constant MAX_CALLS    = 10_000;

    uint256 public subCount;
    mapping(uint256 => Sub) public subscriptions;
    // subscriber → provider → active subId (0 = none)
    mapping(address => mapping(uint256 => uint256)) public activeSub;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event Subscribed(uint256 indexed subId, address indexed subscriber, uint256 indexed providerId, uint32 calls, uint64 expiresAt);
    event CallUsed(uint256 indexed subId, uint32 remaining);
    event Cancelled(uint256 indexed subId, uint256 refund);
    event ExpiredReleased(uint256 indexed subId, uint256 refund);
    event PayPerCallSet(address indexed prev, address indexed next);

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor(address _usdc, address _registry, address _payPerCall) {
        require(_usdc     != address(0), "bad usdc");
        require(_registry != address(0), "bad registry");
        usdc       = IERC20(_usdc);
        registry   = IServiceRegistry(_registry);
        payPerCall = _payPerCall;
    }

    // -----------------------------------------------------------------------
    // Subscriber actions
    // -----------------------------------------------------------------------

    /// @notice Buy a bundle of calls from a provider.
    /// @param providerId  Target provider.
    /// @param calls       Number of calls to pre-buy.
    /// @param duration    Subscription validity in seconds.
    function subscribe(
        uint256 providerId,
        uint32  calls,
        uint32  duration
    ) external nonReentrant returns (uint256 subId) {
        if (calls    < MIN_CALLS    || calls    > MAX_CALLS)    revert InvalidCallCount();
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert InvalidDuration();

        (
            ,
            ,
            ,
            uint256 pricePerCall,
            ,
            ,
            bool active
        ) = registry.getProvider(providerId);

        if (!active) revert ProviderInactive();

        uint256 total = pricePerCall * calls;
        usdc.safeTransferFrom(msg.sender, address(this), total);

        subId = ++subCount;
        uint64 expiresAt = uint64(block.timestamp + duration);

        subscriptions[subId] = Sub({
            subscriber:    msg.sender,
            providerId:    providerId,
            pricePerCall:  pricePerCall,
            remaining:     calls,
            total:         calls,
            expiresAt:     expiresAt,
            lockedBalance: total,
            cancelled:     false
        });

        activeSub[msg.sender][providerId] = subId;
        emit Subscribed(subId, msg.sender, providerId, calls, expiresAt);
    }

    /// @notice Cancel an unexpired subscription and get a pro-rata refund.
    function cancel(uint256 subId) external nonReentrant {
        Sub storage s = subscriptions[subId];
        if (s.subscriber != msg.sender)    revert NotSubscriber();
        if (block.timestamp >= s.expiresAt) revert SubscriptionExpired();
        if (s.cancelled)                    revert AlreadyExpired();

        s.cancelled = true;
        uint256 refund = s.pricePerCall * s.remaining;
        s.lockedBalance = 0;
        s.remaining = 0;

        if (activeSub[msg.sender][s.providerId] == subId) {
            activeSub[msg.sender][s.providerId] = 0;
        }

        if (refund > 0) usdc.safeTransfer(msg.sender, refund);
        emit Cancelled(subId, refund);
    }

    /// @notice Release locked balance of an expired subscription.
    function releaseExpired(uint256 subId) external nonReentrant {
        Sub storage s = subscriptions[subId];
        if (block.timestamp < s.expiresAt) revert SubscriptionActive();
        if (s.lockedBalance == 0)          revert AlreadyExpired();

        uint256 refund = s.lockedBalance;
        s.lockedBalance = 0;
        s.remaining = 0;

        usdc.safeTransfer(s.subscriber, refund);
        emit ExpiredReleased(subId, refund);
    }

    // -----------------------------------------------------------------------
    // PayPerCall integration
    // -----------------------------------------------------------------------

    /// @notice Called by PayPerCall when a subscribed call is opened.
    ///         Transfers pricePerCall to PayPerCall as escrow.
    function useCall(uint256 subId) external nonReentrant returns (uint256 escrow) {
        if (msg.sender != payPerCall) revert OnlyPayPerCall();

        Sub storage s = subscriptions[subId];
        if (block.timestamp >= s.expiresAt) revert SubscriptionExpired();
        if (s.remaining == 0)               revert NoCallsLeft();
        if (s.cancelled)                    revert SubscriptionExpired();

        s.remaining -= 1;
        escrow = s.pricePerCall;
        s.lockedBalance -= escrow;

        usdc.safeTransfer(payPerCall, escrow);
        emit CallUsed(subId, s.remaining);
    }

    // -----------------------------------------------------------------------
    // View helpers
    // -----------------------------------------------------------------------

    function getSub(uint256 subId) external view returns (Sub memory) {
        return subscriptions[subId];
    }

    function getActiveSub(address subscriber, uint256 providerId) external view returns (uint256 subId) {
        return activeSub[subscriber][providerId];
    }

    function isValid(uint256 subId) external view returns (bool) {
        Sub storage s = subscriptions[subId];
        return (
            !s.cancelled &&
            s.remaining > 0 &&
            block.timestamp < s.expiresAt
        );
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    function setPayPerCall(address next) external {
        if (msg.sender != payPerCall && payPerCall != address(0)) revert OnlyPayPerCall();
        emit PayPerCallSet(payPerCall, next);
        payPerCall = next;
    }
}

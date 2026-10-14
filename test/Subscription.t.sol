// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Subscription } from "../contracts/Subscription.sol";
import { MockUSDC } from "./helpers/MockUSDC.sol";

// ---------------------------------------------------------------------------
// Minimal IServiceRegistry stub for Subscription tests
// ---------------------------------------------------------------------------
contract SubMockRegistry {
    struct Entry {
        address owner;
        uint256 pricePerCall;
        bool active;
    }
    mapping(uint256 => Entry) public entries;

    function setProvider(uint256 id, address owner_, uint256 price_, bool active_) external {
        entries[id] = Entry(owner_, price_, active_);
    }

    // Subscription.sol calls registry.getProvider() with the OLD tuple return
    // Updated to match the new interface with 9 fields (maxConcurrentCalls and zkTier added).
    function getProvider(uint256 id) external view returns (
        address owner,
        address signer,
        uint256 stake,
        uint256 pricePerCall,
        uint32  maxResponseTime,
        uint32  slashBps,
        bool    active,
        uint32  maxConcurrentCalls,
        uint8   zkTier
    ) {
        Entry storage e = entries[id];
        return (e.owner, address(0), 0, e.pricePerCall, 30, 0, e.active, 0, 0);
    }
}

// ---------------------------------------------------------------------------
// Subscription — Standard Mode
// ---------------------------------------------------------------------------
contract SubscriptionStandardTest is Test {
    Subscription      internal sub;
    SubMockRegistry   internal reg;
    MockUSDC          internal usdc;

    address internal subscriber = address(0xAA);
    address internal provOwner  = address(0xBB);
    address internal payPerCall = address(0xCC);
    uint256 internal pid        = 1;
    uint256 internal PRICE      = 1e6; // 1 USDC per call

    function setUp() public {
        usdc = new MockUSDC();
        reg  = new SubMockRegistry();
        reg.setProvider(pid, provOwner, PRICE, true);

        sub = new Subscription(address(usdc), address(reg), payPerCall);

        usdc.mint(subscriber, 10_000e6);
        vm.prank(subscriber);
        usdc.approve(address(sub), type(uint256).max);
    }

    function test_subscribe_locksUSDC() public {
        vm.prank(subscriber);
        uint256 subId = sub.subscribe(pid, 5, uint32(2 hours));

        Subscription.Sub memory s = sub.getSub(subId);
        assertEq(s.lockedBalance, 5e6, "5 USDC locked");
        assertEq(s.remaining, 5, "5 calls remaining");
        assertFalse(s.cancelled, "not cancelled");
        assertFalse(s.streamMode, "not stream mode");
    }

    function test_subscribe_activeSub_tracked() public {
        vm.prank(subscriber);
        uint256 subId = sub.subscribe(pid, 3, uint32(2 hours));
        assertEq(sub.getActiveSub(subscriber, pid), subId);
    }

    function test_subscribe_inactive_provider_reverts() public {
        reg.setProvider(pid, provOwner, PRICE, false);
        vm.prank(subscriber);
        vm.expectRevert(Subscription.ProviderInactive.selector);
        sub.subscribe(pid, 5, uint32(2 hours));
    }

    function test_useCall_decrements() public {
        vm.prank(subscriber);
        uint256 subId = sub.subscribe(pid, 5, uint32(2 hours));

        vm.prank(payPerCall);
        sub.useCall(subId);

        Subscription.Sub memory s = sub.getSub(subId);
        assertEq(s.remaining, 4, "one call used");
        assertEq(s.lockedBalance, 4e6, "locked reduced");
    }

    function test_useCall_onlyPayPerCall_reverts() public {
        vm.prank(subscriber);
        uint256 subId = sub.subscribe(pid, 5, uint32(2 hours));

        vm.prank(subscriber);
        vm.expectRevert(Subscription.OnlyPayPerCall.selector);
        sub.useCall(subId);
    }

    function test_cancel_refundsRemaining() public {
        vm.prank(subscriber);
        uint256 subId = sub.subscribe(pid, 5, uint32(2 hours));

        uint256 before = usdc.balanceOf(subscriber);

        vm.prank(subscriber);
        sub.cancel(subId);

        assertEq(usdc.balanceOf(subscriber) - before, 5e6, "full refund");
    }

    function test_releaseExpired_returnsBalance() public {
        vm.prank(subscriber);
        uint256 subId = sub.subscribe(pid, 5, uint32(2 hours));

        // Use 2 calls
        vm.prank(payPerCall);
        sub.useCall(subId);
        vm.prank(payPerCall);
        sub.useCall(subId);

        // Warp past expiry
        vm.warp(block.timestamp + 3 hours);

        uint256 before = usdc.balanceOf(subscriber);
        sub.releaseExpired(subId);
        assertEq(usdc.balanceOf(subscriber) - before, 3e6, "3 USDC refunded");
    }

    function test_isValid_falseAfterExpiry() public {
        vm.prank(subscriber);
        uint256 subId = sub.subscribe(pid, 5, uint32(2 hours));

        vm.warp(block.timestamp + 3 hours);
        assertFalse(sub.isValid(subId));
    }
}

// ---------------------------------------------------------------------------
// StreamEscrow — subscribeStream + claimStream
// ---------------------------------------------------------------------------
contract SubscriptionStreamTest is Test {
    Subscription      internal sub;
    SubMockRegistry   internal reg;
    MockUSDC          internal usdc;

    address internal subscriber = address(0x11);
    address internal provOwner  = address(0x22);
    uint256 internal pid        = 2;
    uint256 internal PRICE      = 2e6; // 2 USDC per call

    function setUp() public {
        usdc = new MockUSDC();
        reg  = new SubMockRegistry();
        reg.setProvider(pid, provOwner, PRICE, true);

        sub = new Subscription(address(usdc), address(reg), address(0));

        usdc.mint(subscriber, 10_000e6);
        vm.prank(subscriber);
        usdc.approve(address(sub), type(uint256).max);
    }

    function test_subscribeStream_locksBalance() public {
        vm.prank(subscriber);
        uint256 subId = sub.subscribeStream(pid, 100e6, uint32(1 days));

        Subscription.Sub memory s = sub.getSub(subId);
        assertTrue(s.streamMode, "stream mode");
        assertEq(s.lockedBalance, 100e6, "100 USDC locked");
        assertEq(s.streamReleased, 0, "nothing released yet");
    }

    function test_subscribeStream_claimStream_linearRelease() public {
        vm.prank(subscriber);
        uint256 subId = sub.subscribeStream(pid, 100e6, uint32(1 days));

        // Warp to halfway
        vm.warp(block.timestamp + 12 hours);

        uint256 before = usdc.balanceOf(provOwner);
        sub.claimStream(subId);

        uint256 claimed = usdc.balanceOf(provOwner) - before;
        // Should be roughly 50 USDC (50% of stream elapsed)
        assertApproxEqAbs(claimed, 50e6, 1e6, "~50 USDC at halfway");
    }

    function test_subscribeStream_claimStream_fullRelease() public {
        vm.prank(subscriber);
        uint256 subId = sub.subscribeStream(pid, 100e6, uint32(1 days));

        vm.warp(block.timestamp + 2 days); // past end

        sub.claimStream(subId);

        // After full duration all 100 USDC should have been released
        assertEq(usdc.balanceOf(provOwner), 100e6, "full 100 USDC released");
    }

    function test_subscribeStream_claimStream_nothingIfJustStarted() public {
        vm.prank(subscriber);
        uint256 subId = sub.subscribeStream(pid, 100e6, uint32(1 days));

        vm.expectRevert(Subscription.NothingToStream.selector);
        sub.claimStream(subId);
    }

    function test_subscribeStream_releaseExpired_returnsUnclaimed() public {
        vm.prank(subscriber);
        uint256 subId = sub.subscribeStream(pid, 100e6, uint32(1 days));

        // Claim at 25%
        vm.warp(block.timestamp + 6 hours);
        sub.claimStream(subId);

        // Warp past expiry without claiming rest
        vm.warp(block.timestamp + 2 days);

        uint256 before = usdc.balanceOf(subscriber);
        sub.releaseExpired(subId);

        // ~75 USDC unclaimed should flow back to subscriber
        assertGt(usdc.balanceOf(subscriber) - before, 0, "subscriber gets back unclaimed");
    }

    function test_subscribeStream_notStreamMode_reverts() public {
        vm.prank(subscriber);
        // subscribe standard (not stream)
        uint256 subId = sub.subscribe(pid, 5, uint32(2 hours));

        vm.expectRevert(Subscription.NotStreamMode.selector);
        sub.claimStream(subId);
    }

    function test_subscribeStream_cancel_reverts() public {
        vm.prank(subscriber);
        uint256 subId = sub.subscribeStream(pid, 100e6, uint32(1 days));

        // Stream subs cannot be cancelled — cancel() would wipe lockedBalance.
        vm.prank(subscriber);
        vm.expectRevert(Subscription.NotStreamMode.selector);
        sub.cancel(subId);
    }
}

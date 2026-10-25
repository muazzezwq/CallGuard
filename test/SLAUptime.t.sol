// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";
import { PayPerCallV8 } from "../contracts/PayPerCallV8.sol";
import { SLAUptime } from "../contracts/SLAUptime.sol";
import { MockUSDC } from "./helpers/MockUSDC.sol";

/// @notice A8 coverage: `availabilityTargetBps` is a published promise, so a
///         provider that misses it loses stake to the account that proves it.
contract SLAUptimeTest is Test {
    MockUSDC internal usdc;
    ServiceRegistryV8 internal registry;
    PayPerCallV8 internal payPerCall;
    SLAUptime internal uptime;

    address internal admin = address(0xA11CE);
    address internal provider = address(0xB0B);
    address internal claimer = address(0xCA11);
    address internal arbiter = address(0xA4B);
    address internal treasury = address(0x7EA5);

    uint256 internal constant MIN_STAKE = 10e6;
    uint256 internal constant STAKE = 100e6;
    uint256 internal constant PRICE = 1e6;
    uint32 internal constant MAX_RESP = 30;
    uint16 internal constant SLASH_BPS = 2_000;
    uint16 internal constant TARGET_BPS = 9_950;
    uint16 internal constant AVAIL_SLASH_BPS = 1_000;
    uint16 internal constant BOUNTY_BPS = 2_000;
    uint32 internal constant COOLDOWN = 1 days;
    uint32 internal constant MIN_SAMPLES = 20;
    bytes32 internal constant TERMS_HASH = keccak256("terms-v1");

    uint256 internal providerId;

    function setUp() public {
        vm.startPrank(admin);
        usdc = new MockUSDC();
        registry = new ServiceRegistryV8(IERC20(address(usdc)), MIN_STAKE, admin);
        payPerCall = new PayPerCallV8(IERC20(address(usdc)), registry);
        registry.setPayPerCall(address(payPerCall));
        uptime = new SLAUptime(
            IERC20(address(usdc)),
            registry,
            arbiter,
            treasury,
            AVAIL_SLASH_BPS,
            BOUNTY_BPS,
            COOLDOWN,
            MIN_SAMPLES
        );
        registry.authorizeSlasher(address(uptime));
        vm.stopPrank();

        usdc.mint(provider, 1_000e6);

        vm.prank(provider);
        usdc.approve(address(registry), type(uint256).max);

        providerId = _register(TARGET_BPS);
    }

    // ---------------------------------------------------------------------
    // Setup helpers
    // ---------------------------------------------------------------------

    function _register(uint16 targetBps) internal returns (uint256) {
        return _registerAs(provider, targetBps);
    }

    /// A second provider is needed whenever a test wants different terms: the
    /// registry allows one provider per owner.
    function _registerAs(address owner, uint16 targetBps) internal returns (uint256) {
        usdc.mint(owner, STAKE);
        vm.startPrank(owner);
        usdc.approve(address(registry), STAKE);
        uint256 id = registry.register(
            owner,
            STAKE,
            PRICE,
            MAX_RESP,
            SLASH_BPS,
            targetBps,
            0,
            "https://api.example",
            TERMS_HASH,
            "ipfs://terms-v1"
        );
        vm.stopPrank();
        return id;
    }

    /// @dev The registry only lets PayPerCall move its reputation counters.
    function _record(uint256 id, uint256 completed, uint256 slashed) internal {
        vm.startPrank(address(payPerCall));
        for (uint256 i = 0; i < completed; i++) {
            registry.incCompleted(id);
        }
        for (uint256 i = 0; i < slashed; i++) {
            registry.incSlashed(id);
        }
        vm.stopPrank();
    }

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(SLAUptime.InvalidAddress.selector);
        new SLAUptime(IERC20(address(0)), registry, arbiter, treasury, 1_000, 2_000, COOLDOWN, MIN_SAMPLES);

        vm.expectRevert(SLAUptime.InvalidAddress.selector);
        new SLAUptime(IERC20(address(usdc)), registry, address(0), treasury, 1_000, 2_000, COOLDOWN, MIN_SAMPLES);

        vm.expectRevert(SLAUptime.InvalidAddress.selector);
        new SLAUptime(IERC20(address(usdc)), registry, arbiter, address(0), 1_000, 2_000, COOLDOWN, MIN_SAMPLES);
    }

    function test_constructor_rejectsBadBpsAndSamples() public {
        vm.expectRevert(SLAUptime.InvalidBps.selector);
        new SLAUptime(IERC20(address(usdc)), registry, arbiter, treasury, 10_001, 2_000, COOLDOWN, MIN_SAMPLES);

        vm.expectRevert(SLAUptime.InvalidBps.selector);
        new SLAUptime(IERC20(address(usdc)), registry, arbiter, treasury, 1_000, 10_001, COOLDOWN, MIN_SAMPLES);

        vm.expectRevert(SLAUptime.InvalidSamples.selector);
        new SLAUptime(IERC20(address(usdc)), registry, arbiter, treasury, 1_000, 2_000, COOLDOWN, 0);
    }

    function test_constructor_storesConfiguration() public view {
        assertEq(address(uptime.registry()), address(registry));
        assertEq(address(uptime.usdc()), address(usdc));
        assertEq(uptime.arbiter(), arbiter);
        assertEq(uptime.treasury(), treasury);
        assertEq(uptime.availabilitySlashBps(), AVAIL_SLASH_BPS);
        assertEq(uptime.bountyBps(), BOUNTY_BPS);
        assertEq(uptime.cooldown(), COOLDOWN);
        assertEq(uptime.minSamples(), MIN_SAMPLES);
    }

    // ---------------------------------------------------------------------
    // Happy path
    // ---------------------------------------------------------------------

    function test_claim_slashesProviderAndPaysBountyAndTreasury() public {
        _record(providerId, 18, 2); // 90 % availability against a 99.5 % target

        uint256 stakeBefore = registry.getProvider(providerId).stake;
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(claimer);
        uptime.claimAvailability(providerId);

        uint256 slashAmount = (stakeBefore * AVAIL_SLASH_BPS) / 10_000;
        uint256 bounty = (slashAmount * BOUNTY_BPS) / 10_000;

        assertEq(registry.getProvider(providerId).stake, stakeBefore - slashAmount);
        assertEq(usdc.balanceOf(claimer), bounty);
        assertEq(usdc.balanceOf(treasury), treasuryBefore + slashAmount - bounty);
        assertEq(usdc.balanceOf(address(uptime)), 0);
    }

    function test_claim_emitsAvailabilitySlashed() public {
        _record(providerId, 18, 2);

        vm.expectEmit(true, true, true, true, address(uptime));
        emit SLAUptime.AvailabilitySlashed(providerId, claimer, 9_000, TARGET_BPS, 20, 10e6, 2e6);

        vm.prank(claimer);
        uptime.claimAvailability(providerId);
    }

    function test_claim_recordsWindowAndCooldown() public {
        _record(providerId, 18, 2);

        vm.prank(claimer);
        uptime.claimAvailability(providerId);

        (uint64 completed, uint64 slashed, uint64 checkedAt) = uptime.windows(providerId);
        assertEq(completed, 18);
        assertEq(slashed, 2);
        assertEq(checkedAt, uint64(block.timestamp));
        assertEq(uptime.lastClaimAt(providerId), uint32(block.timestamp));
    }

    function test_claim_atExactlyTargetDoesNotSlash() public {
        _record(providerId, 20, 0); // 100 %

        vm.expectRevert(SLAUptime.TargetMet.selector);
        vm.prank(claimer);
        uptime.claimAvailability(providerId);
    }

    /// The target is a floor: `availBps == target` is compliance, not a miss.
    function test_claim_equalToTarget_doesNotSlash() public {
        uint256 id = _registerAs(address(0xB0B2), 9_000); // 90 % target
        _record(id, 18, 2); // exactly 90 %

        vm.expectRevert(SLAUptime.TargetMet.selector);
        vm.prank(claimer);
        uptime.claimAvailability(id);
    }

    // ---------------------------------------------------------------------
    // Guards
    // ---------------------------------------------------------------------

    function test_claim_belowMinSamples_reverts() public {
        _record(providerId, 9, 1); // 10 samples, threshold is 20

        vm.expectRevert(SLAUptime.NotEnoughSamples.selector);
        vm.prank(claimer);
        uptime.claimAvailability(providerId);
    }

    function test_claim_neverServedCalls_reverts() public {
        vm.expectRevert(SLAUptime.NotEnoughSamples.selector);
        vm.prank(claimer);
        uptime.claimAvailability(providerId);
    }

    function test_claim_unknownProvider_reverts() public {
        vm.expectRevert(ServiceRegistryV8.UnknownProvider.selector);
        vm.prank(claimer);
        uptime.claimAvailability(999);
    }

    function test_claim_providerWithoutTarget_reverts() public {
        uint256 id = _registerAs(address(0xB0B3), 0); // availability target unspecified
        _record(id, 10, 10);

        vm.expectRevert(SLAUptime.TargetUnspecified.selector);
        vm.prank(claimer);
        uptime.claimAvailability(id);
    }

    function test_claim_beforeCooldown_reverts() public {
        _record(providerId, 18, 2);

        vm.prank(claimer);
        uptime.claimAvailability(providerId);

        // Fresh misses, but the cooldown has not elapsed.
        _record(providerId, 0, 20);

        vm.expectRevert(SLAUptime.Cooldown.selector);
        vm.prank(claimer);
        uptime.claimAvailability(providerId);
    }

    function test_claim_afterCooldown_slashesAgain() public {
        _record(providerId, 18, 2);
        vm.prank(claimer);
        uptime.claimAvailability(providerId);

        _record(providerId, 0, 20);
        skip(COOLDOWN);

        uint256 stakeBefore = registry.getProvider(providerId).stake;
        vm.prank(claimer);
        uptime.claimAvailability(providerId);

        assertLt(registry.getProvider(providerId).stake, stakeBefore);
    }

    function test_claim_cannotScoreTheSameCallsTwice() public {
        _record(providerId, 18, 2);
        vm.prank(claimer);
        uptime.claimAvailability(providerId);

        skip(COOLDOWN);

        // No new calls: the window is empty, so nothing can be claimed.
        vm.expectRevert(SLAUptime.NotEnoughSamples.selector);
        vm.prank(claimer);
        uptime.claimAvailability(providerId);
    }

    // ---------------------------------------------------------------------
    // Window semantics
    // ---------------------------------------------------------------------

    /// Core of the design: once a provider has been checked it gets a clean
    /// slate, so old misses cannot be used again and recovery is measurable.
    function test_window_excludesCallsBeforeTheLastCheck() public {
        _record(providerId, 18, 2);
        vm.prank(claimer);
        uptime.claimAvailability(providerId);

        skip(COOLDOWN);

        // 20 clean calls after the check: the window is 100 %.
        _record(providerId, 20, 0);

        vm.expectRevert(SLAUptime.TargetMet.selector);
        vm.prank(claimer);
        uptime.claimAvailability(providerId);
    }

    /// A provider that was fine before can still be caught later: the window is
    /// not poisoned by a good history.
    function test_window_catchesDeclineAfterAGoodHistory() public {
        _record(providerId, 200, 0);
        skip(COOLDOWN);

        _record(providerId, 10, 10); // 50 % since the check

        uint256 stakeBefore = registry.getProvider(providerId).stake;
        vm.prank(claimer);
        uptime.claimAvailability(providerId);

        assertLt(registry.getProvider(providerId).stake, stakeBefore);
    }

    function test_firstClaim_scoresWholeHistory() public {
        _record(providerId, 50, 50); // 50 % lifetime, never checked before

        uint256 stakeBefore = registry.getProvider(providerId).stake;
        vm.prank(claimer);
        uptime.claimAvailability(providerId);

        assertLt(registry.getProvider(providerId).stake, stakeBefore);
    }

    function test_claim_slashIsCappedAtStake() public {
        SLAUptime greedy = new SLAUptime(
            IERC20(address(usdc)),
            registry,
            arbiter,
            treasury,
            10_000, // 100 % of the stake
            0,
            COOLDOWN,
            MIN_SAMPLES
        );
        vm.prank(admin);
        registry.authorizeSlasher(address(greedy));

        _record(providerId, 0, 20);

        vm.prank(claimer);
        greedy.claimAvailability(providerId);

        assertEq(registry.getProvider(providerId).stake, 0);
        assertEq(usdc.balanceOf(treasury), STAKE);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function test_preview_reportsMissAndReady() public {
        _record(providerId, 18, 2);

        (
            uint256 availabilityBps,
            uint16 targetBps,
            uint256 samples,
            uint256 slashAmount,
            uint256 cooldownEndsAt,
            bool ready
        ) = uptime.previewAvailability(providerId);

        assertEq(availabilityBps, 9_000);
        assertEq(targetBps, TARGET_BPS);
        assertEq(samples, 20);
        assertEq(slashAmount, 10e6);
        assertEq(cooldownEndsAt, 0);
        assertTrue(ready);
    }

    function test_preview_notReadyWithoutSamples() public {
        (,, uint256 samples,,, bool ready) = uptime.previewAvailability(providerId);
        assertEq(samples, 0);
        assertFalse(ready);
    }

    function test_preview_notReadyDuringCooldown() public {
        _record(providerId, 18, 2);
        vm.prank(claimer);
        uptime.claimAvailability(providerId);

        _record(providerId, 0, 20);

        (,,,, uint256 cooldownEndsAt, bool ready) = uptime.previewAvailability(providerId);
        assertEq(cooldownEndsAt, block.timestamp + COOLDOWN);
        assertFalse(ready);

        skip(COOLDOWN);
        (,,,,, ready) = uptime.previewAvailability(providerId);
        assertTrue(ready);
    }

    function test_preview_unknownProviderIsEmpty() public view {
        (uint256 availabilityBps, uint16 targetBps, uint256 samples,,, bool ready) = uptime.previewAvailability(999);
        assertEq(availabilityBps, 0);
        assertEq(targetBps, 0);
        assertEq(samples, 0);
        assertFalse(ready);
    }

    function test_observedAvailability_tracksWindow() public {
        _record(providerId, 30, 10);

        (uint256 availabilityBps, uint256 samples) = uptime.observedAvailability(providerId);
        assertEq(availabilityBps, 7_500);
        assertEq(samples, 40);

        vm.prank(claimer);
        uptime.claimAvailability(providerId);

        (availabilityBps, samples) = uptime.observedAvailability(providerId);
        assertEq(availabilityBps, 0); // empty window after the check
        assertEq(samples, 0);
    }

    function test_observedAvailability_unknownProvider_reverts() public {
        vm.expectRevert(SLAUptime.UnknownProvider.selector);
        uptime.observedAvailability(999);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function test_admin_onlyArbiter() public {
        vm.expectRevert(SLAUptime.NotArbiter.selector);
        vm.prank(claimer);
        uptime.setTreasury(claimer);

        vm.expectRevert(SLAUptime.NotArbiter.selector);
        vm.prank(claimer);
        uptime.setAvailabilitySlashBps(1);

        vm.expectRevert(SLAUptime.NotArbiter.selector);
        vm.prank(claimer);
        uptime.setBountyBps(1);

        vm.expectRevert(SLAUptime.NotArbiter.selector);
        vm.prank(claimer);
        uptime.setCooldown(1);

        vm.expectRevert(SLAUptime.NotArbiter.selector);
        vm.prank(claimer);
        uptime.setMinSamples(1);

        vm.expectRevert(SLAUptime.NotArbiter.selector);
        vm.prank(claimer);
        uptime.setArbiter(claimer);
    }

    function test_admin_updatesParameters() public {
        vm.startPrank(arbiter);
        uptime.setTreasury(claimer);
        uptime.setAvailabilitySlashBps(2_500);
        uptime.setBountyBps(5_000);
        uptime.setCooldown(2 days);
        uptime.setMinSamples(50);
        // Handing over the arbiter role last keeps the rest of the block valid.
        uptime.setArbiter(claimer);
        vm.stopPrank();

        assertEq(uptime.arbiter(), claimer);
        assertEq(uptime.treasury(), claimer);
        assertEq(uptime.availabilitySlashBps(), 2_500);
        assertEq(uptime.bountyBps(), 5_000);
        assertEq(uptime.cooldown(), 2 days);
        assertEq(uptime.minSamples(), 50);
    }

    function test_admin_rejectsInvalidInput() public {
        vm.startPrank(arbiter);

        vm.expectRevert(SLAUptime.InvalidAddress.selector);
        uptime.setTreasury(address(0));

        vm.expectRevert(SLAUptime.InvalidBps.selector);
        uptime.setAvailabilitySlashBps(10_001);

        vm.expectRevert(SLAUptime.InvalidBps.selector);
        uptime.setBountyBps(10_001);

        vm.expectRevert(SLAUptime.InvalidCooldown.selector);
        uptime.setCooldown(31 days);

        vm.expectRevert(SLAUptime.InvalidSamples.selector);
        uptime.setMinSamples(0);

        vm.stopPrank();
    }

    /// The bounty is what makes the claim worth someone's gas: with zero bounty
    /// the slash still lands, but the caller gets nothing.
    function test_claim_zeroBounty_sendsEverythingToTreasury() public {
        vm.prank(arbiter);
        uptime.setBountyBps(0);

        _record(providerId, 18, 2);

        uint256 treasuryBefore = usdc.balanceOf(treasury);
        vm.prank(claimer);
        uptime.claimAvailability(providerId);

        assertEq(usdc.balanceOf(claimer), 0);
        assertEq(usdc.balanceOf(treasury), treasuryBefore + 10e6);
    }
}

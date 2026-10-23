// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";
import { IServiceRegistryV8 } from "../contracts/interfaces/IServiceRegistryV8.sol";
import { MockUSDC } from "./helpers/MockUSDC.sol";

contract ServiceRegistryV8Test is Test {
    ServiceRegistryV8 internal registry;
    MockUSDC internal usdc;

    address internal admin = address(0xA11CE);
    address internal provider1 = address(0xB0B);
    address internal provider1Signer = address(0xB0B5);
    address internal payPerCall = address(0xCAFE);
    address internal user = address(0xD00D);

    uint256 internal constant MIN_STAKE = 10e6;
    uint256 internal constant STAKE = 100e6;
    uint256 internal constant PRICE = 1e6;
    uint32 internal constant MAX_RESP = 30;
    uint16 internal constant SLASH_BPS = 2_000;
    uint16 internal constant AVAILABILITY_BPS = 9_950;
    bytes32 internal constant TERMS_HASH = keccak256("terms-v1");
    string internal constant TERMS_URI = "ipfs://terms-v1";

    function setUp() public {
        usdc = new MockUSDC();
        registry = new ServiceRegistryV8(IERC20(address(usdc)), MIN_STAKE, admin);

        vm.prank(admin);
        registry.setPayPerCall(payPerCall);

        usdc.mint(provider1, 1_000e6);
        vm.prank(provider1);
        usdc.approve(address(registry), type(uint256).max);
    }

    // ------------------------------------------------------------------
    // constructor
    // ------------------------------------------------------------------

    function test_constructor_zeroAdmin_reverts() public {
        vm.expectRevert(ServiceRegistryV8.InvalidAdmin.selector);
        new ServiceRegistryV8(IERC20(address(usdc)), MIN_STAKE, address(0));
    }

    function test_transferAdmin_onlyAdmin() public {
        vm.prank(user);
        vm.expectRevert(ServiceRegistryV8.NotAdmin.selector);
        registry.transferAdmin(user);

        vm.prank(admin);
        registry.transferAdmin(user);

        assertEq(registry.admin(), user);
        assertEq(registry.payPerCall(), payPerCall);
    }

    function test_transferAdmin_zeroAddress_reverts() public {
        vm.prank(admin);
        vm.expectRevert(ServiceRegistryV8.InvalidAdmin.selector);
        registry.transferAdmin(address(0));
    }

    // ------------------------------------------------------------------
    // register
    // ------------------------------------------------------------------

    function test_register_setsProviderAndTermsV1() public {
        vm.prank(provider1);
        uint256 id = registry.register(
            provider1Signer,
            STAKE,
            PRICE,
            MAX_RESP,
            SLASH_BPS,
            AVAILABILITY_BPS,
            0,
            "https://api.example",
            TERMS_HASH,
            TERMS_URI
        );

        assertEq(id, 1);
        assertEq(registry.providerIdOf(provider1), 1);
        assertEq(registry.nextProviderId(), 2);

        IServiceRegistryV8.ProviderView memory p = registry.getProvider(id);
        assertEq(p.owner, provider1);
        assertEq(p.signer, provider1Signer);
        assertEq(p.stake, STAKE);
        assertEq(p.pricePerCall, PRICE);
        assertEq(p.latestTermsVersion, 1);
        assertTrue(p.active);
        assertEq(p.pendingCalls, 0);

        IServiceRegistryV8.SLATerms memory terms = registry.getTerms(id, 1);
        assertEq(terms.version, 1);
        assertEq(terms.maxResponseTime, MAX_RESP);
        assertEq(terms.slashBps, SLASH_BPS);
        assertEq(terms.availabilityTargetBps, AVAILABILITY_BPS);
        assertEq(terms.termsHash, TERMS_HASH);
        assertEq(terms.termsUri, TERMS_URI);
        assertEq(terms.effectiveAt, uint64(block.timestamp));
        assertTrue(terms.active);
    }

    function test_register_pullsUSDC() public {
        uint256 before = usdc.balanceOf(provider1);

        vm.prank(provider1);
        registry.register(
            provider1Signer,
            STAKE,
            PRICE,
            MAX_RESP,
            SLASH_BPS,
            AVAILABILITY_BPS,
            0,
            "https://api",
            TERMS_HASH,
            TERMS_URI
        );

        assertEq(usdc.balanceOf(provider1), before - STAKE);
        assertEq(usdc.balanceOf(address(registry)), STAKE);
    }

    function test_register_emitsProviderAndTermsEvents() public {
        vm.expectEmit(true, true, true, true);
        emit IServiceRegistryV8.ProviderRegistered(
            1, provider1, provider1Signer, STAKE, PRICE, 1, TERMS_HASH, "https://api"
        );

        vm.expectEmit(true, true, false, true);
        emit IServiceRegistryV8.TermsUpdated(1, 1, TERMS_HASH, uint64(block.timestamp));

        vm.prank(provider1);
        registry.register(
            provider1Signer,
            STAKE,
            PRICE,
            MAX_RESP,
            SLASH_BPS,
            AVAILABILITY_BPS,
            0,
            "https://api",
            TERMS_HASH,
            TERMS_URI
        );
    }

    function test_register_twice_reverts() public {
        _registerDefault();

        vm.expectRevert(ServiceRegistryV8.AlreadyRegistered.selector);
        vm.prank(provider1);
        registry.register(
            provider1Signer,
            STAKE,
            PRICE,
            MAX_RESP,
            SLASH_BPS,
            AVAILABILITY_BPS,
            0,
            "https://api",
            TERMS_HASH,
            TERMS_URI
        );
    }

    function test_register_belowMinStake_reverts() public {
        vm.expectRevert(ServiceRegistryV8.BelowMinStake.selector);
        vm.prank(provider1);
        registry.register(
            provider1Signer,
            MIN_STAKE - 1,
            PRICE,
            MAX_RESP,
            SLASH_BPS,
            AVAILABILITY_BPS,
            0,
            "https://api",
            TERMS_HASH,
            TERMS_URI
        );
    }

    function test_register_invalidSlashBps_reverts() public {
        vm.expectRevert(ServiceRegistryV8.InvalidSlashBps.selector);
        vm.prank(provider1);
        registry.register(
            provider1Signer, STAKE, PRICE, MAX_RESP, 10_001, AVAILABILITY_BPS, 0, "https://api", TERMS_HASH, TERMS_URI
        );
    }

    function test_register_invalidResponseTime_reverts() public {
        vm.expectRevert(ServiceRegistryV8.InvalidResponseTime.selector);
        vm.prank(provider1);
        registry.register(
            provider1Signer, STAKE, PRICE, 4, SLASH_BPS, AVAILABILITY_BPS, 0, "https://api", TERMS_HASH, TERMS_URI
        );
    }

    function test_register_invalidAvailabilityTarget_reverts() public {
        vm.expectRevert(ServiceRegistryV8.InvalidAvailabilityTarget.selector);
        vm.prank(provider1);
        registry.register(
            provider1Signer, STAKE, PRICE, MAX_RESP, SLASH_BPS, 10_001, 0, "https://api", TERMS_HASH, TERMS_URI
        );
    }

    function test_register_zeroSigner_reverts() public {
        vm.expectRevert(ServiceRegistryV8.InvalidSigner.selector);
        vm.prank(provider1);
        registry.register(
            address(0), STAKE, PRICE, MAX_RESP, SLASH_BPS, AVAILABILITY_BPS, 0, "https://api", TERMS_HASH, TERMS_URI
        );
    }

    // ------------------------------------------------------------------
    // addStake
    // ------------------------------------------------------------------

    function test_addStake_increasesStakeAndPullsUSDC() public {
        uint256 id = _registerDefault();
        uint256 before = usdc.balanceOf(provider1);

        vm.expectEmit(true, false, false, true);
        emit IServiceRegistryV8.StakeAdded(id, 25e6, STAKE + 25e6);

        vm.prank(provider1);
        registry.addStake(id, 25e6);

        assertEq(usdc.balanceOf(provider1), before - 25e6);
        assertEq(usdc.balanceOf(address(registry)), STAKE + 25e6);
        assertEq(registry.getProvider(id).stake, STAKE + 25e6);
    }

    function test_addStake_nonOwner_reverts() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.NotOwner.selector);
        vm.prank(user);
        registry.addStake(id, 1e6);
    }

    function test_addStake_zero_reverts() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.ZeroAmount.selector);
        vm.prank(provider1);
        registry.addStake(id, 0);
    }

    // ------------------------------------------------------------------
    // terms updates
    // ------------------------------------------------------------------

    function test_proposeTerms_storesPendingVersion() public {
        uint256 id = _registerDefault();

        vm.prank(provider1);
        uint32 proposed = registry.proposeTermsUpdate(id, _termsInput(60, 1_500, 9_900, "terms-v2"));

        assertEq(proposed, 2);

        (IServiceRegistryV8.TermsInput memory input, uint32 proposedVersion, uint64 executeAt) =
            registry.getPendingTerms(id);

        assertEq(input.maxResponseTime, 60);
        assertEq(input.slashBps, 1_500);
        assertEq(input.availabilityTargetBps, 9_900);
        assertEq(input.termsHash, keccak256("terms-v2"));
        assertEq(input.termsUri, "ipfs://terms-v2");
        assertEq(proposedVersion, 2);
        assertEq(executeAt, uint64(block.timestamp + registry.TERMS_TIMELOCK()));
    }

    function test_executeTerms_beforeTimelock_reverts() public {
        uint256 id = _registerDefault();

        vm.prank(provider1);
        registry.proposeTermsUpdate(id, _termsInput(60, 1_500, 9_900, "terms-v2"));

        vm.expectRevert(ServiceRegistryV8.TermsTimelockNotElapsed.selector);
        vm.prank(provider1);
        registry.executeTermsUpdate(id);
    }

    function test_executeTerms_createsV2AndKeepsV1() public {
        uint256 id = _registerDefault();

        vm.prank(provider1);
        registry.proposeTermsUpdate(id, _termsInput(60, 1_500, 9_900, "terms-v2"));

        skip(registry.TERMS_TIMELOCK());

        vm.expectEmit(true, true, false, true);
        emit IServiceRegistryV8.TermsUpdated(id, 2, keccak256("terms-v2"), uint64(block.timestamp));

        vm.prank(provider1);
        uint32 version = registry.executeTermsUpdate(id);

        assertEq(version, 2);
        assertEq(registry.latestTermsVersion(id), 2);
        assertEq(registry.getProvider(id).latestTermsVersion, 2);

        IServiceRegistryV8.SLATerms memory v1 = registry.getTerms(id, 1);
        assertEq(v1.version, 1);
        assertEq(v1.maxResponseTime, MAX_RESP);
        assertEq(v1.slashBps, SLASH_BPS);
        assertEq(v1.availabilityTargetBps, AVAILABILITY_BPS);
        assertEq(v1.termsHash, TERMS_HASH);

        IServiceRegistryV8.SLATerms memory v2 = registry.getTerms(id, 2);
        assertEq(v2.version, 2);
        assertEq(v2.maxResponseTime, 60);
        assertEq(v2.slashBps, 1_500);
        assertEq(v2.availabilityTargetBps, 9_900);
        assertEq(v2.termsHash, keccak256("terms-v2"));
        assertEq(v2.termsUri, "ipfs://terms-v2");
        assertTrue(v2.active);
    }

    function test_executeTerms_withoutProposal_reverts() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.NoPendingTerms.selector);
        vm.prank(provider1);
        registry.executeTermsUpdate(id);
    }

    function test_cancelTerms_clearsPending() public {
        uint256 id = _registerDefault();

        vm.prank(provider1);
        registry.proposeTermsUpdate(id, _termsInput(60, 1_500, 9_900, "terms-v2"));

        vm.expectEmit(true, true, false, true);
        emit IServiceRegistryV8.TermsProposalCancelled(id, 2);

        vm.prank(provider1);
        registry.cancelTermsUpdate(id);

        (,, uint64 executeAt) = registry.getPendingTerms(id);
        assertEq(executeAt, 0);
        assertEq(registry.latestTermsVersion(id), 1);

        vm.expectRevert(ServiceRegistryV8.NoPendingTerms.selector);
        vm.prank(provider1);
        registry.executeTermsUpdate(id);
    }

    function test_proposeTerms_nonOwner_reverts() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.NotOwner.selector);
        vm.prank(user);
        registry.proposeTermsUpdate(id, _termsInput(60, 1_500, 9_900, "terms-v2"));
    }

    function test_proposeTerms_invalidSlashBps_reverts() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.InvalidSlashBps.selector);
        vm.prank(provider1);
        registry.proposeTermsUpdate(id, _termsInput(60, 10_001, 9_900, "terms-v2"));
    }

    function test_proposeTerms_invalidResponseTime_reverts() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.InvalidResponseTime.selector);
        vm.prank(provider1);
        registry.proposeTermsUpdate(id, _termsInput(4, 1_500, 9_900, "terms-v2"));
    }

    function test_proposeTerms_invalidAvailabilityTarget_reverts() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.InvalidAvailabilityTarget.selector);
        vm.prank(provider1);
        registry.proposeTermsUpdate(id, _termsInput(60, 1_500, 10_001, "terms-v2"));
    }

    function test_getTerms_unknownVersion_reverts() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.UnknownTerms.selector);
        registry.getTerms(id, 2);

        vm.expectRevert(ServiceRegistryV8.UnknownTerms.selector);
        registry.getTerms(id, 0);
    }

    // ------------------------------------------------------------------
    // slash + hooks
    // ------------------------------------------------------------------

    function test_slash_byPayPerCall_transfersAndReducesStake() public {
        uint256 id = _registerDefault();
        uint256 amount = 20e6;
        uint256 before = usdc.balanceOf(user);

        vm.prank(payPerCall);
        registry.slash(id, amount, user);

        assertEq(usdc.balanceOf(user), before + amount);
        assertEq(registry.getProvider(id).stake, STAKE - amount);
    }

    function test_slash_byAuthorizedSlasher_works() public {
        uint256 id = _registerDefault();
        address dispute = address(0xD15);

        vm.prank(admin);
        registry.authorizeSlasher(dispute);

        vm.prank(dispute);
        registry.slash(id, 10e6, user);

        assertEq(registry.getProvider(id).stake, STAKE - 10e6);
    }

    function test_authorizeSlasher_zeroAddress_reverts() public {
        vm.expectRevert(ServiceRegistryV8.InvalidSlasher.selector);
        vm.prank(admin);
        registry.authorizeSlasher(address(0));
    }

    function test_slash_unauthorized_reverts() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.OnlySlasher.selector);
        vm.prank(user);
        registry.slash(id, 1e6, user);
    }

    function test_slash_overStake_reverts() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.InsufficientStake.selector);
        vm.prank(payPerCall);
        registry.slash(id, STAKE + 1, user);
    }

    function test_slash_zero_reverts() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.ZeroAmount.selector);
        vm.prank(payPerCall);
        registry.slash(id, 0, user);
    }

    function test_hooks_onlyPayPerCall() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.OnlyPayPerCall.selector);
        registry.markCallStarted(id);

        vm.expectRevert(ServiceRegistryV8.OnlyPayPerCall.selector);
        registry.markCallFinished(id);
    }

    function test_markCallStartedAndFinished_tracksPending() public {
        uint256 id = _registerDefault();

        vm.startPrank(payPerCall);
        registry.markCallStarted(id);
        registry.markCallStarted(id);
        assertEq(registry.getProvider(id).pendingCalls, 2);

        registry.markCallFinished(id);
        assertEq(registry.getProvider(id).pendingCalls, 1);
        vm.stopPrank();
    }

    function test_markCallFinished_withoutStart_reverts() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.NoPendingCalls.selector);
        vm.prank(payPerCall);
        registry.markCallFinished(id);
    }

    function test_incCompletedAndSlashed_updateCounters() public {
        uint256 id = _registerDefault();

        vm.startPrank(payPerCall);
        registry.incCompleted(id);
        registry.incSlashed(id);
        vm.stopPrank();

        IServiceRegistryV8.ProviderView memory p = registry.getProvider(id);
        assertEq(p.completedCalls, 1);
        assertEq(p.slashedCalls, 1);
    }

    // ------------------------------------------------------------------
    // lifecycle
    // ------------------------------------------------------------------

    function test_deactivate_flipsActive() public {
        uint256 id = _registerDefault();

        vm.prank(provider1);
        registry.deactivate(id);

        assertFalse(registry.getProvider(id).active);
    }

    function test_deactivate_nonOwner_reverts() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.NotOwner.selector);
        vm.prank(user);
        registry.deactivate(id);
    }

    function test_unstake_afterCooldown_returnsUSDC() public {
        uint256 id = _registerDefault();

        vm.prank(provider1);
        registry.deactivate(id);
        skip(registry.UNSTAKE_COOLDOWN());

        uint256 before = usdc.balanceOf(provider1);
        vm.prank(provider1);
        registry.unstake(id);

        assertEq(usdc.balanceOf(provider1), before + STAKE);
        assertEq(registry.getProvider(id).stake, 0);
    }

    function test_unstake_whileActive_reverts() public {
        uint256 id = _registerDefault();

        vm.expectRevert(ServiceRegistryV8.StillActive.selector);
        vm.prank(provider1);
        registry.unstake(id);
    }

    function test_unstake_withPendingCalls_reverts() public {
        uint256 id = _registerDefault();

        vm.prank(provider1);
        registry.deactivate(id);
        vm.prank(payPerCall);
        registry.markCallStarted(id);
        skip(registry.UNSTAKE_COOLDOWN());

        vm.expectRevert(ServiceRegistryV8.PendingCalls.selector);
        vm.prank(provider1);
        registry.unstake(id);
    }

    function test_setPayPerCall_twice_reverts() public {
        vm.expectRevert(ServiceRegistryV8.PayPerCallAlreadySet.selector);
        vm.prank(admin);
        registry.setPayPerCall(address(0xBEEF));
    }

    function test_setPayPerCall_nonAdmin_reverts() public {
        ServiceRegistryV8 fresh = new ServiceRegistryV8(IERC20(address(usdc)), MIN_STAKE, admin);

        vm.expectRevert(ServiceRegistryV8.NotAdmin.selector);
        vm.prank(user);
        fresh.setPayPerCall(payPerCall);
    }

    function test_getProvider_unknown_returnsEmpty() public view {
        IServiceRegistryV8.ProviderView memory p = registry.getProvider(999);
        assertEq(p.owner, address(0));
        assertEq(p.stake, 0);
        assertEq(p.latestTermsVersion, 0);
    }

    // ------------------------------------------------------------------
    // helpers
    // ------------------------------------------------------------------

    function _registerDefault() internal returns (uint256 id) {
        vm.prank(provider1);
        id = registry.register(
            provider1Signer,
            STAKE,
            PRICE,
            MAX_RESP,
            SLASH_BPS,
            AVAILABILITY_BPS,
            0,
            "https://api",
            TERMS_HASH,
            TERMS_URI
        );
    }

    function _termsInput(uint32 maxResponseTime, uint16 slashBps, uint16 availabilityTargetBps, string memory label)
        internal
        pure
        returns (IServiceRegistryV8.TermsInput memory)
    {
        return IServiceRegistryV8.TermsInput({
            maxResponseTime: maxResponseTime,
            slashBps: slashBps,
            availabilityTargetBps: availabilityTargetBps,
            termsHash: keccak256(bytes(label)),
            termsUri: string.concat("ipfs://", label)
        });
    }
}

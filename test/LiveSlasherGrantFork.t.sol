// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IServiceRegistryV8 } from "../contracts/interfaces/IServiceRegistryV8.sol";

/// @title The exact slasher-grant sequence against live state, executed on a fork
/// @notice The 13 Nov registry has no authorised dispute contract (issue #5), and
///         the admin key is not in the workspace. This forks the current head and
///         runs the two calls an admin has to send.
///
///         The live `pendingSlasher` is a stale `DisputeV2` nomination whose delay
///         elapsed on 14 Nov. It does **not** have to be confirmed first:
///         `authorizeSlasher` overwrites the slot unconditionally, so nominating
///         `DisputeV4` today restarts the delay from now and never hands the
///         deprecated V2 the authority. The test asserts both halves of that.
///
///         Requires an RPC that can read the head block:
///         `ARC_RPC_URL=https://rpc.testnet.arc.io forge test --match-path test/LiveSlasherGrantFork.t.sol`
contract LiveSlasherGrantFork is Test {
    address internal constant REGISTRY = 0x21E073030Bdb226Fb69E2f7ABE233c33A7b0ddC9;
    address internal constant DISPUTE_V4 = 0x7c04880003361c16Dd1d49205ef5ec187e2D2d39;
    address internal constant DISPUTE_V2 = 0x6d9D5E59AE820E58dB0402eB34579bA55419fEF5;
    address internal constant ADMIN = 0x8776B38284694436d0C3940044156BB2706dd0A2;

    /// @dev Arc's USDC exposes the native gas token through an ERC-20 facade.
    address internal constant USDC_BLOCKLIST = 0x1800000000000000000000000000000000000001;
    address internal constant USDC_NATIVE_TRANSFER = 0x1800000000000000000000000000000000000000;
    bytes internal constant RETURNS_FALSE = hex"600060005260206000f3";

    IServiceRegistryV8 internal registry;

    function setUp() public {
        string memory rpc = vm.envOr("ARC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) vm.skip(true);
        try vm.createSelectFork(rpc) {} catch {
            vm.skip(true);
        }
        registry = IServiceRegistryV8(REGISTRY);
        // The fork has to be able to move USDC for the final slash probe.
        vm.etch(USDC_BLOCKLIST, RETURNS_FALSE);
        vm.mockCall(
            USDC_NATIVE_TRANSFER,
            abi.encodeWithSignature("transfer(address,address,uint256)"),
            abi.encode(true)
        );
    }

    function test_nominatingDisputeV4OverwritesTheStaleV2SlotAndGrantsIt() public {
        // Live starting point, read rather than assumed.
        assertFalse(registry.authorizedSlashers(DISPUTE_V4), "V4 already authorised");
        assertFalse(registry.authorizedSlashers(DISPUTE_V2), "V2 already authorised");
        assertEq(registry.pendingSlasher(), DISPUTE_V2, "a different contract holds the slot");

        uint256 delay = registry.SLASHER_DELAY();

        // Step 1: nominate V4. This replaces the stale V2 nomination.
        vm.prank(ADMIN);
        registry.authorizeSlasher(DISPUTE_V4);
        assertEq(registry.pendingSlasher(), DISPUTE_V4, "nomination did not overwrite the slot");
        assertEq(registry.pendingSlasherAt(), block.timestamp + delay, "delay did not restart");

        // Confirming inside the delay must fail, and the slot must survive.
        vm.prank(ADMIN);
        vm.expectRevert();
        registry.confirmSlasher();
        assertEq(registry.pendingSlasher(), DISPUTE_V4, "failed confirm cleared the slot");

        // Step 2: after the delay, confirm.
        vm.warp(block.timestamp + delay);
        vm.prank(ADMIN);
        registry.confirmSlasher();

        assertTrue(registry.authorizedSlashers(DISPUTE_V4), "DisputeV4 not authorised");
        assertEq(registry.pendingSlasher(), address(0), "pending slot not cleared");

        // The deprecated V2 never received the authority on this path.
        assertFalse(registry.authorizedSlashers(DISPUTE_V2), "V2 was granted by accident");

        // The escrow step `openDispute` performs: on the live chain this is the
        // call that reverts `OnlySlasher` today. One micro-USDC, to a burn address.
        uint256 before = registry.getProvider(1).stake;
        vm.prank(DISPUTE_V4);
        registry.slash(1, 1, address(0xdead));
        assertEq(registry.getProvider(1).stake, before - 1, "slash did not move stake");
    }
}

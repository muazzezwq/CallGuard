// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IServiceRegistryV8 } from "../contracts/interfaces/IServiceRegistryV8.sol";

/// @title The exact slasher-grant sequence against live state, executed on a fork
/// @notice The 13 Nov registry has no authorised dispute contract (issue #5), and
///         the admin key is not in the workspace. This forks the current head and
///         runs the three calls an admin has to send, proving the sequence the
///         runbook prescribes works against the deployed bytecode and the real
///         pending-slot state. Nothing here is broadcast.
///
///         Requires an RPC that can read the head block:
///         `ARC_RPC_URL=https://rpc.testnet.arc.io forge test --match-path test/LiveSlasherGrantFork.t.sol`
contract LiveSlasherGrantFork is Test {
    address internal constant REGISTRY = 0x21E073030Bdb226Fb69E2f7ABE233c33A7b0ddC9;
    address internal constant DISPUTE_V4 = 0x7c04880003361c16Dd1d49205ef5ec187e2D2d39;
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

    function test_grantSequenceAuthorisesDisputeV4() public {
        // Bounded: at most one confirm, one nomination, one confirm.
        for (uint256 i = 0; i < 4 && !registry.authorizedSlashers(DISPUTE_V4); i++) {
            address pending = registry.pendingSlasher();
            uint256 readyAt = registry.pendingSlasherAt();

            if (pending == address(0)) {
                vm.prank(ADMIN);
                registry.authorizeSlasher(DISPUTE_V4);
            } else if (block.timestamp < readyAt) {
                vm.warp(readyAt);
            } else {
                vm.prank(ADMIN);
                registry.confirmSlasher();
            }
        }

        assertTrue(registry.authorizedSlashers(DISPUTE_V4), "DisputeV4 not authorised");
        assertEq(registry.pendingSlasher(), address(0), "pending slot not cleared");

        // The escrow step `openDispute` performs: this is the call that reverts
        // OnlySlasher on the live chain today. One micro-USDC, to a burn address.
        uint256 before = registry.getProvider(1).stake;
        vm.prank(DISPUTE_V4);
        registry.slash(1, 1, address(0xdead));
        assertEq(registry.getProvider(1).stake, before - 1, "slash did not move stake");
    }
}

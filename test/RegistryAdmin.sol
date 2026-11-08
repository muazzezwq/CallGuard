// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Vm } from "forge-std/Vm.sol";
import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";

/// @notice Test helper for the two-step slasher grant.
/// @dev `authorizeSlasher` only nominates; `confirmSlasher` needs the delay to
///      elapse. Tests are not the admin's watchdog window, so they warp.
///      Must be called inside the admin's prank scope.
function authorizeSlasherNow(Vm vm, ServiceRegistryV8 registry, address slasher) {
    registry.authorizeSlasher(slasher);
    vm.warp(block.timestamp + registry.SLASHER_DELAY());
    registry.confirmSlasher();
}

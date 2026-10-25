// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";
import { SLAUptime } from "../contracts/SLAUptime.sol";

/// @title DeploySLAUptime
/// @notice Deploys the availability enforcer against the live v8 registry and
///         authorises it as a slasher.
///
/// A8: `availabilityTargetBps` was published but never enforced. `SLAUptime`
/// measures availability from the registry counters since the last check and
/// pays a bounty to whoever proves a miss, so the published target costs the
/// provider money.
///
/// Usage (Arc Testnet):
///
///   forge script script/DeploySLAUptime.s.sol:DeploySLAUptime \
///     --account deployer --rpc-url arc_testnet --broadcast
///
/// Required env:
///   USDC_ADDRESS, SERVICE_REGISTRY_V8, ARBITER_ADDRESS, TREASURY_ADDRESS
///
/// Optional env (defaults shown):
///   AVAILABILITY_SLASH_BPS=1000   (10 % of the stake per missed window)
///   BOUNTY_BPS=2000               (20 % of the slash to the claimer)
///   AVAILABILITY_COOLDOWN=86400   (24 h between claims per provider)
///   AVAILABILITY_MIN_SAMPLES=20   (calls required before a claim)
contract DeploySLAUptime is Script {
    function run() external returns (SLAUptime uptime) {
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address registryAddress = vm.envAddress("SERVICE_REGISTRY_V8");
        address arbiter = vm.envAddress("ARBITER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        uint16 availabilitySlashBps = uint16(vm.envOr("AVAILABILITY_SLASH_BPS", uint256(1_000)));
        uint16 bountyBps = uint16(vm.envOr("BOUNTY_BPS", uint256(2_000)));
        uint32 cooldown = uint32(vm.envOr("AVAILABILITY_COOLDOWN", uint256(24 hours)));
        uint32 minSamples = uint32(vm.envOr("AVAILABILITY_MIN_SAMPLES", uint256(20)));

        console2.log("Deployer        :", msg.sender);
        console2.log("USDC            :", usdcAddress);
        console2.log("Registry        :", registryAddress);
        console2.log("Arbiter         :", arbiter);
        console2.log("Treasury        :", treasury);
        console2.log("Slash bps       :", availabilitySlashBps);
        console2.log("Bounty bps      :", bountyBps);
        console2.log("Cooldown        :", cooldown);
        console2.log("Min samples     :", minSamples);

        vm.startBroadcast();

        uptime = new SLAUptime(
            IERC20(usdcAddress),
            ServiceRegistryV8(registryAddress),
            arbiter,
            treasury,
            availabilitySlashBps,
            bountyBps,
            cooldown,
            minSamples
        );
        console2.log("SLAUptime       :", address(uptime));

        // The registry only lets authorised slashers move stake, so the claim
        // reverts until this lands.
        ServiceRegistryV8(registryAddress).authorizeSlasher(address(uptime));
        console2.log("Authorized as slasher on the registry");

        vm.stopBroadcast();
    }
}

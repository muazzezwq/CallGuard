// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { SLAAttestationBridge } from "../src/SLAAttestationBridge.sol";

/// @title DeploySLABridge
/// @notice Deploys SLAAttestationBridge and wires it to existing
///         PayPerCall + ServiceRegistry deployments.
///
/// Usage (Arc Testnet):
///
///   forge script script/DeploySLABridge.s.sol:DeploySLABridge \
///     --account deployer \
///     --sender 0xYOUR_DEPLOYER \
///     --rpc-url arc_testnet \
///     --broadcast
///
/// Required env vars:
///   PAY_PER_CALL_ADDRESS     — deployed PayPerCall
///   SERVICE_REGISTRY_ADDRESS — deployed ServiceRegistry
contract DeploySLABridge is Script {
    function run() external returns (SLAAttestationBridge bridge) {
        address payPerCall     = vm.envAddress("PAY_PER_CALL_ADDRESS");
        address serviceRegistry = vm.envAddress("SERVICE_REGISTRY_ADDRESS");

        console2.log("Deployer          :", msg.sender);
        console2.log("PayPerCall        :", payPerCall);
        console2.log("ServiceRegistry   :", serviceRegistry);

        vm.startBroadcast();

        bridge = new SLAAttestationBridge(payPerCall, serviceRegistry);
        console2.log("SLAAttestationBridge :", address(bridge));

        vm.stopBroadcast();

        console2.log("---");
        console2.log("Add to .env / Vercel:");
        console2.log("  VITE_SLA_ATTESTATION_BRIDGE=", address(bridge));
        console2.log("  PAY_PER_CALL_ADDRESS=", payPerCall);
        console2.log("  SERVICE_REGISTRY_ADDRESS=", serviceRegistry);
    }
}

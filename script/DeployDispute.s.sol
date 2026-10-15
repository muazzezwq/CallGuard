// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/Dispute.sol";

/// @title DeployDispute
/// @notice Deploys the base `Dispute` arbitration contract and wires it to
///         PayPerCall. `setPayPerCall` is one-time and arbiter-only; without it
///         `openDispute` reverts (disputes must bind to a verified call).
///
/// Env vars:
///   DEPLOYER          — owner/arbiter/treasury wallet (required)
///   USDC_ADDRESS      — defaults to Arc native USDC
///   SERVICE_REGISTRY  — defaults to active v7
///   PAY_PER_CALL      — active PayPerCall (required to wire)
///   DISPUTE_BOND      — bond in USDC base units (default 10 USDC)
///   DISPUTE_WINDOW    — seconds (default 7 days)
///   DISPUTE_SLASH_BPS — extra slash on upheld dispute (default 1000 = 10%)
contract DeployDispute is Script {
    function run() external {
        address usdc     = vm.envOr("USDC_ADDRESS", address(0x3600000000000000000000000000000000000000));
        address registry = vm.envOr("SERVICE_REGISTRY", address(0x9cA97010464E8e6dE6E27CF25eAe9B939fbD7333));
        address payPerCall = vm.envAddress("PAY_PER_CALL");
        address owner    = vm.envAddress("DEPLOYER");

        uint256 disputeBond     = vm.envOr("DISPUTE_BOND", uint256(10e6));
        uint32  disputeWindow   = uint32(vm.envOr("DISPUTE_WINDOW", uint256(7 days)));
        uint16  disputeSlashBps = uint16(vm.envOr("DISPUTE_SLASH_BPS", uint256(1_000)));

        vm.startBroadcast();

        Dispute dispute = new Dispute(
            usdc,
            registry,
            owner, // arbiter
            owner, // treasury
            disputeBond,
            disputeWindow,
            disputeSlashBps
        );
        console.log("Dispute deployed at:", address(dispute));

        // One-time wiring so openDispute can verify calls. Must be sent by arbiter.
        dispute.setPayPerCall(payPerCall);
        console.log("Wired Dispute -> PayPerCall:", payPerCall);

        vm.stopBroadcast();
    }
}

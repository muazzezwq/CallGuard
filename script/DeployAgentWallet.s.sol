// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/AgentWallet.sol";

contract DeployAgentWallet is Script {
    function run() external {
        address usdc       = 0x3600000000000000000000000000000000000000;
        address payPerCall = 0x10387347678d9f7106D5625bE0BD6C915158B130;
        address agent      = vm.envAddress("AGENT_ADDRESS"); // AI hot wallet
        address deployer   = vm.envAddress("DEPLOYER");

        uint256 dailyLimit = 10 * 1e6;  // 10 USDC/day
        uint256 maxPerCall = 2 * 1e6;   // 2 USDC/call max

        vm.startBroadcast();

        AgentWallet aw = new AgentWallet(
            usdc,
            payPerCall,
            agent,
            dailyLimit,
            maxPerCall
        );

        console.log("AgentWallet deployed at:", address(aw));
        console.log("Owner:", deployer);
        console.log("Agent:", agent);
        console.log("Daily limit: 10 USDC");
        console.log("Max per call: 2 USDC");
        console.log("");
        console.log("Next steps:");
        console.log("1. Deposit USDC: aw.deposit(amount)");
        console.log("2. Set AGENT_WALLET_ADDRESS=", address(aw), "in MCP server .env");
        console.log("3. Set AGENT_PRIVATE_KEY=<agent hot wallet key> in MCP server .env");

        vm.stopBroadcast();
    }
}

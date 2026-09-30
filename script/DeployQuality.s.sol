// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/DisputeQuality.sol";

contract DeployQuality is Script {
    function run() external {
        address usdc     = 0x3600000000000000000000000000000000000000;
        address registry = 0xea0046DE5dBF2Da3DB5D41b9A2Df3Cf9CecaeB4; // ServiceRegistry
        address owner    = vm.envAddress("DEPLOYER");

        uint256 disputeBond    = 500_000;  // 0.5 USDC (6 decimals)
        uint256 voterBond      = 100_000;  // 0.1 USDC
        uint256 minVoterStake  = 1_000_000; // 1 USDC
        uint32  disputeWindow  = 86400;    // 24 hours
        uint32  votingWindow   = 172800;   // 48 hours
        uint16  slashBps       = 500;      // 5% of provider stake on CallerWins

        vm.startBroadcast();

        DisputeQuality dq = new DisputeQuality(
            usdc,
            registry,
            owner,
            disputeBond,
            voterBond,
            minVoterStake,
            disputeWindow,
            votingWindow,
            slashBps
        );

        console.log("DisputeQuality deployed at:", address(dq));

        vm.stopBroadcast();
    }
}

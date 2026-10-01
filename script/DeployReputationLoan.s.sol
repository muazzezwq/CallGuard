// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ReputationLoan.sol";

contract DeployReputationLoan is Script {
    function run() external {
        address usdc     = 0x3600000000000000000000000000000000000000;
        address registry = 0xea00f898C0eA249de7226b283e93C13eFa7BbcFF;
        address owner    = vm.envAddress("DEPLOYER");

        uint16  minHonorRate    = 8000;  // 80%
        uint256 minCallCount    = 10;
        uint16  maxLoanBps      = 1000;  // 10% of pool
        uint16  interestRateBps = 500;   // 5% APY
        uint32  loanDuration    = 90 days;

        vm.startBroadcast();

        ReputationLoan rl = new ReputationLoan(
            usdc,
            registry,
            owner,
            minHonorRate,
            minCallCount,
            maxLoanBps,
            interestRateBps,
            loanDuration
        );

        console.log("ReputationLoan deployed at:", address(rl));

        vm.stopBroadcast();
    }
}

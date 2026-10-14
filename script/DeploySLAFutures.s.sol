// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/SLAFutures.sol";

contract DeploySLAFutures is Script {
    function run() external {
        address usdc     = 0x3600000000000000000000000000000000000000;
        address registry = 0x9ca97010464e8e6de6e27cf25eae9b939fbd7333;
        address owner    = vm.envAddress("DEPLOYER");
        string  memory baseUri = "https://arcsla.vercel.app/api/sla-futures";

        vm.startBroadcast();

        SLAFutures sf = new SLAFutures(usdc, registry, owner, baseUri);
        console.log("SLAFutures deployed at:", address(sf));

        vm.stopBroadcast();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";
import { PayPerCallV8 } from "../contracts/PayPerCallV8.sol";
import { SLAKeeper } from "../contracts/SLAKeeper.sol";
import { DisputeV2 } from "../contracts/DisputeV2.sol";
import { IPayPerCallV8 } from "../contracts/interfaces/IPayPerCallV8.sol";

/// @title DeployV8
/// @notice Deploys and wires the CallGuard P0 availability core.
///
/// Usage (Arc Testnet):
///
///   forge script script/DeployV8.s.sol:DeployV8 \
///     --account deployer --sender 0xYOUR_DEPLOYER \
///     --rpc-url arc_testnet --broadcast
///
/// Required env:
///   USDC_ADDRESS
///   ARBITER_ADDRESS
///   APPEAL_ARBITER_ADDRESS
///   TREASURY_ADDRESS
///
/// Optional env (defaults shown):
///   ADMIN_ADDRESS=<broadcaster>  (registry admin; separate from the gas payer)
///   MIN_STAKE=10000000
///   DISPUTE_BOND=2000000
///   APPEAL_BOND=3000000
///   DISPUTE_WINDOW=604800
///   APPEAL_WINDOW=172800
///   RESOLUTION_WINDOW=604800
///   DISPUTE_SLASH_BPS=1000
contract DeployV8 is Script {
    struct Deployment {
        ServiceRegistryV8 registry;
        PayPerCallV8 payPerCall;
        SLAKeeper keeper;
        DisputeV2 dispute;
    }

    function run() external returns (Deployment memory d) {
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address arbiter = vm.envAddress("ARBITER_ADDRESS");
        address appealArbiter = vm.envAddress("APPEAL_ARBITER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address admin = vm.envOr("ADMIN_ADDRESS", msg.sender);

        uint256 minStake = vm.envOr("MIN_STAKE", uint256(10e6));
        uint256 disputeBond = vm.envOr("DISPUTE_BOND", uint256(2e6));
        uint256 appealBond = vm.envOr("APPEAL_BOND", uint256(3e6));
        uint32 disputeWindow = uint32(vm.envOr("DISPUTE_WINDOW", uint256(7 days)));
        uint32 appealWindow = uint32(vm.envOr("APPEAL_WINDOW", uint256(2 days)));
        uint32 resolutionWindow = uint32(vm.envOr("RESOLUTION_WINDOW", uint256(7 days)));
        uint16 disputeSlashBps = uint16(vm.envOr("DISPUTE_SLASH_BPS", uint256(1_000)));

        console2.log("Deployer            :", msg.sender);
        console2.log("Registry admin      :", admin);
        console2.log("USDC                :", usdcAddress);
        console2.log("Arbiter             :", arbiter);
        console2.log("Appeal arbiter      :", appealArbiter);
        console2.log("Treasury            :", treasury);
        console2.log("Min stake           :", minStake);
        console2.log("Dispute bond        :", disputeBond);
        console2.log("Appeal bond         :", appealBond);

        vm.startBroadcast();

        // The broadcaster must be admin long enough to wire the pair atomically.
        d.registry = new ServiceRegistryV8(IERC20(usdcAddress), minStake, msg.sender);
        console2.log("ServiceRegistryV8   :", address(d.registry));

        d.payPerCall = new PayPerCallV8(IERC20(usdcAddress), d.registry);
        console2.log("PayPerCallV8        :", address(d.payPerCall));

        d.keeper = new SLAKeeper(IPayPerCallV8(address(d.payPerCall)), IERC20(usdcAddress));
        console2.log("SLAKeeper           :", address(d.keeper));

        d.dispute = new DisputeV2(
            IERC20(usdcAddress),
            d.registry,
            IPayPerCallV8(address(d.payPerCall)),
            arbiter,
            appealArbiter,
            treasury,
            disputeBond,
            appealBond,
            disputeWindow,
            appealWindow,
            resolutionWindow,
            disputeSlashBps
        );
        console2.log("DisputeV2           :", address(d.dispute));

        d.registry.setPayPerCall(address(d.payPerCall));
        d.registry.authorizeSlasher(address(d.dispute));
        if (admin != msg.sender) {
            d.registry.transferAdmin(admin);
            console2.log("Registry admin handed to:", admin);
        }
        console2.log("Wired PayPerCallV8 and DisputeV2");

        vm.stopBroadcast();
    }
}

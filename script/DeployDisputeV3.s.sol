// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";
import { PayPerCallV8 } from "../contracts/PayPerCallV8.sol";
import { DisputeV3 } from "../contracts/DisputeV3.sol";
import { IPayPerCallV8 } from "../contracts/interfaces/IPayPerCallV8.sol";

/// @title DeployDisputeV3
/// @notice Deploys DisputeV3 against the live v8 registry and PayPerCall, then
///         authorizes it as a slasher.
///
/// @dev    RETIRED 28 Oct 2026. `revokeSlasher(DisputeV3)` ran that day and its
///         last dispute (#4) was finalized, so V3 holds no USDC and no authority.
///         The live dispute contract is `DisputeV4`, deployed by
///         `script/DeployEvidenceV2.s.sol`. Do not run this script against the
///         current deployment: it would authorize a retired slasher.
///
/// DisputeV3 escrows the quality slash at `openDispute` time instead of at
/// resolution time, which closes the window where a provider could unstake
/// between a receipt and the arbiter's decision.
///
/// Usage (Arc Testnet):
///
///   forge script script/DeployDisputeV3.s.sol:DeployDisputeV3 \
///     --account deployer --rpc-url arc_testnet --broadcast
///
/// Required env:
///   USDC_ADDRESS, SERVICE_REGISTRY_V8, PAY_PER_CALL_V8
///   ARBITER_ADDRESS, APPEAL_ARBITER_ADDRESS, TREASURY_ADDRESS
///
/// Optional env (defaults match the live DisputeV2 configuration):
///   DISPUTE_BOND=2000000
///   APPEAL_BOND=3000000
///   DISPUTE_WINDOW=604800
///   APPEAL_WINDOW=172800
///   RESOLUTION_WINDOW=604800
///   DISPUTE_SLASH_BPS=1000
contract DeployDisputeV3 is Script {
    function run() external returns (DisputeV3 dispute) {
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address registryAddress = vm.envAddress("SERVICE_REGISTRY_V8");
        address payPerCallAddress = vm.envAddress("PAY_PER_CALL_V8");
        address arbiter = vm.envAddress("ARBITER_ADDRESS");
        address appealArbiter = vm.envAddress("APPEAL_ARBITER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        uint256 disputeBond = vm.envOr("DISPUTE_BOND", uint256(2e6));
        uint256 appealBond = vm.envOr("APPEAL_BOND", uint256(3e6));
        uint32 disputeWindow = uint32(vm.envOr("DISPUTE_WINDOW", uint256(7 days)));
        uint32 appealWindow = uint32(vm.envOr("APPEAL_WINDOW", uint256(2 days)));
        uint32 resolutionWindow = uint32(vm.envOr("RESOLUTION_WINDOW", uint256(7 days)));
        uint16 disputeSlashBps = uint16(vm.envOr("DISPUTE_SLASH_BPS", uint256(1_000)));

        console2.log("Deployer        :", msg.sender);
        console2.log("USDC            :", usdcAddress);
        console2.log("Registry        :", registryAddress);
        console2.log("PayPerCall      :", payPerCallAddress);
        console2.log("Arbiter         :", arbiter);
        console2.log("Appeal arbiter  :", appealArbiter);
        console2.log("Treasury        :", treasury);
        console2.log("Dispute bond    :", disputeBond);
        console2.log("Appeal bond     :", appealBond);
        console2.log("Dispute slash   :", disputeSlashBps);

        vm.startBroadcast();

        dispute = new DisputeV3(
            IERC20(usdcAddress),
            ServiceRegistryV8(registryAddress),
            IPayPerCallV8(payPerCallAddress),
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
        console2.log("DisputeV3       :", address(dispute));

        // The registry lets exactly the authorised slashers move stake, so the
        // new contract must be authorised before `openDispute` can escrow.
        ServiceRegistryV8(registryAddress).authorizeSlasher(address(dispute));
        console2.log("Authorized as slasher on the registry");

        vm.stopBroadcast();
    }
}

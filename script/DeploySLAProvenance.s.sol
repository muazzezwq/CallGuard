// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

import { SLAProvenance } from "../contracts/SLAProvenance.sol";

/// @title DeploySLAProvenance
/// @notice Deploys the provenance registry and allowlists the first attestor key.
///
/// B3b: the receipt binds a provider to a `responseHash`; it does not say where the
/// payload came from. `SLAProvenance` records an allowlisted attestor's signature
/// over `(callId, payloadHash, origin, observedAt)`, so a caller can check that the
/// body they received was witnessed by a key they chose to trust.
///
/// Usage (Arc Testnet):
///
///   forge script script/DeploySLAProvenance.s.sol:DeploySLAProvenance \
///     --account deployer --rpc-url arc_testnet --broadcast
///
/// Required env:
///   PROVENANCE_OWNER   owner of the registry (usually the admin wallet)
///
/// Optional env:
///   ATTESTOR_ADDRESS   first allowlisted attestor key; skipped when empty
contract DeploySLAProvenance is Script {
    function run() external returns (SLAProvenance provenance) {
        address owner = vm.envAddress("PROVENANCE_OWNER");
        address attestor = vm.envOr("ATTESTOR_ADDRESS", address(0));

        console2.log("Deployer        :", msg.sender);
        console2.log("Owner           :", owner);
        console2.log("Attestor        :", attestor);

        vm.startBroadcast();

        provenance = new SLAProvenance(owner);
        console2.log("SLAProvenance   :", address(provenance));

        if (attestor != address(0)) {
            provenance.setAttestor(attestor, true);
            console2.log("Attestor allowlisted");
        }

        vm.stopBroadcast();
    }
}

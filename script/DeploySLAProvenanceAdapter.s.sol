// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

import { SLAProvenanceAdapter } from "../contracts/zk/SLAProvenanceAdapter.sol";

/// @title DeploySLAProvenanceAdapter
/// @notice Deploys the proof-mode verifier that turns a `SLAProvenance` record into
///         a bindable `witness` claim on `SLAEvidenceRegistryV2`.
///
/// Deploying is only half the change: `witness` stays at verifier mode 0 until the
/// registry owner points the kind at this address. That transaction is deliberately
/// NOT in this script, because it edits a live registry and belongs in a reviewed
/// step of its own:
///
///   cast send <SLA_EVIDENCE_V2> \
///     'setProofVerifier(bytes32,address,bool)' \
///     $(cast keccak "witness") <ADAPTER> true \
///     --account owner --rpc-url arc_testnet
///
/// Usage (Arc Testnet):
///
///   forge script script/DeploySLAProvenanceAdapter.s.sol:DeploySLAProvenanceAdapter \
///     --account deployer --rpc-url arc_testnet --broadcast
///
/// Required env:
///   SLA_PROVENANCE   the SLAProvenance registry this adapter reads
contract DeploySLAProvenanceAdapter is Script {
    function run() external returns (SLAProvenanceAdapter adapter) {
        address provenance = vm.envAddress("SLA_PROVENANCE");

        console2.log("Deployer        :", msg.sender);
        console2.log("SLAProvenance   :", provenance);

        vm.startBroadcast();

        adapter = new SLAProvenanceAdapter(provenance);
        console2.log("SLAProvenanceAdapter:", address(adapter));

        vm.stopBroadcast();

        console2.log("");
        console2.log("Next, signed by the registry owner:");
        console2.log("  setProofVerifier(keccak256(\"witness\"), adapter, true)");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

import { SLAEvidenceRegistry } from "../contracts/SLAEvidenceRegistry.sol";
import { HonkVerifier } from "../contracts/zk/KeccakClaimVerifier.sol";
import { ZkClaimAdapter } from "../contracts/zk/ZkClaimAdapter.sol";

/// @title DeployEvidence
/// @notice Deploys the modular verification layer: one evidence registry, one UltraHonk
///         verifier, and the adapter that presents a proof in the registry's shape.
///
/// Nothing here touches `PayPerCallV8`, `ServiceRegistryV8` or `DisputeV3`. The layer is
/// additive: it records what was proven about a call, for whoever wants to read it.
///
/// Usage (Arc Testnet):
///
///   forge script script/DeployEvidence.s.sol:DeployEvidence \
///     --account owner --rpc-url arc_testnet --broadcast
///
/// Required env:
///   EVIDENCE_OWNER       owner of the registry (usually the admin wallet)
///
/// Optional env:
///   ZK_KIND              claim kind keyed to the proof verifier; defaults to keccak256("zk-constraint")
///   TEE_ATTESTOR_ADDRESS signature-mode verifier for keccak256("tee-attestation"), skipped when empty
contract DeployEvidence is Script {
    function run() external returns (SLAEvidenceRegistry evidence, HonkVerifier honk, ZkClaimAdapter adapter) {
        address owner = vm.envAddress("EVIDENCE_OWNER");
        bytes32 zkKind = vm.envOr("ZK_KIND", keccak256("zk-constraint"));
        address teeAttestor = vm.envOr("TEE_ATTESTOR_ADDRESS", address(0));

        console2.log("Deployer        :", msg.sender);
        console2.log("Owner           :", owner);
        console2.log("TEE attestor    :", teeAttestor);

        vm.startBroadcast();

        honk = new HonkVerifier();
        console2.log("HonkVerifier    :", address(honk));

        adapter = new ZkClaimAdapter(address(honk));
        console2.log("ZkClaimAdapter  :", address(adapter));

        evidence = new SLAEvidenceRegistry(owner);
        console2.log("EvidenceRegistry:", address(evidence));

        evidence.setProofVerifier(zkKind, address(adapter));
        console2.log("Proof verifier set for kind:");
        console2.logBytes32(zkKind);

        if (teeAttestor != address(0)) {
            evidence.setSignatureVerifier(keccak256("tee-attestation"), teeAttestor, true);
            console2.log("TEE attestor allowlisted");
        }

        vm.stopBroadcast();
    }
}

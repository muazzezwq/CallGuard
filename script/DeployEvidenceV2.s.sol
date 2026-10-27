// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";
import { DisputeV4, ISLAEvidenceV2 } from "../contracts/DisputeV4.sol";
import { SLAEvidenceRegistryV2 } from "../contracts/SLAEvidenceRegistryV2.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IServiceRegistryV8 } from "../contracts/interfaces/IServiceRegistryV8.sol";
import { IPayPerCallV8 } from "../contracts/interfaces/IPayPerCallV8.sol";
import { IDisputeV2 } from "../contracts/interfaces/IDisputeV2.sol";

/// @title DeployEvidenceV2
/// @notice Deploys `SLAEvidenceRegistryV2` and `DisputeV4` against the live v8
///         stack, then prints every owner transaction that still has to be
///         signed — seven of them, in the order they read back correctly.
///
/// The agent never broadcasts an owner-wallet transaction: this script deploys
/// only the two new contracts (the user signs the broadcasts at their own
/// TTY) and prints the seven admin calls, each with the exact selector and
/// arguments filled in, for the owner to run by hand. Every post-deploy wire
/// that can be read back is checked before the calls are printed; a wrong
/// read-back stops the script with a plain message.
///
/// Usage (Arc Testnet):
///
///   forge script script/DeployEvidenceV2.s.sol:DeployEvidenceV2 \
///     --account deployer --rpc-url arc_testnet --broadcast
///   forge script script/DeployEvidenceV2.s.sol:DeployEvidenceV2 \
///     --account deployer --rpc-url arc_testnet            # dry run, no broadcast
///
/// Optional env (defaults are the live deployments / live configuration):
///   USDC_ADDRESS=0x3600000000000000000000000000000000000000
///   SERVICE_REGISTRY_V8=0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3
///   PAY_PER_CALL_V8=0xedce61eF5be31DC22cEfE342692622A26919a7EF
///   LEGACY_DISPUTE=0xEf9f21Ece9b4C58BCb76913887E4f4846Ec36Fec
///   EVIDENCE_OWNER_ADDRESS=0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da
///   ARBITER_ADDRESS / APPEAL_ARBITER_ADDRESS / TREASURY_ADDRESS (default: owner)
///   DISPUTE_BOND=2000000
///   APPEAL_BOND=3000000
///   DISPUTE_WINDOW=604800
///   APPEAL_WINDOW=172800
///   RESOLUTION_WINDOW=604800
///   DISPUTE_SLASH_BPS=1000
///   WITNESS_ATTESTOR=          # omitted → step 3 prints a warning and is skipped
contract DeployEvidenceV2 is Script {
    // ---------------------------------------------------------------------
    // Pinned live values (asserted in test/DisputeV4.t.sol). Task 4's ported
    // tests deliberately use V3's shorter test windows for port parity, so
    // these defaults are where the live windows are stated.
    // ---------------------------------------------------------------------

    uint256 public constant DISPUTE_BOND_DEFAULT = 2_000_000;
    uint256 public constant APPEAL_BOND_DEFAULT = 3_000_000;
    uint256 public constant DISPUTE_WINDOW_DEFAULT = 604_800;
    uint256 public constant APPEAL_WINDOW_DEFAULT = 172_800;
    uint256 public constant RESOLUTION_WINDOW_DEFAULT = 604_800;
    uint256 public constant DISPUTE_SLASH_BPS_DEFAULT = 1_000;

    address public constant LIVE_LEGACY_DISPUTE = 0xEf9f21Ece9b4C58BCb76913887E4f4846Ec36Fec;
    address public constant ZK_CONSTRAINT_ADAPTER = 0x8bD4fB9F364F9aAd80E4dB275B08a49B88e3664E;
    address public constant ZK_EXECUTION_ADAPTER = 0xD804F2E0EfB3D8c470d60942643B71Ea5b271a21;

    address public constant LIVE_REGISTRY_V8 = 0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3;
    address public constant LIVE_PAY_PER_CALL_V8 = 0xedce61eF5be31DC22cEfE342692622A26919a7EF;
    address public constant LIVE_USDC = 0x3600000000000000000000000000000000000000;
    address public constant LIVE_OWNER = 0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da;

    bytes32 public constant KIND_WITNESS = keccak256("witness");
    bytes32 public constant KIND_TEE_ATTESTATION = keccak256("tee-attestation");
    bytes32 public constant KIND_ZK_CONSTRAINT = keccak256("zk-constraint");
    bytes32 public constant KIND_ZK_EXECUTION = keccak256("zk-execution");

    // Live zk-execution fixture: src/lib/verification/fixtures/zk-execution.json
    // and the statement/assumption twins pinned in test/ClaimHashes.t.sol.
    string public constant FIXTURE_CALL_ID = "0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265";
    string public constant FIXTURE_RESPONSE_HASH = "0x188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d";
    string public constant FIXTURE_CLAIM_HASH = "0xe3baff68e7c0299a4275cc3e7553fb27da16d1929fa47a5fe04ab7b58b9f419c";
    string public constant FIXTURE_STATEMENT_HASH = "0xf638c765d435690aa9da23cf4ab8d3e58f5b29ea8f7ee90d85829f583cd510f9";
    string public constant FIXTURE_ASSUMPTION_HASH = "0xa007194563d9649410719f9f3ba3daf8a8ccefb11c70a25d51be40753d91fef9";

    function run() external returns (SLAEvidenceRegistryV2 evidenceRegistry, DisputeV4 dispute) {
        address ownerAddress = vm.envOr("EVIDENCE_OWNER_ADDRESS", LIVE_OWNER);
        address usdcAddress = vm.envOr("USDC_ADDRESS", LIVE_USDC);
        address registryAddress = vm.envOr("SERVICE_REGISTRY_V8", LIVE_REGISTRY_V8);
        address payPerCallAddress = vm.envOr("PAY_PER_CALL_V8", LIVE_PAY_PER_CALL_V8);
        address legacyDisputeAddress = vm.envOr("LEGACY_DISPUTE", LIVE_LEGACY_DISPUTE);
        address arbiter = vm.envOr("ARBITER_ADDRESS", ownerAddress);
        address appealArbiter = vm.envOr("APPEAL_ARBITER_ADDRESS", ownerAddress);
        address treasury = vm.envOr("TREASURY_ADDRESS", ownerAddress);
        // The attestor key allowed to vouch for witness / tee-attestation
        // claims. Left unset, the Signature kinds stay unwired; the printed
        // steps then say exactly what absence looks like on chain.
        address attestor = vm.envOr("WITNESS_ATTESTOR", address(0));

        uint256 disputeBond = vm.envOr("DISPUTE_BOND", DISPUTE_BOND_DEFAULT);
        uint256 appealBond = vm.envOr("APPEAL_BOND", APPEAL_BOND_DEFAULT);
        uint32 disputeWindow = uint32(vm.envOr("DISPUTE_WINDOW", uint256(DISPUTE_WINDOW_DEFAULT)));
        uint32 appealWindow = uint32(vm.envOr("APPEAL_WINDOW", uint256(APPEAL_WINDOW_DEFAULT)));
        uint32 resolutionWindow = uint32(vm.envOr("RESOLUTION_WINDOW", uint256(RESOLUTION_WINDOW_DEFAULT)));
        uint16 disputeSlashBps = uint16(vm.envOr("DISPUTE_SLASH_BPS", uint256(DISPUTE_SLASH_BPS_DEFAULT)));

        _requireSet("owner", ownerAddress);
        _requireSet("USDC", usdcAddress);
        _requireSet("registry", registryAddress);
        _requireSet("payPerCall", payPerCallAddress);
        _requireSet("legacy dispute", legacyDisputeAddress);
        _requireSet("arbiter", arbiter);
        _requireSet("appeal arbiter", appealArbiter);
        _requireSet("treasury", treasury);

        console2.log("== Evidence V2 + DisputeV4 deploy ==");
        console2.log("Deployer        :", msg.sender);
        console2.log("Owner           :", ownerAddress);
        console2.log("USDC            :", usdcAddress);
        console2.log("Registry        :", registryAddress);
        console2.log("PayPerCall      :", payPerCallAddress);
        console2.log("Legacy dispute  :", legacyDisputeAddress);
        console2.log("Arbiter         :", arbiter);
        console2.log("Appeal arbiter  :", appealArbiter);
        console2.log("Treasury        :", treasury);
        console2.log("Dispute bond    :", disputeBond);
        console2.log("Appeal bond     :", appealBond);
        console2.log("Dispute slash   :", disputeSlashBps);
        console2.log("Attestor (witness/tee):", _orNone(attestor));

        vm.startBroadcast();
        evidenceRegistry = new SLAEvidenceRegistryV2(ownerAddress);
        console2.log("EvidenceRegistry:", address(evidenceRegistry));
        vm.stopBroadcast();

        // Read back before anything is built on top of it.
        if (evidenceRegistry.owner() != ownerAddress) {
            revert("refusing to continue: SLAEvidenceRegistryV2.owner() does not read back");
        }

        vm.startBroadcast();
        dispute = new DisputeV4(
            IERC20(usdcAddress),
            IServiceRegistryV8(registryAddress),
            IPayPerCallV8(payPerCallAddress),
            arbiter,
            appealArbiter,
            treasury,
            disputeBond,
            appealBond,
            disputeWindow,
            appealWindow,
            resolutionWindow,
            disputeSlashBps,
            ISLAEvidenceV2(address(evidenceRegistry)),
            IDisputeV2(legacyDisputeAddress)
        );
        console2.log("DisputeV4       :", address(dispute));
        vm.stopBroadcast();

        // Every wire `openDispute` reads, checked before the owner signs the
        // seven admin calls below.
        if (address(dispute.evidence()) != address(evidenceRegistry)) {
            revert("refusing to continue: DisputeV4.evidence() does not read back");
        }
        if (address(dispute.legacyDispute()) != legacyDisputeAddress) {
            revert("refusing to continue: DisputeV4.legacyDispute() does not read back");
        }
        if (dispute.arbiter() != arbiter) {
            revert("refusing to continue: DisputeV4.arbiter() does not read back");
        }
        if (dispute.disputeWindow() != disputeWindow) {
            revert("refusing to continue: DisputeV4.disputeWindow() does not read back");
        }
        if (dispute.disputeBond() != disputeBond || dispute.disputeSlashBps() != disputeSlashBps) {
            revert("refusing to continue: DisputeV4 bond/slash parameters do not read back");
        }
        ServiceRegistryV8 registry = ServiceRegistryV8(registryAddress);
        if (address(registry.payPerCall()) != payPerCallAddress) {
            revert("refusing to continue: registry.payPerCall() is not the dispute's PayPerCall");
        }

        _printOwnerCalls(evidenceRegistry, dispute, registry, legacyDisputeAddress, attestor);
    }

    // ---------------------------------------------------------------------
    // The seven owner calls, printed in the order the runbook runs them
    // (docs/V8_DEPLOYMENT.md, "Evidence V2 + DisputeV4"). Nothing here
    // broadcasts: the owner signs at their own TTY.
    // ---------------------------------------------------------------------

    function _printOwnerCalls(
        SLAEvidenceRegistryV2 evidenceRegistry,
        DisputeV4 dispute,
        ServiceRegistryV8 registry,
        address legacyDisputeAddress,
        address attestor
    ) private view {
        string memory reg = _addr(address(evidenceRegistry));
        string memory kindWitness = _kind(KIND_WITNESS);
        string memory kindZkConstraint = _kind(KIND_ZK_CONSTRAINT);
        string memory kindZkExecution = _kind(KIND_ZK_EXECUTION);
        string memory rpc = "<RPC URL>";

        console2.log("");
        console2.log("== 7 owner calls, sign each from the owner wallet at your own TTY ==");
        console2.log("");
        console2.log("# Steps 1-2. Both adapters' verify() reads the journal's callId and");
        console2.log("# responseHash, so both wirings record bindsResponse = true. The");
        console2.log("# registry cannot derive that flag; it stores the owner's attestation.");
        console2.log("1) cast send %s \\", reg);
        console2.log("    \"setProofVerifier(bytes32,address,bool)\" %s %s true", kindZkConstraint, _addr(ZK_CONSTRAINT_ADAPTER));
        console2.log("");
        console2.log("2) cast send %s \\", reg);
        console2.log("    \"setProofVerifier(bytes32,address,bool)\" %s %s true", kindZkExecution, _addr(ZK_EXECUTION_ADAPTER));
        console2.log("");
        console2.log("   read-back after 1-2:");
        console2.log("   cast call %s \"modeOf(bytes32)(uint8)\" %s --rpc-url %s        # expect 2", reg, kindZkConstraint, rpc);
        console2.log("   cast call %s \"modeOf(bytes32)(uint8)\" %s --rpc-url %s        # expect 2", reg, kindZkExecution, rpc);
        console2.log(
            string.concat(
                "   cast call ", reg, " \"proofVerifier(bytes32)(address)\" ", kindZkExecution, " --rpc-url ", rpc,
                "  # expect ", _addr(ZK_EXECUTION_ADAPTER)
            )
        );
        console2.log("   cast call %s \"bindsResponse(bytes32)(bool)\" %s --rpc-url %s    # expect true", reg, kindZkExecution, rpc);
        console2.log("");

        // Step 3. The real contract call takes three arguments:
        // setSignatureVerifier(bytes32 kind, address verifier, bool allowed);
        // the registry records bindsResponse = true for a signature wiring by
        // construction (the v2 digest covers responseHash).
        console2.log("# Step 3. Without an attestor, witness / tee-attestation stay");
        console2.log("# NoVerifier: future dispute rows answer present=false,");
        console2.log("# reason=NoVerifier - visible on chain, silent in the money paths.");
        if (attestor != address(0)) {
            console2.log("3) cast send %s \\", reg);
            console2.log("    \"setSignatureVerifier(bytes32,address,bool)\" %s %s true", kindWitness, _addr(attestor));
            console2.log("");
            console2.log("   read-back:");
            console2.log(
                string.concat(
                    "   cast call ", reg, " \"signatureVerifier(bytes32,address)(bool)\" ", kindWitness, " ",
                    _addr(attestor), " --rpc-url ", rpc, "  # expect true"
                )
            );
            console2.log("");
        } else {
            console2.log("3) SKIPPED: WITNESS_ATTESTOR not set - witness and tee-attestation stay");
            console2.log("   NoVerifier; skipped wiring is invisible in the UI because the");
            console2.log("   snapshot never moves money. Re-run with the env set to print it.");
            console2.log("");
        }

        // Step 4. Required: with an empty allowlist openDispute snapshots nothing
        // and the feature ships silently doing nothing. Skipping it is invisible
        // in the UI (no row is ever rendered, no error is shown).
        console2.log("4) cast send %s \\", _addr(address(dispute)));
        console2.log(
            string.concat(
                "    \"setEvidenceKinds(bytes32[])\" [", kindWitness, ",", _kind(KIND_TEE_ATTESTATION), ",",
                kindZkConstraint, ",", kindZkExecution, "]"
            )
        );
        console2.log("");
        console2.log("   read-back:");
        console2.log(
            "   cast call %s \"evidenceKinds()(bytes32[])\" --rpc-url %s  # expect the 4 kinds above",
            _addr(address(dispute)),
            rpc
        );
        console2.log("");

        // Steps 5-6. DisputeV3 keeps a read path and holds dispute #4's escrow,
        // but must not stay a slasher: two authorised contracts could slash the
        // same stake. DisputeV4 cannot open anything until authorised.
        //
        // The V3 guard in DisputeV4 is one-directional: V4 asks V3 whether it
        // already holds a call, and V3 has no reciprocal check. Until step 5
        // lands, V3 can still open a dispute on a call V4 escrowed, so this is a
        // hard ordering requirement, not a note.
        bool legacyStillSlashes = registry.authorizedSlashers(legacyDisputeAddress);
        if (legacyStillSlashes) {
            console2.log("");
            console2.log("!! ORDERING GATE: DisputeV3 is still an authorizedSlasher right now.");
            console2.log("   Run step 5 (revokeSlasher) BEFORE step 6 (authorizeSlasher). While both");
            console2.log("   contracts are authorized, a caller can open a second dispute on a call");
            console2.log("   DisputeV4 already escrowed, because V3 has no reciprocal guard.");
            console2.log("");
        }
        console2.log("5) cast send %s \\", _addr(address(registry)));
        console2.log("    \"revokeSlasher(address)\" %s", _addr(legacyDisputeAddress));
        console2.log(
            "   cast call %s \"authorizedSlashers(address)(bool)\" %s --rpc-url %s  # expect false",
            _addr(address(registry)),
            _addr(legacyDisputeAddress),
            rpc
        );
        console2.log("");
        console2.log("6) cast send %s \\", _addr(address(registry)));
        console2.log("    \"authorizeSlasher(address)\" %s", _addr(address(dispute)));
        console2.log(
            "   cast call %s \"authorizedSlashers(address)(bool)\" %s --rpc-url %s  # expect true",
            _addr(address(registry)),
            _addr(address(dispute)),
            rpc
        );
        console2.log("");

        // Step 7. Re-anchor the live zk-execution fixture claim on the new
        // registry. The proof is the 260-byte Groth16 seal from the GitHub
        // Actions artifact that produced
        // src/lib/verification/fixtures/zk-execution.json (seal.bin lives with
        // test/fixtures/zk-execution/).
        console2.log("7) cast send %s \\", reg);
        console2.log(
            "    \"anchor(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes)\" %s %s %s \\",
            FIXTURE_CALL_ID,
            kindZkExecution,
            FIXTURE_RESPONSE_HASH
        );
        console2.log(
            "    %s %s %s \\",
            FIXTURE_CLAIM_HASH,
            FIXTURE_STATEMENT_HASH,
            FIXTURE_ASSUMPTION_HASH
        );
        console2.log("    0x$(xxd -p test/fixtures/zk-execution/seal.bin)");
        console2.log("");
        console2.log(
            string.concat(
                "   read-back: cast call ", reg, " \"isAnchored(bytes32,bytes32,bytes32)(bool)\" ",
                FIXTURE_CALL_ID, " ", kindZkExecution, " ", FIXTURE_CLAIM_HASH, " --rpc-url ", rpc, "  # expect true"
            )
        );
        console2.log("");
    }

    function _requireSet(string memory label, address value) private pure {
        if (value == address(0)) {
            revert(string.concat("refusing to continue: env for ", label, " is missing or zero"));
        }
    }

    function _orNone(address value) private pure returns (string memory) {
        return value == address(0) ? "<not set>" : _addr(value);
    }

    function _addr(address value) private pure returns (string memory) {
        return vm.toString(value);
    }

    function _kind(bytes32 kind) private pure returns (string memory) {
        return vm.toString(kind);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

import { Risc0ExecutionAdapter } from "../contracts/zk/Risc0ExecutionAdapter.sol";
import { RiscZeroGroth16Verifier } from "risc0-ethereum/contracts/src/groth16/RiscZeroGroth16Verifier.sol";
import { ControlID } from "risc0-ethereum/contracts/src/groth16/ControlID.sol";

/// @title DeployZkExecution
/// @notice Deploys the pinned RISC Zero Groth16 verifier and the adapter that binds its
///         receipts to a CallGuard call. Wiring the adapter into `SLAEvidenceRegistry`
///         (`setProofVerifier`) and anchoring a claim are separate owner calls, done after
///         both addresses are known.
///
/// Usage (Arc Testnet), simulate first and broadcast only when the simulation is clean:
///
///   forge script script/DeployZkExecution.s.sol:DeployZkExecution \
///     --account owner --sender 0xOWNER --rpc-url arc_testnet
///   forge script script/DeployZkExecution.s.sol:DeployZkExecution \
///     --account owner --sender 0xOWNER --rpc-url arc_testnet --broadcast
///
/// Required env:
///   PAY_PER_CALL_V8         active PayPerCallV8 (0xedce61eF…a7EF)
///   ZK_EXECUTION_IMAGE_ID   the guest id the CI run printed, as 0x-prefixed bytes32
/// Optional env:
///   ZK_VERIFIER             reuse an already deployed verifier instead of deploying another
///
/// The verifier's control constants are not env vars on purpose: they come from the
/// vendored `ControlID` library at the pinned risc0-ethereum tag, so the deployed root of
/// trust is the one the repository committed rather than whatever an operator typed.
contract DeployZkExecution is Script {
    /// @dev `keccak256("callguard.handler.ping/1")`, the guest's own handler id.
    bytes32 internal constant HANDLER_ID = 0xc60c6f3bf0f8f833abad48f8abf4ed6861c7e7138115b0d567a72cdf9bfa84c7;

    function run() external returns (address verifier, address adapter) {
        address payPerCall = vm.envAddress("PAY_PER_CALL_V8");
        bytes32 imageId = vm.envBytes32("ZK_EXECUTION_IMAGE_ID");
        require(imageId != bytes32(0), "ZK_EXECUTION_IMAGE_ID is zero");
        // The verifier's address is a fixed input once it is deployed and its constants are the
        // vendored ones, so a redeploy of the adapter alone must not mint a second root of trust.
        address existingVerifier = vm.envOr("ZK_VERIFIER", address(0));

        console2.log("Deployer        :", msg.sender);
        console2.log("PayPerCallV8    :", payPerCall);
        console2.log("Handler id      :");
        console2.logBytes32(HANDLER_ID);
        console2.log("Image id        :");
        console2.logBytes32(imageId);

        vm.startBroadcast();

        if (existingVerifier == address(0)) {
            verifier = address(new RiscZeroGroth16Verifier(ControlID.CONTROL_ROOT, ControlID.BN254_CONTROL_ID));
            console2.log("Groth16Verifier :", verifier);
        } else {
            verifier = existingVerifier;
            console2.log("Reusing verifier:", verifier);
        }

        adapter = address(new Risc0ExecutionAdapter(verifier, payPerCall, imageId, HANDLER_ID));
        console2.log("ExecutionAdapter:", adapter);

        vm.stopBroadcast();
    }
}

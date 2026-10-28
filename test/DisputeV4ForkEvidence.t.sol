// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { DisputeV4 } from "../contracts/DisputeV4.sol";
import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";
import { PayPerCallV8 } from "../contracts/PayPerCallV8.sol";
import { IPayPerCallV8 } from "../contracts/interfaces/IPayPerCallV8.sol";
import { IDisputeV2 } from "../contracts/interfaces/IDisputeV2.sol";

/// @title The vier-kind evidence snapshot, read from the deployed contracts
/// @notice `test/DisputeV4.t.sol` builds the snapshot against mocks, which proves
///         the branching but not that the *deployed* registry answers the way the
///         branch expects. This fork test opens a real dispute on the live
///         `DisputeV4` and reads back the four rows it actually wrote.
///
///         One thing is simulated and only one: `legacyDispute.disputeIdByCallId`
///         is forced to zero, because the only call in this deployment that has
///         anchored claims is already disputed on V3, and V4 refuses that on
///         purpose (double-slash guard). Everything else — the registry, the
///         anchored claims, the adapter address, the stake, the USDC balances —
///         is real state at `FORK_BLOCK`.
///
///         So this is evidence about *the snapshot code against real claims*, not
///         about a dispute anyone can point at on the explorer. A real dispute
///         still needs a call with no V3 record.
contract DisputeV4ForkEvidenceTest is Test {
    // Pinned so the assertions describe one block, not whatever is latest.
    uint256 internal constant FORK_BLOCK = 69_498_000;
    string internal constant DEFAULT_RPC = "https://rpc.testnet.arc.io";

    address internal constant DISPUTE = 0xECDb019F1E92Ad35324cc7bBDf1D56b9e70B305B;
    address internal constant LEGACY_V3 = 0xEf9f21Ece9b4C58BCb76913887E4f4846Ec36Fec;
    address internal constant PAY_PER_CALL = 0xedce61eF5be31DC22cEfE342692622A26919a7EF;
    address internal constant REGISTRY = 0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3;
    address internal constant USDC = 0x3600000000000000000000000000000000000000;
    address internal constant OWNER = 0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da;
    address internal constant ADAPTER = 0x046d715D28143e45E38f1a1114A0462898630498;

    bytes32 internal constant CALL_ID = 0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265;
    bytes32 internal constant RESPONSE_HASH = 0x188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d;
    bytes32 internal constant WITNESS_CLAIM = 0x3e1dc9675007287b4fd1cb85351d59adee256375a64a3d984b454ce1a10b2514;
    bytes32 internal constant ZK_EXECUTION_CLAIM = 0xe3baff68e7c0299a4275cc3e7553fb27da16d1929fa47a5fe04ab7b58b9f419c;

    /// Arc's USDC is a native asset behind an ERC20 facade, and its `transferFrom`
    /// walks two system contracts Foundry cannot execute inside a fork: the blocklist
    /// reader at `0x1800…0001` and the native move at `0x1800…0000`, both of which
    /// fail with `StackUnderflow` here. So this test stubs exactly those two answers
    /// and says so, instead of asserting balance deltas that the stub cannot produce.
    /// The token movement itself is covered by `test/DisputeV4.t.sol` against
    /// `MockUSDC`, and by the real anchor and dispute transactions on Arc.
    address internal constant USDC_BLOCKLIST = 0x1800000000000000000000000000000000000001;
    address internal constant USDC_NATIVE_TRANSFER = 0x1800000000000000000000000000000000000000;
    bytes internal constant RETURNS_FALSE = hex"600060005260206000f3";

    bytes32 internal constant WITNESS = keccak256("witness");
    bytes32 internal constant TEE = keccak256("tee-attestation");
    bytes32 internal constant ZK_CONSTRAINT = keccak256("zk-constraint");
    bytes32 internal constant ZK_EXECUTION = keccak256("zk-execution");

    uint256 internal constant PROVIDER_ID = 1;

    DisputeV4 internal dispute;
    PayPerCallV8 internal payPerCall;
    IERC20 internal usdc;

    function setUp() public {
        string memory rpc = vm.envOr("ARC_RPC_URL", DEFAULT_RPC);
        try vm.createSelectFork(rpc, FORK_BLOCK) {}
        catch {
            vm.skip(true);
        }
        vm.etch(USDC_BLOCKLIST, RETURNS_FALSE);
        vm.mockCall(
            USDC_NATIVE_TRANSFER,
            abi.encodeWithSignature("transfer(address,address,uint256)"),
            abi.encode(true)
        );
        dispute = DisputeV4(DISPUTE);
        payPerCall = PayPerCallV8(PAY_PER_CALL);
        usdc = IERC20(USDC);
    }

    function test_snapshotBindsTwoKindsAndNamesTheOtherTwoReasons() public {
        // Prerequisites, read before anything is simulated: the call is Completed,
        // V4 has never seen a dispute, and the retiring V3 is what blocks it.
        IPayPerCallV8.Call memory call_ = payPerCall.getCall(CALL_ID);
        assertEq(uint8(call_.status), uint8(IPayPerCallV8.CallStatus.Completed), "call is not Completed");
        assertEq(call_.providerId, PROVIDER_ID, "provider mismatch");
        assertEq(call_.responseHash, RESPONSE_HASH, "response hash moved");
        assertEq(dispute.disputeCount(), 0, "V4 already has a dispute");
        assertEq(_legacyDisputeId(CALL_ID), 1, "expected the V3 guard to be the blocker");
        assertEq(dispute.disputeIdByCallId(CALL_ID), 0, "call already disputed on V4");

        // The one simulated read: pretend V3 never held this call.
        vm.mockCall(
            LEGACY_V3,
            abi.encodeWithSignature("disputeIdByCallId(bytes32)", CALL_ID),
            abi.encode(uint256(0))
        );
        assertEq(_legacyDisputeId(CALL_ID), 0, "legacy guard was not cleared");

        // Open the dispute as the call's own caller, with real USDC.
        uint256 stake = ServiceRegistryV8(REGISTRY).getProvider(PROVIDER_ID).stake;
        uint256 expectedSlash = (stake * dispute.disputeSlashBps()) / 10_000;
        uint256 bondAmount = dispute.disputeBond();

        vm.startPrank(OWNER);
        usdc.approve(DISPUTE, bondAmount);
        uint256 disputeId = dispute.openDispute(CALL_ID, PROVIDER_ID, "fork-snapshot-test");
        vm.stopPrank();

        assertEq(disputeId, 1, "first dispute id");

        // The escrow the contract will be bound by. The token movement behind these
        // two numbers is stubbed in this test (see `USDC_NATIVE_TRANSFER`), so what is
        // asserted here is the accounting, which is what a resolution reads later.
        assertEq(dispute.getDispute(disputeId).bond, bondAmount, "bond was not recorded at the bond amount");
        assertEq(dispute.heldSlash(disputeId), expectedSlash, "slash escrow differs from stake * bps");

        // The four rows, in the order `evidenceKinds()` stores them.
        DisputeV4.LinkedEvidence[] memory rows = dispute.evidenceOf(disputeId);
        assertEq(rows.length, 4, "one row per configured kind");

        _assertBound(rows[0], WITNESS, WITNESS_CLAIM);
        // `tee-attestation` has no verifier: the registry refuses before it reads a
        // proof, so the row says `NoVerifier` and its mode is 0.
        _assertAbsent(rows[1], TEE, DisputeV4.AbsentReason.NoVerifier, 0);
        // `zk-constraint` HAS a verifier (mode 2) but no claim on *this* registry —
        // its live anchor was made on `SLAEvidenceRegistry` v1 (`0x7d643B2b…`), which
        // `DisputeV4` does not read. So the row says `NoAnchor`, not `NoVerifier`. That
        // difference is the whole point of carrying the reason: one is the registry
        // refusing the kind, the other is nobody having anchored a claim here.
        _assertAbsent(rows[2], ZK_CONSTRAINT, DisputeV4.AbsentReason.NoAnchor, 2);
        _assertBound(rows[3], ZK_EXECUTION, ZK_EXECUTION_CLAIM);

        // Every bound row is bound to this call's response hash; that is the check
        // the dispute relies on and the reason a claim for another call cannot be
        // smuggled in.
        assertEq(rows[0].responseHash, RESPONSE_HASH, "witness row names another response");
        assertEq(rows[3].responseHash, RESPONSE_HASH, "zk-execution row names another response");

        // The witness row is the deployment recorded in AGENTS.md: proof mode, bound,
        // verified by the provenance adapter, and it says who witnessed.
        assertEq(rows[0].mode, 2, "witness mode");
        assertEq(rows[0].verifier, ADAPTER, "witness verifier is not the provenance adapter");
        assertEq(rows[0].anchoredAt, 1_793_188_858, "witness anchor timestamp");

        // A snapshot is a reading, never an input: the bond and the slash are the
        // same numbers whether or not any claim was bound.
        IDisputeV2.DisputeRecord memory record = dispute.getDispute(disputeId);
        assertEq(record.bond, bondAmount, "snapshot changed the bond");
        assertEq(uint8(record.status), uint8(IDisputeV2.Status.Pending), "snapshot changed the status");
    }

    function test_everyUnboundRowNamesTheCheckThatFailed() public {
        // `bound` and `reason` must never both be quiet: a reader who sees an unbound
        // row has to learn whether nobody anchored, the registry refused the kind, or
        // the claim belongs to another response.
        vm.mockCall(
            LEGACY_V3,
            abi.encodeWithSignature("disputeIdByCallId(bytes32)", CALL_ID),
            abi.encode(uint256(0))
        );
        vm.startPrank(OWNER);
        usdc.approve(DISPUTE, dispute.disputeBond());
        uint256 disputeId = dispute.openDispute(CALL_ID, PROVIDER_ID, "fork-snapshot-test");
        vm.stopPrank();

        DisputeV4.LinkedEvidence[] memory rows = dispute.evidenceOf(disputeId);
        // `reason` is `None` exactly when `bound` is true; any unbound row must name
        // the check that failed, or a reader cannot tell an omission from a refusal.
        for (uint256 i = 0; i < rows.length; ++i) {
            if (rows[i].bound) {
                assertEq(uint8(rows[i].reason), uint8(DisputeV4.AbsentReason.None), "bound row carries a reason");
            } else {
                assertTrue(uint8(rows[i].reason) != 0, "unbound row names no reason");
                assertEq(rows[i].claimHash, bytes32(0), "unbound row carries a claim");
            }
        }
    }

    function _assertBound(DisputeV4.LinkedEvidence memory row, bytes32 kind, bytes32 expectedClaim) internal pure {
        assertEq(row.kind, kind, "row kind");
        assertTrue(row.present, "row is not present");
        assertTrue(row.bound, "row is not bound");
        assertEq(uint8(row.reason), uint8(DisputeV4.AbsentReason.None), "bound row carries a reason");
        assertEq(row.mode, 2, "bound row is not in proof mode");
        assertTrue(row.claimHash != bytes32(0), "row has no claim hash");
        assertTrue(row.statementHash != bytes32(0), "row has no statement hash");
        if (expectedClaim != bytes32(0)) {
            assertEq(row.claimHash, expectedClaim, "claim hash moved");
        }
    }

    function _assertAbsent(
        DisputeV4.LinkedEvidence memory row,
        bytes32 kind,
        DisputeV4.AbsentReason reason,
        uint8 expectedMode
    ) internal pure {
        assertEq(row.kind, kind, "row kind");
        assertFalse(row.present, "absent row reports a claim");
        assertFalse(row.bound, "absent row is bound");
        assertEq(uint8(row.reason), uint8(reason), "absent reason");
        assertEq(row.mode, expectedMode, "absent row reports another mode");
        assertEq(row.claimHash, bytes32(0), "absent row carries a claim");
        assertEq(row.anchoredAt, 0, "absent row carries a timestamp");
    }

    function _legacyDisputeId(bytes32 callId) internal view returns (uint256) {
        (bool ok, bytes memory data) =
            LEGACY_V3.staticcall(abi.encodeWithSignature("disputeIdByCallId(bytes32)", callId));
        if (!ok) return type(uint256).max;
        return abi.decode(data, (uint256));
    }
}

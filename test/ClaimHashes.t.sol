// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

/// @notice Solidity twin of `tests/verification/claim-hashes.test.ts`: both files
///         pin the same two constants, computed from the committed fixture
///         `src/lib/verification/fixtures/zk-execution.json` by the same
///         predicates an attestor uses (`keccak256(bytes(s))`,
///         `keccak256(abi.encode(string[]))`). Editing one, edit the other — a
///         drift in either language must fail in both test suites.
contract ClaimHashesTest is Test {
    string constant STATEMENT =
        "A guest program with the published image id ran on a private request whose keccak256 is the call's committed requestHash and committed this responseHash for this callId";
    string constant ASSUMPTION_0 = "the on-chain Groth16 verifier bytecode is the published risc0-ethereum v3.0.1 verifier";
    string constant ASSUMPTION_1 = "the committed responseHash is the provider's own receipt commitment, not a value the prover chose";
    string constant ASSUMPTION_2 = "the call's requestHash was read from PayPerCallV8.getCall and is the request the provider committed to";

    function test_statementAndAssumptionHashesMatchTheTypeScriptConstants() public pure {
        assertEq(
            keccak256(bytes(STATEMENT)),
            0xf638c765d435690aa9da23cf4ab8d3e58f5b29ea8f7ee90d85829f583cd510f9,
            "statement hash drifted from the TypeScript twin"
        );
        string[] memory assumptions = new string[](3);
        assumptions[0] = ASSUMPTION_0;
        assumptions[1] = ASSUMPTION_1;
        assumptions[2] = ASSUMPTION_2;
        assertEq(
            keccak256(abi.encode(assumptions)),
            0xa007194563d9649410719f9f3ba3daf8a8ccefb11c70a25d51be40753d91fef9,
            "assumption hash drifted from the TypeScript twin"
        );
    }
}

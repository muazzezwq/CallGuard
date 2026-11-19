// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { PayPerCallV8 } from "../contracts/PayPerCallV8.sol";
import { IServiceRegistryV8 } from "../contracts/interfaces/IServiceRegistryV8.sol";
import { IPayPerCallV8 } from "../contracts/interfaces/IPayPerCallV8.sol";
import { ISLAKeeper } from "../contracts/interfaces/ISLAKeeper.sol";

/// @title The timeout-claim path against the live 13 Nov deployment
/// @notice The live stack has no funded test wallet, so `claimTimeout` has never
///         been broadcast there. What can be shown without a key is that the
///         deployed bytecode and the deployed provider terms produce the split
///         the documentation promises: escrow refunded to the caller, slash
///         minus the keeper bounty also to the caller, bounty to whoever claimed.
///         This forks Arc's head, opens a real call through `PayPerCallV8`, warps
///         past `deadline + SUBMIT_GRACE` and claims.
///
///         Two things are simulated, and the test says which: USDC movement is
///         mocked because the token facade on Arc forwards to a native balance
///         this fork cannot mint, and no receipt is submitted — that absence is
///         the whole point. `claimTimeout` only credits `claimable`, so every
///         number asserted below is written by the live contract.
///
///         `ARC_RPC_URL=https://rpc.testnet.arc.io forge test --match-path test/LiveTimeoutClaimFork.t.sol`
contract LiveTimeoutClaimFork is Test {
    address internal constant REGISTRY = 0x21E073030Bdb226Fb69E2f7ABE233c33A7b0ddC9;
    address internal constant PAY_PER_CALL = 0xA40623c2C8A39ae55AE3fEa47f85cF89Dc7F5491;
    address internal constant KEEPER_CONTRACT = 0xc1028E084Fad5Ab08C30BbF2b062683da6f0b280;
    address internal constant USDC = 0x3600000000000000000000000000000000000000;

    /// @dev Arc's USDC forwards to the native gas token; the fork cannot mint it.
    address internal constant USDC_NATIVE_TRANSFER = 0x1800000000000000000000000000000000000000;
    address internal constant USDC_BLOCKLIST = 0x1800000000000000000000000000000000000001;
    bytes internal constant RETURNS_FALSE = hex"600060005260206000f3";

    uint256 internal constant PROVIDER_ID = 1;
    address internal constant CALLER = address(0xC0FFEE);
    address internal constant KEEPER = address(0xBEEF);

    PayPerCallV8 internal ppc;
    IServiceRegistryV8 internal registry;

    function setUp() public {
        string memory rpc = vm.envOr("ARC_RPC_URL", string(""));
        if (bytes(rpc).length == 0) vm.skip(true);
        try vm.createSelectFork(rpc) {} catch {
            vm.skip(true);
        }
        vm.etch(USDC_BLOCKLIST, RETURNS_FALSE);
        // Route both movements the test performs through a stub: escrow in
        // (`transferFrom`) and credit out (`transfer`). Nothing else in this
        // path touches the token, and the numbers asserted are contract state.
        vm.mockCall(USDC, abi.encodeWithSignature("transfer(address,uint256)"), abi.encode(true));
        vm.mockCall(
            USDC,
            abi.encodeWithSignature("transferFrom(address,address,uint256)"),
            abi.encode(true)
        );
        vm.mockCall(
            USDC_NATIVE_TRANSFER,
            abi.encodeWithSignature("transfer(address,address,uint256)"),
            abi.encode(true)
        );
        ppc = PayPerCallV8(PAY_PER_CALL);
        registry = IServiceRegistryV8(REGISTRY);
    }

    function test_timeoutClaimSplitsEscrowAndSlashAsDocumented() public {
        IServiceRegistryV8.ProviderView memory before_ = registry.getProvider(PROVIDER_ID);
        assertTrue(before_.active, "provider 1 is not active on the live registry");
        IServiceRegistryV8.SLATerms memory terms = registry.getTerms(PROVIDER_ID, before_.latestTermsVersion);

        vm.prank(CALLER);
        bytes32 callId = ppc.callService(PROVIDER_ID, keccak256("live-timeout-drill"));

        IPayPerCallV8.Call memory opened = ppc.getCall(callId);
        assertEq(uint8(opened.status), uint8(IPayPerCallV8.CallStatus.Pending), "call did not open");
        assertEq(opened.caller, CALLER, "caller not recorded");
        assertEq(opened.amount, before_.pricePerCall, "escrow is not the price");
        assertEq(registry.getProvider(PROVIDER_ID).pendingCalls, before_.pendingCalls + 1, "pending counter");

        // One second past the published window plus the grace period.
        vm.warp(uint256(opened.deadline) + ppc.SUBMIT_GRACE() + 1);

        // Too early by exactly one second on a second call, to prove the boundary.
        vm.prank(CALLER);
        bytes32 earlyId = ppc.callService(PROVIDER_ID, keccak256("live-timeout-boundary"));
        vm.warp(uint256(ppc.getCall(earlyId).deadline) + ppc.SUBMIT_GRACE());
        vm.expectRevert(PayPerCallV8.DeadlineNotReached.selector);
        ppc.claimTimeout(earlyId);
        vm.warp(uint256(opened.deadline) + ppc.SUBMIT_GRACE() + 1);

        uint256 stakeBefore = registry.getProvider(PROVIDER_ID).stake;
        uint256 expectedSlash = (stakeBefore * terms.slashBps) / 10_000;
        uint256 expectedBounty = (expectedSlash * ppc.keeperBountyBps()) / 10_000;

        vm.prank(KEEPER);
        (uint256 refunded, uint256 slashed, uint256 bounty) = ppc.claimTimeout(callId);

        assertEq(refunded, opened.amount, "refund is not the escrow");
        assertEq(slashed, expectedSlash - expectedBounty, "slash split does not match terms");
        assertEq(bounty, expectedBounty, "bounty does not match keeperBountyBps");

        IPayPerCallV8.Call memory claimed = ppc.getCall(callId);
        assertEq(uint8(claimed.status), uint8(IPayPerCallV8.CallStatus.Slashed), "status is not Slashed");
        assertEq(ppc.claimable(CALLER), refunded + slashed, "caller credit");
        assertEq(ppc.claimable(KEEPER), bounty, "keeper credit");

        IServiceRegistryV8.ProviderView memory after_ = registry.getProvider(PROVIDER_ID);
        assertEq(after_.stake, stakeBefore - expectedSlash, "stake did not lose the slash");
        assertEq(after_.slashedCalls, before_.slashedCalls + 1, "slashed counter");
        assertEq(after_.pendingCalls, before_.pendingCalls + 1, "only the boundary call is still pending");

        // The credit is withdrawn by its owner, and a second claim cannot replay it.
        vm.prank(KEEPER);
        ppc.claim();
        assertEq(ppc.claimable(KEEPER), 0, "keeper claim did not clear");
        vm.expectRevert(PayPerCallV8.NothingToClaim.selector);
        ppc.claim();

        vm.expectRevert(PayPerCallV8.InvalidStatus.selector);
        ppc.claimTimeout(callId);
    }

    function test_keeperContractBatchClaimsAndHoldsTheBountyForItsCaller() public {
        IServiceRegistryV8.ProviderView memory before_ = registry.getProvider(PROVIDER_ID);
        IServiceRegistryV8.SLATerms memory terms = registry.getTerms(PROVIDER_ID, before_.latestTermsVersion);

        vm.prank(CALLER);
        bytes32 callId = ppc.callService(PROVIDER_ID, keccak256("live-timeout-through-keeper"));
        vm.warp(uint256(ppc.getCall(callId).deadline) + ppc.SUBMIT_GRACE() + 1);

        uint256 stakeBefore = registry.getProvider(PROVIDER_ID).stake;
        uint256 expectedSlash = (stakeBefore * terms.slashBps) / 10_000;
        uint256 expectedBounty = (expectedSlash * ppc.keeperBountyBps()) / 10_000;

        bytes32[] memory batch = new bytes32[](1);
        batch[0] = callId;

        address operator = address(0xCAFE);
        vm.prank(operator);
        ISLAKeeper(KEEPER_CONTRACT).claimBatch(batch);

        // The keeper contract pulled its own bounty out of PayPerCall and owes it
        // to the operator that called it; the caller's credit stays on PayPerCall.
        assertEq(ISLAKeeper(KEEPER_CONTRACT).bountyClaimable(operator), expectedBounty, "keeper credit");
        assertEq(ppc.claimable(KEEPER_CONTRACT), 0, "keeper left its bounty on PayPerCall");
        assertEq(ppc.claimable(CALLER), ppc.getCall(callId).amount + expectedSlash - expectedBounty, "caller credit");
        assertEq(uint8(ppc.getCall(callId).status), uint8(IPayPerCallV8.CallStatus.Slashed), "status");

        vm.prank(operator);
        ISLAKeeper(KEEPER_CONTRACT).withdrawBounty();
        assertEq(ISLAKeeper(KEEPER_CONTRACT).bountyClaimable(operator), 0, "withdraw did not clear");
    }
}

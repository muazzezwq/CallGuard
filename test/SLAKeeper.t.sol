// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ServiceRegistryV8 } from "../contracts/ServiceRegistryV8.sol";
import { PayPerCallV8 } from "../contracts/PayPerCallV8.sol";
import { IPayPerCallV8 } from "../contracts/interfaces/IPayPerCallV8.sol";
import { SLAKeeper } from "../contracts/SLAKeeper.sol";
import { MockUSDC } from "./helpers/MockUSDC.sol";

contract SLAKeeperTest is Test {
    MockUSDC internal usdc;
    ServiceRegistryV8 internal registry;
    PayPerCallV8 internal payPerCall;
    SLAKeeper internal keeper;

    address internal admin = address(0xA11CE);
    address internal provider = address(0xB0B);
    address internal caller = address(0xC0FFEE);
    address internal keeperEoa = address(0xCAFE);

    uint256 internal signerPk = 0xA11CE_BEEF;
    address internal signerAddr;

    uint256 internal constant MIN_STAKE = 10e6;
    uint256 internal constant STAKE = 100e6;
    uint256 internal constant PRICE = 1e6;
    uint32 internal constant MAX_RESP = 30;
    uint16 internal constant SLASH_BPS = 2_000;
    bytes32 internal constant TERMS_HASH = keccak256("terms-v1");

    uint256 internal providerId;

    function setUp() public {
        signerAddr = vm.addr(signerPk);

        vm.startPrank(admin);
        usdc = new MockUSDC();
        registry = new ServiceRegistryV8(IERC20(address(usdc)), MIN_STAKE, admin);
        payPerCall = new PayPerCallV8(IERC20(address(usdc)), registry);
        keeper = new SLAKeeper(payPerCall, IERC20(address(usdc)));
        registry.setPayPerCall(address(payPerCall));
        vm.stopPrank();

        usdc.mint(provider, 1_000e6);
        usdc.mint(caller, 1_000e6);

        vm.prank(provider);
        usdc.approve(address(registry), type(uint256).max);
        vm.prank(caller);
        usdc.approve(address(payPerCall), type(uint256).max);

        vm.prank(provider);
        providerId = registry.register(
            signerAddr,
            STAKE,
            PRICE,
            MAX_RESP,
            SLASH_BPS,
            9_950,
            0,
            "https://api.example",
            TERMS_HASH,
            "ipfs://terms-v1"
        );
    }

    function test_isClaimable_onlyAfterGrace() public {
        bytes32 callId = _call();

        assertFalse(keeper.isClaimable(callId));

        skip(MAX_RESP + payPerCall.SUBMIT_GRACE() + 1);

        assertTrue(keeper.isClaimable(callId));
    }

    function test_isClaimable_falseForCompletedCall() public {
        bytes32 callId = _call();
        bytes32 responseHash = keccak256("response");
        uint64 respondedAt = uint64(block.timestamp);
        bytes memory sig = _sign(callId, responseHash, respondedAt, 1);

        vm.prank(provider);
        payPerCall.submitReceipt(callId, responseHash, respondedAt, 1, sig);

        skip(MAX_RESP + payPerCall.SUBMIT_GRACE() + 1);

        assertFalse(keeper.isClaimable(callId));
    }

    function test_claim_creditsCallerAndKeeperBounty() public {
        bytes32 callId = _call();
        skip(MAX_RESP + payPerCall.SUBMIT_GRACE() + 1);

        vm.prank(keeperEoa);
        (uint256 refunded, uint256 slashed, uint256 bounty) = keeper.claim(callId);

        assertEq(refunded, PRICE);
        assertEq(slashed, 19e6);
        assertEq(bounty, 1e6);
        assertEq(payPerCall.claimable(caller), 20e6);
        assertEq(keeper.bountyClaimable(keeperEoa), 1e6);
        assertEq(usdc.balanceOf(address(keeper)), 1e6);
        assertEq(payPerCall.claimable(address(keeper)), 0);
    }

    function test_withdrawBounty_transfersToKeeper() public {
        bytes32 callId = _call();
        skip(MAX_RESP + payPerCall.SUBMIT_GRACE() + 1);

        vm.prank(keeperEoa);
        keeper.claim(callId);

        uint256 before = usdc.balanceOf(keeperEoa);
        vm.prank(keeperEoa);
        keeper.withdrawBounty();

        assertEq(usdc.balanceOf(keeperEoa), before + 1e6);
        assertEq(keeper.bountyClaimable(keeperEoa), 0);
        assertEq(usdc.balanceOf(address(keeper)), 0);
    }

    function test_claimBatch_claimsBothAndTracksBounties() public {
        bytes32 first = _call();
        bytes32 second = _call();
        skip(MAX_RESP + payPerCall.SUBMIT_GRACE() + 1);

        bytes32[] memory ids = new bytes32[](2);
        ids[0] = first;
        ids[1] = second;

        vm.prank(keeperEoa);
        (uint256[] memory refunded, uint256[] memory slashed, uint256[] memory bounties) = keeper.claimBatch(ids);

        assertEq(refunded[0], PRICE);
        assertEq(refunded[1], PRICE);
        assertEq(slashed[0], 19e6);
        assertEq(slashed[1], 15.2e6);
        assertEq(bounties[0], 1e6);
        assertEq(bounties[1], 0.8e6);
        assertEq(keeper.bountyClaimable(keeperEoa), 1.8e6);
        assertEq(usdc.balanceOf(address(keeper)), 1.8e6);
        assertEq(payPerCall.claimable(caller), 36.2e6);
    }

    function test_claimBatch_skipsNonClaimableCall() public {
        bytes32 first = _call();
        bytes32 second = _call();
        bytes32 responseHash = keccak256("response");
        uint64 respondedAt = uint64(block.timestamp);
        bytes memory sig = _sign(first, responseHash, respondedAt, 1);

        vm.prank(provider);
        payPerCall.submitReceipt(first, responseHash, respondedAt, 1, sig);

        skip(MAX_RESP + payPerCall.SUBMIT_GRACE() + 1);

        bytes32[] memory ids = new bytes32[](2);
        ids[0] = first;
        ids[1] = second;

        vm.prank(keeperEoa);
        (uint256[] memory refunded,, uint256[] memory bounties) = keeper.claimBatch(ids);

        assertEq(refunded[0], 0);
        assertEq(refunded[1], PRICE);
        assertEq(bounties[0], 0);
        assertEq(bounties[1], 1e6);
        assertEq(keeper.bountyClaimable(keeperEoa), 1e6);
    }

    function test_claim_beforeGrace_reverts() public {
        bytes32 callId = _call();

        vm.expectRevert(PayPerCallV8.DeadlineNotReached.selector);
        vm.prank(keeperEoa);
        keeper.claim(callId);
    }

    function test_withdrawBounty_nothing_reverts() public {
        vm.expectRevert(SLAKeeper.NothingToWithdraw.selector);
        vm.prank(keeperEoa);
        keeper.withdrawBounty();
    }

    function test_bountyParamsMatchPayPerCall() public view {
        assertEq(keeper.bountyBps(), payPerCall.keeperBountyBps());
        assertEq(keeper.maxBounty(), payPerCall.MAX_KEEPER_BOUNTY());
    }

    function _call() internal returns (bytes32 callId) {
        vm.prank(caller);
        callId = payPerCall.callService(providerId, keccak256("request"));
    }

    function _sign(bytes32 callId, bytes32 responseHash, uint64 respondedAt, uint32 termsVersion)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = payPerCall.hashReceipt(
            IPayPerCallV8.Receipt({
                callId: callId,
                responseHash: responseHash,
                respondedAt: respondedAt,
                termsVersion: termsVersion
            })
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        return abi.encodePacked(r, s, v);
    }
}

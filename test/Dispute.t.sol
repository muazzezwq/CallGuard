// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Dispute } from "../contracts/Dispute.sol";
import { MockUSDC } from "./helpers/MockUSDC.sol";

// ---------------------------------------------------------------------------
// Mocks matching the ABI Dispute.sol expects from ServiceRegistry + PayPerCall.
// ---------------------------------------------------------------------------

contract MockRegistryForDispute {
    struct ProviderView {
        address owner;
        address signer;
        uint256 stake;
        uint256 pricePerCall;
        uint32 maxResponseTime;
        uint32 slashBps;
        bool active;
        uint32 maxConcurrentCalls;
        uint8 zkTier;
    }

    IERC20 internal _usdc;
    mapping(uint256 => ProviderView) internal _p;
    uint256 public lastSlashAmount;
    address public lastSlashRecipient;

    constructor(address usdc_) {
        _usdc = IERC20(usdc_);
    }

    function setProvider(uint256 id, address owner_, uint256 stake_, bool active_) external {
        _p[id] = ProviderView(owner_, address(0), stake_, 0, 30, 1_000, active_, 10, 0);
    }

    function getProvider(uint256 id) external view returns (ProviderView memory) {
        return _p[id];
    }

    function slash(uint256 id, uint256 amount, address recipient) external {
        _p[id].stake -= amount;
        lastSlashAmount = amount;
        lastSlashRecipient = recipient;
        _usdc.transfer(recipient, amount);
    }
}

contract MockPayPerCall {
    // Must mirror Dispute.IPayPerCall.Call field order exactly.
    struct Call {
        uint256 providerId;
        address caller;
        uint256 amount;
        uint32 startedAt;
        uint32 deadline;
        bytes32 requestHash;
        bytes32 responseHash;
        uint8 status; // 0 None, 1 Pending, 2 Completed, 3 Slashed
    }

    mapping(bytes32 => Call) internal _calls;

    function setCall(bytes32 id, uint256 providerId, address caller, uint32 startedAt, uint8 status) external {
        _calls[id] = Call(providerId, caller, 1_000e6, startedAt, startedAt + 60, bytes32(0), bytes32(0), status);
    }

    function getCall(bytes32 id) external view returns (Call memory) {
        return _calls[id];
    }
}

contract DisputeTest is Test {
    MockUSDC internal usdc;
    MockRegistryForDispute internal registry;
    MockPayPerCall internal ppc;
    Dispute internal dispute;

    address internal arbiter = makeAddr("arbiter");
    address internal treasury = makeAddr("treasury");
    address internal caller_ = makeAddr("caller");
    address internal providerOwner = makeAddr("providerOwner");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant PROVIDER_ID = 1;
    uint256 internal constant PROVIDER_STAKE = 200e6;
    uint256 internal constant DISPUTE_BOND = 10e6;
    uint32 internal constant DISPUTE_WINDOW = 7 days;
    uint16 internal constant SLASH_BPS = 1_000;

    bytes32 internal constant CALL_ID = keccak256("call-001");
    uint64 internal settledAt;
    uint32 internal startedAt;

    function setUp() public {
        vm.warp(1_000_000); // deterministic clock (default block.timestamp is 1)
        usdc = new MockUSDC();
        registry = new MockRegistryForDispute(address(usdc));
        registry.setProvider(PROVIDER_ID, providerOwner, PROVIDER_STAKE, true);
        usdc.mint(address(registry), PROVIDER_STAKE); // fund slash payouts

        ppc = new MockPayPerCall();
        dispute = new Dispute(
            address(usdc), address(registry), arbiter, treasury, DISPUTE_BOND, DISPUTE_WINDOW, SLASH_BPS
        );

        vm.prank(arbiter);
        dispute.setPayPerCall(address(ppc));

        usdc.mint(caller_, 100e6);
        vm.prank(caller_);
        usdc.approve(address(dispute), type(uint256).max);

        // A settled call, 1 second ago, started 100s before that.
        settledAt = uint64(block.timestamp - 1);
        startedAt = uint32(block.timestamp - 101);
        ppc.setCall(CALL_ID, PROVIDER_ID, caller_, startedAt, 2 /* Completed */);
    }

    function _open() internal returns (uint256) {
        vm.prank(caller_);
        dispute.openDispute(CALL_ID, PROVIDER_ID, settledAt, "ipfs://evidence");
        return dispute.disputeCount();
    }

    // -----------------------------------------------------------------------

    function test_setPayPerCall_onlyArbiterOnce() public {
        Dispute d2 = new Dispute(
            address(usdc), address(registry), arbiter, treasury, DISPUTE_BOND, DISPUTE_WINDOW, SLASH_BPS
        );

        vm.prank(stranger);
        vm.expectRevert(Dispute.NotArbiter.selector);
        d2.setPayPerCall(address(ppc));

        vm.prank(arbiter);
        d2.setPayPerCall(address(ppc));
        assertEq(d2.payPerCall(), address(ppc));

        vm.prank(arbiter);
        vm.expectRevert(Dispute.PayPerCallAlreadySet.selector);
        d2.setPayPerCall(address(ppc));
    }

    function test_openDispute_requiresConfiguredPpc() public {
        Dispute d2 = new Dispute(
            address(usdc), address(registry), arbiter, treasury, DISPUTE_BOND, DISPUTE_WINDOW, SLASH_BPS
        );
        vm.prank(caller_);
        vm.expectRevert(Dispute.PayPerCallNotConfigured.selector);
        d2.openDispute(CALL_ID, PROVIDER_ID, settledAt, "ipfs://evidence");
    }

    function test_openDispute_success_locksBond() public {
        uint256 id = _open();

        assertEq(id, 1, "dispute id");
        assertEq(dispute.disputeIdByCallId(CALL_ID), id, "callId indexed");
        assertEq(usdc.balanceOf(address(dispute)), DISPUTE_BOND, "bond locked");

        Dispute.DisputeRecord memory d = dispute.getDispute(id);
        assertEq(d.caller, caller_);
        assertEq(d.providerId, PROVIDER_ID);
        assertEq(d.bond, DISPUTE_BOND);
    }

    function test_openDispute_notSettled_reverts() public {
        ppc.setCall(CALL_ID, PROVIDER_ID, caller_, startedAt, 1 /* Pending */);
        vm.prank(caller_);
        vm.expectRevert(Dispute.CallNotSettled.selector);
        dispute.openDispute(CALL_ID, PROVIDER_ID, settledAt, "ipfs://evidence");
    }

    function test_openDispute_unknownCall_reverts() public {
        vm.prank(caller_);
        vm.expectRevert(Dispute.CallNotSettled.selector);
        dispute.openDispute(keccak256("nonexistent"), PROVIDER_ID, settledAt, "ipfs://evidence");
    }

    function test_openDispute_notCallCaller_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(Dispute.NotCallCaller.selector);
        dispute.openDispute(CALL_ID, PROVIDER_ID, settledAt, "ipfs://evidence");
    }

    function test_openDispute_providerMismatch_reverts() public {
        vm.prank(caller_);
        vm.expectRevert(Dispute.ProviderMismatch.selector);
        dispute.openDispute(CALL_ID, PROVIDER_ID + 1, settledAt, "ipfs://evidence");
    }

    function test_openDispute_settledBeforeStart_reverts() public {
        // startedAt in the future relative to settledAt → binding rejects it.
        ppc.setCall(CALL_ID, PROVIDER_ID, caller_, uint32(settledAt + 10), 2);
        vm.prank(caller_);
        vm.expectRevert(Dispute.WindowNotStarted.selector);
        dispute.openDispute(CALL_ID, PROVIDER_ID, settledAt, "ipfs://evidence");
    }

    function test_openDispute_windowClosed_reverts() public {
        uint64 old = uint64(block.timestamp - DISPUTE_WINDOW - 10);
        ppc.setCall(CALL_ID, PROVIDER_ID, caller_, uint32(old - 10), 2);
        vm.prank(caller_);
        vm.expectRevert(Dispute.WindowClosed.selector);
        dispute.openDispute(CALL_ID, PROVIDER_ID, old, "ipfs://evidence");
    }

    function test_openDispute_twice_reverts() public {
        _open();
        vm.prank(caller_);
        vm.expectRevert(Dispute.AlreadyDisputed.selector);
        dispute.openDispute(CALL_ID, PROVIDER_ID, settledAt, "ipfs://evidence");
    }

    function test_resolve_upheld_returnsBondAndSlashesProvider() public {
        uint256 id = _open();
        uint256 callerBefore = usdc.balanceOf(caller_);
        uint256 expectedSlash = PROVIDER_STAKE * SLASH_BPS / 10_000;

        vm.prank(arbiter);
        dispute.resolve(id, true);

        // Caller gets the returned bond AND the slashed stake.
        assertEq(usdc.balanceOf(caller_), callerBefore + DISPUTE_BOND + expectedSlash, "bond + slash to caller");
        assertEq(registry.lastSlashAmount(), expectedSlash, "provider slashed");
        assertEq(registry.lastSlashRecipient(), caller_, "slash goes to caller");
    }

    function test_resolve_rejected_forfeitsBondToTreasury() public {
        uint256 id = _open();
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(arbiter);
        dispute.resolve(id, false);

        assertEq(usdc.balanceOf(treasury), treasuryBefore + DISPUTE_BOND, "bond forfeited to treasury");
        assertEq(registry.lastSlashAmount(), 0, "no slash on rejection");
    }
}

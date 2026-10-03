// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { DisputeQuality } from "../contracts/DisputeQuality.sol";
import { ServiceRegistry } from "../contracts/ServiceRegistry.sol";
import { IServiceRegistry } from "../contracts/interfaces/IServiceRegistry.sol";
import { MockUSDC } from "./helpers/MockUSDC.sol";

// ---------------------------------------------------------------------------
// Minimal mock registry — lets us control getProvider() and slash() freely
// without the onlyPayPerCall gate on the real ServiceRegistry.
// ---------------------------------------------------------------------------
contract MockRegistry is IServiceRegistry {
    struct ProviderData {
        address owner;
        uint256 stake;
        bool active;
    }

    mapping(uint256 => ProviderData) internal _providerData;
    // mirrors DisputeQuality's IServiceRegistryStake surface
    mapping(address => uint256) public providerIdOf;

    uint256 public lastSlashedId;
    uint256 public lastSlashedAmt;
    address public lastSlashRecipient;

    IERC20 internal _usdc;

    constructor(address usdc_) {
        _usdc = IERC20(usdc_);
    }

    function setProvider(uint256 id, address owner_, uint256 stake_, bool active_) external {
        _providerData[id] = ProviderData({ owner: owner_, stake: stake_, active: active_ });
    }

    function setProviderIdOf(address owner_, uint256 id) external {
        providerIdOf[owner_] = id;
    }

    function getProviderStake(uint256 id) external view returns (uint256) {
        return _providerData[id].stake;
    }

    // IServiceRegistry
    function getProvider(uint256 providerId) external view override returns (ProviderView memory v) {
        ProviderData memory p = _providerData[providerId];
        v.owner = p.owner;
        v.stake = p.stake;
        v.active = p.active;
        v.signer = address(0);
        v.pricePerCall = 0;
        v.maxResponseTime = 30;
        v.slashBps = 1000;
    }

    /// Transfers slashAmount from registry's USDC balance to recipient,
    /// so the DisputeQuality contract can distribute spoils.
    function slash(uint256 providerId, uint256 amount, address recipient) external override {
        lastSlashedId = providerId;
        lastSlashedAmt = amount;
        lastSlashRecipient = recipient;
        _providerData[providerId].stake -= amount;
        _usdc.transfer(recipient, amount);
    }

    function markCallStarted(uint256) external override {}
    function markCallFinished(uint256) external override {}
    function incCompleted(uint256) external override {}
    function incSlashed(uint256) external override {}
}

// ---------------------------------------------------------------------------
// Main test contract
// ---------------------------------------------------------------------------
contract DisputeQualityTest is Test {
    // ── actors ──────────────────────────────────────────────────────────────
    address internal admin    = makeAddr("admin");
    address internal caller_  = makeAddr("caller");
    address internal provider1Owner = makeAddr("provider1Owner");
    address internal voter1   = makeAddr("voter1");
    address internal voter2   = makeAddr("voter2");
    address internal voter3   = makeAddr("voter3");
    address internal stranger = makeAddr("stranger");

    // ── contracts ───────────────────────────────────────────────────────────
    MockUSDC        internal usdc;
    MockRegistry    internal registry;
    DisputeQuality  internal dq;

    // ── constants ───────────────────────────────────────────────────────────
    uint256 internal constant DISPUTE_BOND   = 10e6;   // 10 USDC
    uint256 internal constant VOTER_BOND     = 5e6;    // 5  USDC
    uint256 internal constant MIN_VOTER_STAKE = 50e6;  // 50 USDC
    uint32  internal constant DISPUTE_WINDOW = 7 days;
    uint32  internal constant VOTING_WINDOW  = 3 days;
    uint16  internal constant SLASH_BPS      = 1_000;  // 10%

    uint256 internal constant PROVIDER_ID    = 1;
    uint256 internal constant PROVIDER_STAKE = 200e6; // 200 USDC

    // ── helpers ─────────────────────────────────────────────────────────────
    uint64  internal settledAt;   // timestamp a "call" settled at
    bytes32 internal callId = keccak256("call-001");

    // ── setUp ────────────────────────────────────────────────────────────────

    function setUp() public {
        // 1. Deploy mock USDC and fund participants.
        usdc = new MockUSDC();

        usdc.mint(caller_,       500e6);
        usdc.mint(voter1,        500e6);
        usdc.mint(voter2,        500e6);
        usdc.mint(voter3,        500e6);

        // 2. Deploy mock registry with provider1 registered.
        registry = new MockRegistry(address(usdc));
        registry.setProvider(PROVIDER_ID, provider1Owner, PROVIDER_STAKE, true);

        // Seed the registry contract with USDC so slash() can transfer out.
        usdc.mint(address(registry), PROVIDER_STAKE);

        // Wire up voter providerIds so _voterStake() resolves them.
        // Each voter is themselves a "provider" with enough stake.
        uint256 v1Id = 10;
        uint256 v2Id = 11;
        uint256 v3Id = 12;
        registry.setProviderIdOf(voter1, v1Id);
        registry.setProviderIdOf(voter2, v2Id);
        registry.setProviderIdOf(voter3, v3Id);
        registry.setProvider(v1Id, voter1, 100e6, true);
        registry.setProvider(v2Id, voter2, 100e6, true);
        registry.setProvider(v3Id, voter3, 100e6, true);

        // 3. Deploy DisputeQuality.
        vm.prank(admin);
        dq = new DisputeQuality(
            address(usdc),
            address(registry),
            admin,
            DISPUTE_BOND,
            VOTER_BOND,
            MIN_VOTER_STAKE,
            DISPUTE_WINDOW,
            VOTING_WINDOW,
            SLASH_BPS
        );

        // 4. ERC-20 approvals.
        vm.prank(caller_);  usdc.approve(address(dq), type(uint256).max);
        vm.prank(voter1);   usdc.approve(address(dq), type(uint256).max);
        vm.prank(voter2);   usdc.approve(address(dq), type(uint256).max);
        vm.prank(voter3);   usdc.approve(address(dq), type(uint256).max);

        // 5. Position the clock so the call settled 1 second ago (inside window).
        settledAt = uint64(block.timestamp - 1);
    }

    // =========================================================================
    // Helper: open a fresh dispute from caller_
    // =========================================================================
    function _openDispute(bytes32 id) internal returns (uint256 disputeId) {
        vm.prank(caller_);
        dq.openDispute(id, PROVIDER_ID, settledAt, "ipfs://evidence");
        disputeId = dq.disputeCount();
    }

    // Helper: cast a vote from an address.
    function _vote(address voter, uint256 disputeId, DisputeQuality.Vote choice) internal {
        vm.prank(voter);
        dq.vote(disputeId, choice);
    }

    // =========================================================================
    // 1. openDispute
    // =========================================================================

    function test_openDispute_success() public {
        uint256 callerBalBefore = usdc.balanceOf(caller_);
        uint256 dqBalBefore     = usdc.balanceOf(address(dq));

        vm.expectEmit(true, true, true, false, address(dq));
        emit DisputeQuality.DisputeOpened(1, callId, caller_, PROVIDER_ID, 0, "ipfs://evidence");

        vm.prank(caller_);
        dq.openDispute(callId, PROVIDER_ID, settledAt, "ipfs://evidence");

        // dispute count incremented
        assertEq(dq.disputeCount(), 1, "disputeCount should be 1");
        // bond transferred
        assertEq(usdc.balanceOf(caller_),      callerBalBefore - DISPUTE_BOND, "caller bond not deducted");
        assertEq(usdc.balanceOf(address(dq)),  dqBalBefore     + DISPUTE_BOND, "dq bond not received");
        // mapping populated
        assertEq(dq.disputeIdByCallId(callId), 1, "mapping not set");

        // struct fields
        (
            bytes32 storedCallId,
            address storedCaller,
            uint256 storedProviderId,
            uint64  openedAt,
            uint64  votingEndsAt,
            uint256 bond,
            ,,,,,
        ) = dq.disputes(1);

        assertEq(storedCallId,      callId,          "callId mismatch");
        assertEq(storedCaller,      caller_,          "caller mismatch");
        assertEq(storedProviderId,  PROVIDER_ID,      "providerId mismatch");
        assertGt(openedAt,          0,                "openedAt zero");
        assertEq(votingEndsAt,      openedAt + VOTING_WINDOW, "votingEndsAt wrong");
        assertEq(bond,              DISPUTE_BOND,     "bond mismatch");
    }

    function test_openDispute_windowClosed_reverts() public {
        // Warp past the dispute window.
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);
        vm.prank(caller_);
        vm.expectRevert(DisputeQuality.DisputeWindowClosed.selector);
        dq.openDispute(callId, PROVIDER_ID, settledAt, "ipfs://evidence");
    }

    function test_openDispute_windowNotStarted_reverts() public {
        // settledAt is in the future → window hasn't started yet.
        uint64 futureSettled = uint64(block.timestamp + 100);
        vm.prank(caller_);
        vm.expectRevert(DisputeQuality.DisputeWindowNotStarted.selector);
        dq.openDispute(callId, PROVIDER_ID, futureSettled, "ipfs://evidence");
    }

    function test_openDispute_alreadyDisputed_reverts() public {
        _openDispute(callId);

        vm.prank(caller_);
        vm.expectRevert(DisputeQuality.AlreadyDisputed.selector);
        dq.openDispute(callId, PROVIDER_ID, settledAt, "ipfs://evidence");
    }

    function test_openDispute_insufficientAllowance_reverts() public {
        // caller has no approval → ERC20 transfer should revert.
        address newCaller = makeAddr("newCaller");
        usdc.mint(newCaller, 500e6);
        // No approval given.
        vm.prank(newCaller);
        vm.expectRevert();
        dq.openDispute(callId, PROVIDER_ID, settledAt, "ipfs://evidence");
    }

    // =========================================================================
    // 2. submitResponseEvidence
    // =========================================================================

    function test_submitResponseEvidence_success() public {
        uint256 disputeId = _openDispute(callId);

        vm.expectEmit(true, true, false, true, address(dq));
        emit DisputeQuality.EvidenceSubmitted(disputeId, provider1Owner, "ipfs://response");

        vm.prank(provider1Owner);
        dq.submitResponseEvidence(disputeId, "ipfs://response");

        // Read the responseUri via the public disputes mapping.
        // The struct has 12 fields; responseUri is at index 7 (0-based).
        (,,,,,, string memory evUri, string memory respUri,,,,) = dq.disputes(disputeId);
        assertEq(respUri, "ipfs://response", "responseUri not stored");
        // evidenceUri should be unchanged.
        assertEq(evUri,   "ipfs://evidence", "evidenceUri changed");
    }

    function test_submitResponseEvidence_wrongCaller_reverts() public {
        uint256 disputeId = _openDispute(callId);

        vm.prank(stranger);
        vm.expectRevert(DisputeQuality.NotProviderOwner.selector);
        dq.submitResponseEvidence(disputeId, "ipfs://bad");
    }

    function test_submitResponseEvidence_notFound_reverts() public {
        vm.prank(provider1Owner);
        vm.expectRevert(DisputeQuality.DisputeNotFound.selector);
        dq.submitResponseEvidence(999, "ipfs://bad");
    }

    // =========================================================================
    // 3. vote
    // =========================================================================

    function test_vote_success_forCaller() public {
        uint256 disputeId = _openDispute(callId);

        uint256 v1BalBefore = usdc.balanceOf(voter1);

        vm.expectEmit(true, true, false, true, address(dq));
        emit DisputeQuality.Voted(disputeId, voter1, DisputeQuality.Vote.ForCaller, 100e6, VOTER_BOND);

        _vote(voter1, disputeId, DisputeQuality.Vote.ForCaller);

        // voter bond transferred
        assertEq(usdc.balanceOf(voter1),        v1BalBefore - VOTER_BOND, "voter bond not deducted");
        assertEq(dq.voterCount(disputeId),       1,                        "voterCount wrong");
        assertEq(dq.bondsForCallerSide(disputeId), VOTER_BOND,             "bondsForCallerSide wrong");

        // vote recorded
        assertEq(uint8(dq.votes(disputeId, voter1)), uint8(DisputeQuality.Vote.ForCaller), "vote not recorded");
    }

    function test_vote_success_forProvider() public {
        uint256 disputeId = _openDispute(callId);
        _vote(voter1, disputeId, DisputeQuality.Vote.ForProvider);

        assertEq(uint8(dq.votes(disputeId, voter1)), uint8(DisputeQuality.Vote.ForProvider), "vote not recorded");
        assertEq(dq.bondsForProviderSide(disputeId), VOTER_BOND, "bondsForProviderSide wrong");
    }

    function test_vote_doubleVote_reverts() public {
        uint256 disputeId = _openDispute(callId);
        _vote(voter1, disputeId, DisputeQuality.Vote.ForCaller);

        vm.prank(voter1);
        vm.expectRevert(DisputeQuality.AlreadyVoted.selector);
        dq.vote(disputeId, DisputeQuality.Vote.ForCaller);
    }

    function test_vote_invalidVote_reverts() public {
        uint256 disputeId = _openDispute(callId);

        vm.prank(voter1);
        vm.expectRevert(DisputeQuality.InvalidVote.selector);
        dq.vote(disputeId, DisputeQuality.Vote.None);
    }

    function test_vote_insufficientStake_reverts() public {
        uint256 disputeId = _openDispute(callId);

        // stranger has no provider registration → stake = 0
        address lowStaker = makeAddr("lowStaker");
        usdc.mint(lowStaker, 500e6);
        vm.prank(lowStaker); usdc.approve(address(dq), type(uint256).max);

        vm.prank(lowStaker);
        vm.expectRevert(DisputeQuality.InsufficientStake.selector);
        dq.vote(disputeId, DisputeQuality.Vote.ForCaller);
    }

    function test_vote_afterVotingEnds_reverts() public {
        uint256 disputeId = _openDispute(callId);

        // Warp past the voting window.
        vm.warp(block.timestamp + VOTING_WINDOW + 1);

        vm.prank(voter1);
        vm.expectRevert(DisputeQuality.VoteClosed.selector);
        dq.vote(disputeId, DisputeQuality.Vote.ForCaller);
    }

    function test_vote_disputeNotFound_reverts() public {
        vm.prank(voter1);
        vm.expectRevert(DisputeQuality.DisputeNotFound.selector);
        dq.vote(999, DisputeQuality.Vote.ForCaller);
    }

    // =========================================================================
    // 4. finalize
    // =========================================================================

    // --- helper: run voting phase, then warp past votingEndsAt ---
    function _runVotes(
        uint256 disputeId,
        DisputeQuality.Vote v1,
        DisputeQuality.Vote v2,
        DisputeQuality.Vote v3
    ) internal {
        _vote(voter1, disputeId, v1);
        _vote(voter2, disputeId, v2);
        _vote(voter3, disputeId, v3);
        vm.warp(block.timestamp + VOTING_WINDOW + 1);
    }

    function test_finalize_callerWins_slashAndDistribute() public {
        uint256 disputeId = _openDispute(callId);
        _runVotes(disputeId, DisputeQuality.Vote.ForCaller, DisputeQuality.Vote.ForCaller, DisputeQuality.Vote.ForCaller);

        uint256 callerBalBefore = usdc.balanceOf(caller_);
        uint256 v1BalBefore     = usdc.balanceOf(voter1);
        uint256 v2BalBefore     = usdc.balanceOf(voter2);
        uint256 v3BalBefore     = usdc.balanceOf(voter3);

        uint256 expectedSlash   = (PROVIDER_STAKE * SLASH_BPS) / 10_000; // 20 USDC

        vm.expectEmit(true, false, false, false, address(dq));
        emit DisputeQuality.Finalized(disputeId, DisputeQuality.Outcome.CallerWins, 0, 0, 0, 0);

        dq.finalize(disputeId);

        // Outcome stored
        (,,,,,,,,,, DisputeQuality.Outcome outcome, bool finalized) = dq.disputes(disputeId);
        assertEq(uint8(outcome),  uint8(DisputeQuality.Outcome.CallerWins), "outcome wrong");
        assertTrue(finalized,                                                "not finalized");

        // Caller bond returned
        assertEq(usdc.balanceOf(caller_), callerBalBefore + DISPUTE_BOND, "caller bond not returned");

        // Registry slash executed
        assertEq(registry.lastSlashedId(),     PROVIDER_ID,   "wrong provider slashed");
        assertEq(registry.lastSlashedAmt(),    expectedSlash,  "wrong slash amount");
        assertEq(registry.lastSlashRecipient(), address(dq),   "wrong slash recipient");

        // Voters on winning side get their bond back + share of spoils
        // Spoils = bondsForProviderSide (0) + slashAmount (20 USDC) = 20 USDC
        // All three voted ForCaller with equal weight → each gets 1/3 * 20 USDC + 5 USDC bond back.
        // (rounding: last winner gets dust)
        uint256 spoils        = 0 + expectedSlash; // no losing voter bonds
        uint256 totalWeight   = 100e6 + 100e6 + 100e6;
        uint256 rewardEach    = (spoils * 100e6) / totalWeight;
        uint256 v1Gain        = VOTER_BOND + rewardEach;
        uint256 v2Gain        = VOTER_BOND + rewardEach;
        // last winner (voter3) gets leftover dust
        uint256 distributed   = rewardEach * 3;
        uint256 v3Gain        = VOTER_BOND + rewardEach + (spoils - distributed);

        assertEq(usdc.balanceOf(voter1), v1BalBefore + v1Gain, "voter1 payout wrong");
        assertEq(usdc.balanceOf(voter2), v2BalBefore + v2Gain, "voter2 payout wrong");
        assertEq(usdc.balanceOf(voter3), v3BalBefore + v3Gain, "voter3 payout wrong");
    }

    function test_finalize_providerWins() public {
        uint256 disputeId = _openDispute(callId);
        _runVotes(
            disputeId,
            DisputeQuality.Vote.ForProvider,
            DisputeQuality.Vote.ForProvider,
            DisputeQuality.Vote.ForProvider
        );

        uint256 v1BalBefore = usdc.balanceOf(voter1);
        uint256 v2BalBefore = usdc.balanceOf(voter2);
        uint256 v3BalBefore = usdc.balanceOf(voter3);
        uint256 callerBalBefore = usdc.balanceOf(caller_);

        dq.finalize(disputeId);

        (,,,,,,,,,, DisputeQuality.Outcome outcome, bool finalized) = dq.disputes(disputeId);
        assertEq(uint8(outcome), uint8(DisputeQuality.Outcome.ProviderWins), "outcome wrong");
        assertTrue(finalized, "not finalized");

        // Caller loses bond
        assertEq(usdc.balanceOf(caller_), callerBalBefore, "caller should NOT get bond back");

        // No slash should have been called (provider wins)
        assertEq(registry.lastSlashedAmt(), 0, "should not slash on provider win");

        // Winning voters share caller's bond + losing bonds (0 losing bonds here)
        // spoils = DISPUTE_BOND + bondsForCallerSide (0) = 10 USDC
        uint256 spoils      = DISPUTE_BOND + 0;
        uint256 totalWeight = 100e6 + 100e6 + 100e6;
        uint256 rewardEach  = (spoils * 100e6) / totalWeight;
        uint256 distributed = rewardEach * 3;

        assertEq(usdc.balanceOf(voter1), v1BalBefore + VOTER_BOND + rewardEach, "voter1 payout wrong");
        assertEq(usdc.balanceOf(voter2), v2BalBefore + VOTER_BOND + rewardEach, "voter2 payout wrong");
        // voter3 is last winner, absorbs dust
        assertEq(
            usdc.balanceOf(voter3),
            v3BalBefore + VOTER_BOND + rewardEach + (spoils - distributed),
            "voter3 payout wrong"
        );
    }

    function test_finalize_tied_refundsAll() public {
        // 3 voters but equal weight → Tied (equal votes)
        uint256 disputeId = _openDispute(callId);

        // voter1+voter2 for caller, voter3 for provider — BUT voter weights equal →
        // Need actual numeric tie: all voters have same stake (100e6 each).
        // 2 ForCaller (weight 200e6) vs 1 ForProvider (weight 100e6) → CallerWins.
        // For a tie, do 1 ForCaller (100e6) vs 1 ForProvider (100e6) + 1 more ForProvider (100e6).
        // That means provider wins. For true tie: 1 each ForCaller & ForProvider → but < 3 voters → Tied.
        // Let's do the "< 3 voters" variant instead.
        // Only voter1 votes → voterCount = 1 < 3 → Tied.
        _vote(voter1, disputeId, DisputeQuality.Vote.ForCaller);
        vm.warp(block.timestamp + VOTING_WINDOW + 1);

        uint256 callerBalBefore = usdc.balanceOf(caller_);
        uint256 v1BalBefore     = usdc.balanceOf(voter1);

        dq.finalize(disputeId);

        (,,,,,,,,,, DisputeQuality.Outcome outcome, bool finalized) = dq.disputes(disputeId);
        assertEq(uint8(outcome), uint8(DisputeQuality.Outcome.Tied), "outcome should be Tied");
        assertTrue(finalized, "not finalized");

        // Caller bond refunded
        assertEq(usdc.balanceOf(caller_), callerBalBefore + DISPUTE_BOND, "caller bond not refunded on Tied");
        // Voter bond refunded
        assertEq(usdc.balanceOf(voter1), v1BalBefore + VOTER_BOND, "voter1 bond not refunded on Tied");
    }

    function test_finalize_equalWeights_tied() public {
        // Set up voter4 with the same stake as voter1 so we get a numeric tie:
        // 1 ForCaller (100e6) vs 1 ForProvider (100e6) plus voter3 also ForProvider (100e6) → 100 vs 200 → not tied.
        // True numeric tie: need votesForCaller == votesForProvider with >= 3 voters.
        // Use voter1 ForCaller(100e6), voter2 ForProvider(100e6), and adjust voter3 weight to 0 by making inactive.
        address voter4 = makeAddr("voter4");
        usdc.mint(voter4, 500e6);
        vm.prank(voter4); usdc.approve(address(dq), type(uint256).max);
        uint256 v4Id = 20;
        registry.setProviderIdOf(voter4, v4Id);
        registry.setProvider(v4Id, voter4, 100e6, true);

        // Open fresh dispute with different callId
        bytes32 newCallId = keccak256("call-tie");
        uint256 disputeId = _openDispute(newCallId);

        // voter1 (100e6) ForCaller, voter2 (100e6) ForProvider, voter4 (100e6) ForCaller
        // -> 200e6 vs 100e6 → CallerWins... Let's do 1 each side but weight them equal.
        // voter1 (100e6) ForCaller, voter2 (100e6) ForProvider → only 2 voters → Tied (<3).
        // For >=3 voters equal-weight tie: need 3 votes 1.5/1.5 — impossible with integers.
        // Use stake manipulation: voter1=100, voter2=100, voter3=100; 1 ForCaller vs 2 ForProvider → not a tie.
        // Real equal-stake tie: register two voters for each side with equal total stake.
        // voter1 (100e6) + voter3 (100e6) ForCaller = 200e6
        // voter2 (100e6) + voter4 (100e6) ForProvider = 200e6 → TIE with >=3 voters!
        _vote(voter1, disputeId, DisputeQuality.Vote.ForCaller);
        _vote(voter2, disputeId, DisputeQuality.Vote.ForProvider);
        _vote(voter3, disputeId, DisputeQuality.Vote.ForCaller);
        vm.prank(voter4);
        dq.vote(disputeId, DisputeQuality.Vote.ForProvider);

        vm.warp(block.timestamp + VOTING_WINDOW + 1);

        uint256 callerBalBefore = usdc.balanceOf(caller_);
        uint256 v1BalBefore     = usdc.balanceOf(voter1);
        uint256 v2BalBefore     = usdc.balanceOf(voter2);
        uint256 v3BalBefore     = usdc.balanceOf(voter3);
        uint256 v4BalBefore     = usdc.balanceOf(voter4);

        dq.finalize(disputeId);

        (,,,,,,,,,, DisputeQuality.Outcome outcome, bool finalized) = dq.disputes(disputeId);
        assertEq(uint8(outcome), uint8(DisputeQuality.Outcome.Tied), "equal votes should be Tied");
        assertTrue(finalized);

        // All bonds refunded
        assertEq(usdc.balanceOf(caller_), callerBalBefore + DISPUTE_BOND, "caller bond not refunded");
        assertEq(usdc.balanceOf(voter1),  v1BalBefore + VOTER_BOND,      "voter1 bond not refunded");
        assertEq(usdc.balanceOf(voter2),  v2BalBefore + VOTER_BOND,      "voter2 bond not refunded");
        assertEq(usdc.balanceOf(voter3),  v3BalBefore + VOTER_BOND,      "voter3 bond not refunded");
        assertEq(usdc.balanceOf(voter4),  v4BalBefore + VOTER_BOND,      "voter4 bond not refunded");
    }

    function test_finalize_tooEarly_reverts() public {
        uint256 disputeId = _openDispute(callId);
        _vote(voter1, disputeId, DisputeQuality.Vote.ForCaller);
        // Do NOT warp — voting still open.

        vm.expectRevert(DisputeQuality.VotingStillOpen.selector);
        dq.finalize(disputeId);
    }

    function test_finalize_alreadyFinalized_reverts() public {
        uint256 disputeId = _openDispute(callId);
        vm.warp(block.timestamp + VOTING_WINDOW + 1);
        dq.finalize(disputeId);

        vm.expectRevert(DisputeQuality.AlreadyFinalized.selector);
        dq.finalize(disputeId);
    }

    function test_finalize_notFound_reverts() public {
        vm.expectRevert(DisputeQuality.DisputeNotFound.selector);
        dq.finalize(999);
    }

    // =========================================================================
    // 5. Happy-path end-to-end: open → evidence → 3 votes for caller → finalize
    // =========================================================================

    function test_endToEnd_callerWins_fullFlow() public {
        // ── Step 1: Open dispute ─────────────────────────────────────────────
        uint256 callerBalStart  = usdc.balanceOf(caller_);
        uint256 v1BalStart      = usdc.balanceOf(voter1);
        uint256 v2BalStart      = usdc.balanceOf(voter2);
        uint256 v3BalStart      = usdc.balanceOf(voter3);

        vm.prank(caller_);
        dq.openDispute(callId, PROVIDER_ID, settledAt, "ipfs://evidence-e2e");

        uint256 disputeId = dq.disputeCount();
        assertEq(disputeId, 1, "expected disputeId=1");

        // bond locked
        assertEq(usdc.balanceOf(caller_), callerBalStart - DISPUTE_BOND, "caller bond not locked");

        // ── Step 2: Provider submits response evidence ───────────────────────
        vm.prank(provider1Owner);
        dq.submitResponseEvidence(disputeId, "ipfs://response-e2e");
        (,,,,,, , string memory respUri,,,,) = dq.disputes(disputeId);
        assertEq(respUri, "ipfs://response-e2e", "response URI mismatch");

        // ── Step 3: Three voters vote ForCaller ──────────────────────────────
        _vote(voter1, disputeId, DisputeQuality.Vote.ForCaller);
        _vote(voter2, disputeId, DisputeQuality.Vote.ForCaller);
        _vote(voter3, disputeId, DisputeQuality.Vote.ForCaller);

        assertEq(dq.voterCount(disputeId), 3, "voterCount should be 3");

        // each voter locked a voterBond
        assertEq(usdc.balanceOf(voter1), v1BalStart - VOTER_BOND, "voter1 bond not locked");
        assertEq(usdc.balanceOf(voter2), v2BalStart - VOTER_BOND, "voter2 bond not locked");
        assertEq(usdc.balanceOf(voter3), v3BalStart - VOTER_BOND, "voter3 bond not locked");

        // ── Step 4: Warp past voting window ──────────────────────────────────
        (, , , , uint64 votingEndsAt, , , , , , ,) = dq.disputes(disputeId);
        vm.warp(uint256(votingEndsAt) + 1);

        // ── Step 5: Finalize ─────────────────────────────────────────────────
        uint256 providerStakeBefore = registry.getProviderStake(PROVIDER_ID);
        dq.finalize(disputeId);

        // Verify outcome = CallerWins
        (,,,,,,,,,, DisputeQuality.Outcome outcome, bool finalized) = dq.disputes(disputeId);
        assertEq(uint8(outcome), uint8(DisputeQuality.Outcome.CallerWins), "outcome should be CallerWins");
        assertTrue(finalized, "should be finalized");

        // ── Step 6: Verify slash ─────────────────────────────────────────────
        uint256 expectedSlash = (providerStakeBefore * SLASH_BPS) / 10_000;
        assertEq(registry.lastSlashedAmt(), expectedSlash,  "slash amount wrong");
        assertEq(registry.lastSlashedId(),  PROVIDER_ID,    "wrong provider slashed");

        // Provider stake reduced in registry
        uint256 providerStakeAfter = registry.getProviderStake(PROVIDER_ID);
        assertEq(providerStakeAfter, providerStakeBefore - expectedSlash, "provider stake not reduced");

        // ── Step 7: Verify bond returns ──────────────────────────────────────
        // Caller bond returned
        assertEq(usdc.balanceOf(caller_), callerBalStart, "caller bond not returned");

        // Each winning voter gets bond back + share of spoils
        // spoils = bondsForProviderSide(0) + slashAmount = 20 USDC
        uint256 spoils       = 0 + expectedSlash;
        uint256 totalWeight  = 300e6; // 100e6 * 3
        uint256 rewardEach   = (spoils * 100e6) / totalWeight;
        uint256 distributed  = rewardEach * 3;
        uint256 dust         = spoils - distributed;

        assertEq(usdc.balanceOf(voter1), v1BalStart + rewardEach,        "voter1 payout wrong");
        assertEq(usdc.balanceOf(voter2), v2BalStart + rewardEach,        "voter2 payout wrong");
        assertEq(usdc.balanceOf(voter3), v3BalStart + rewardEach + dust, "voter3 payout wrong (last)");
    }

    // =========================================================================
    // 6. Owner admin functions
    // =========================================================================

    function test_changeWindow_onlyOwner() public {
        vm.prank(admin);
        dq.changeWindow(14 days);
        assertEq(dq.disputeWindow(), 14 days, "disputeWindow not updated");
    }

    function test_changeWindow_nonOwner_reverts() public {
        vm.prank(stranger);
        vm.expectRevert();
        dq.changeWindow(14 days);
    }

    function test_changeVotingWindow_onlyOwner() public {
        vm.prank(admin);
        dq.changeVotingWindow(5 days);
        assertEq(dq.votingWindow(), 5 days, "votingWindow not updated");
    }

    // =========================================================================
    // 7. Constructor validation
    // =========================================================================

    function test_constructor_zeroUsdc_reverts() public {
        vm.expectRevert(DisputeQuality.InvalidAddress.selector);
        new DisputeQuality(
            address(0),
            address(registry),
            admin,
            DISPUTE_BOND,
            VOTER_BOND,
            MIN_VOTER_STAKE,
            DISPUTE_WINDOW,
            VOTING_WINDOW,
            SLASH_BPS
        );
    }

    function test_constructor_zeroRegistry_reverts() public {
        vm.expectRevert(DisputeQuality.InvalidAddress.selector);
        new DisputeQuality(
            address(usdc),
            address(0),
            admin,
            DISPUTE_BOND,
            VOTER_BOND,
            MIN_VOTER_STAKE,
            DISPUTE_WINDOW,
            VOTING_WINDOW,
            SLASH_BPS
        );
    }

    function test_constructor_invalidBps_reverts() public {
        vm.expectRevert(DisputeQuality.InvalidBps.selector);
        new DisputeQuality(
            address(usdc),
            address(registry),
            admin,
            DISPUTE_BOND,
            VOTER_BOND,
            MIN_VOTER_STAKE,
            DISPUTE_WINDOW,
            VOTING_WINDOW,
            10_001 // > 10_000
        );
    }

    // =========================================================================
    // 8. getDisputeVoters
    // =========================================================================

    function test_getDisputeVoters_returnsCorrectList() public {
        uint256 disputeId = _openDispute(callId);
        _vote(voter1, disputeId, DisputeQuality.Vote.ForCaller);
        _vote(voter2, disputeId, DisputeQuality.Vote.ForProvider);

        address[] memory voters = dq.getDisputeVoters(disputeId);
        assertEq(voters.length, 2,      "should have 2 voters");
        assertEq(voters[0],    voter1,  "first voter wrong");
        assertEq(voters[1],    voter2,  "second voter wrong");
    }

    // =========================================================================
    // Fuzz: openDispute bond is always transferred
    // =========================================================================

    function testFuzz_openDispute_bondTransfer(uint64 deltaSeconds) public {
        // Constrain delta so we're within the dispute window: 1 .. DISPUTE_WINDOW.
        deltaSeconds = uint64(bound(uint256(deltaSeconds), 1, uint256(DISPUTE_WINDOW)));

        // Ensure block.timestamp is large enough that subtracting deltaSeconds can't underflow.
        // Start from a base of DISPUTE_WINDOW + 1 days so the arithmetic is always safe.
        uint256 baseTime = uint256(DISPUTE_WINDOW) + 1 days;
        vm.warp(baseTime);

        // A settled call that happened `deltaSeconds` seconds before baseTime.
        uint64 fuzzSettled = uint64(baseTime - deltaSeconds);

        bytes32 fuzzCallId = keccak256(abi.encode("fuzz", deltaSeconds));
        uint256 callerBalBefore = usdc.balanceOf(caller_);

        vm.prank(caller_);
        dq.openDispute(fuzzCallId, PROVIDER_ID, fuzzSettled, "ipfs://fuzz");

        assertEq(usdc.balanceOf(caller_), callerBalBefore - DISPUTE_BOND, "bond not transferred");
    }
}

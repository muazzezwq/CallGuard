// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { AgentWallet } from "../contracts/AgentWallet.sol";
import { IPayPerCall } from "../contracts/interfaces/IPayPerCall.sol";
import { MockUSDC } from "./helpers/MockUSDC.sol";

// ---------------------------------------------------------------------------
// MockPayPerCall
//
// The AgentWallet verifies that its USDC balance decreased by exactly `amount`
// after the IPayPerCall.callService() call.  To make that check pass, this mock
// must pull `amount` tokens from the caller (AgentWallet) on every callService.
//
// The wallet pre-approves the payPerCall contract before calling, so a simple
// transferFrom(msg.sender, address(this), amount) is enough.
// ---------------------------------------------------------------------------
contract MockPayPerCall is IPayPerCall {
    IERC20 public immutable usdc;

    // How much to actually deduct on the next call (defaults to the `amount`
    // parameter so normal tests "just work").  Override to inject mismatches.
    bool public overrideSpend;
    uint256 public forcedSpend;

    // Call records
    uint256 public callCount;
    uint256 public lastProviderId;
    bytes32 public lastRequestHash;
    bytes32 public lastCallId;

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    // Allow tests to force a different spend to trigger ActualSpendMismatch.
    function setForcedSpend(uint256 amount) external {
        overrideSpend = true;
        forcedSpend = amount;
    }

    function clearForcedSpend() external {
        overrideSpend = false;
    }

    /// @inheritdoc IPayPerCall
    function callService(uint256 providerId, bytes32 requestHash) external returns (bytes32 callId) {
        // Peek at how much the wallet approved so we know the requested amount.
        uint256 approved = usdc.allowance(msg.sender, address(this));
        uint256 toSpend = overrideSpend ? forcedSpend : approved;

        if (toSpend > 0) {
            usdc.transferFrom(msg.sender, address(this), toSpend);
        }

        callCount += 1;
        lastProviderId = providerId;
        lastRequestHash = requestHash;
        callId = keccak256(abi.encodePacked(providerId, requestHash, callCount));
        lastCallId = callId;
    }
}

// ---------------------------------------------------------------------------
// AgentWalletTest
// ---------------------------------------------------------------------------
contract AgentWalletTest is Test {
    MockUSDC internal usdc;
    MockPayPerCall internal payPerCall;
    AgentWallet internal wallet;

    address internal owner = makeAddr("owner");
    address internal agent = makeAddr("agent");
    address internal alice = makeAddr("alice"); // unprivileged third party

    uint256 internal constant DAILY_LIMIT = 100e6;  // 100 USDC
    uint256 internal constant MAX_PER_CALL = 20e6;  //  20 USDC
    uint256 internal constant PRICE = 5e6;           //   5 USDC per call

    function setUp() public {
        // Deploy mocks (no prank — deployer is the test contract itself)
        usdc = new MockUSDC();
        payPerCall = new MockPayPerCall(address(usdc));

        // Deploy AgentWallet as `owner`
        vm.prank(owner);
        wallet = new AgentWallet(
            address(usdc),
            address(payPerCall),
            agent,
            DAILY_LIMIT,
            MAX_PER_CALL
        );

        // Give owner USDC and approve the wallet to pull it
        usdc.mint(owner, 1_000e6);
        vm.prank(owner);
        usdc.approve(address(wallet), type(uint256).max);
    }

    // -----------------------------------------------------------------------
    // Internal helper: deposit and prepare for agent calls
    // -----------------------------------------------------------------------
    function _deposit(uint256 amount) internal {
        vm.prank(owner);
        wallet.deposit(amount);
    }

    // -----------------------------------------------------------------------
    // 1. deposit
    // -----------------------------------------------------------------------

    function test_Deposit_Success() public {
        uint256 amount = 200e6;
        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(wallet));
        emit AgentWallet.Deposited(owner, amount);
        wallet.deposit(amount);

        assertEq(usdc.balanceOf(address(wallet)), amount, "wallet balance after deposit");
        assertEq(usdc.balanceOf(owner), 1_000e6 - amount, "owner balance after deposit");
    }

    function test_Deposit_NonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert(AgentWallet.NotOwner.selector);
        wallet.deposit(100e6);
    }

    // -----------------------------------------------------------------------
    // 2. withdraw
    // -----------------------------------------------------------------------

    function test_Withdraw_Success() public {
        _deposit(200e6);
        uint256 ownerBefore = usdc.balanceOf(owner);

        vm.prank(owner);
        vm.expectEmit(true, false, false, true, address(wallet));
        emit AgentWallet.Withdrawn(owner, 50e6);
        wallet.withdraw(50e6);

        assertEq(usdc.balanceOf(address(wallet)), 150e6, "wallet after withdraw");
        assertEq(usdc.balanceOf(owner), ownerBefore + 50e6, "owner after withdraw");
    }

    function test_Withdraw_MoreThanBalanceReverts() public {
        _deposit(50e6);
        vm.prank(owner);
        // SafeERC20 wraps the failed transfer — expect a generic ERC20 error
        vm.expectRevert();
        wallet.withdraw(100e6);
    }

    function test_Withdraw_NonOwnerReverts() public {
        _deposit(100e6);
        vm.prank(alice);
        vm.expectRevert(AgentWallet.NotOwner.selector);
        wallet.withdraw(10e6);
    }

    // -----------------------------------------------------------------------
    // 3. agentCall — various paths
    // -----------------------------------------------------------------------

    function test_AgentCall_Success() public {
        _deposit(50e6);

        bytes32 reqHash = keccak256("req1");
        vm.prank(agent);
        bytes32 callId = wallet.agentCall(1, reqHash, PRICE, "");

        assertFalse(callId == bytes32(0), "callId non-zero");
        assertEq(wallet.spentToday(), PRICE,   "spentToday");
        assertEq(wallet.totalSpent(), PRICE,   "totalSpent");
        assertEq(wallet.totalCalls(), 1,       "totalCalls");
    }

    function test_AgentCall_NonAgentReverts() public {
        _deposit(50e6);
        vm.prank(alice);
        vm.expectRevert(AgentWallet.NotAgent.selector);
        wallet.agentCall(1, keccak256("req"), PRICE, "");
    }

    function test_AgentCall_PausedReverts() public {
        _deposit(50e6);
        vm.prank(owner);
        wallet.pause();

        vm.prank(agent);
        vm.expectRevert(AgentWallet.PausedState.selector);
        wallet.agentCall(1, keccak256("req"), PRICE, "");
    }

    function test_AgentCall_ExceedsMaxPerCallReverts() public {
        _deposit(200e6);
        uint256 tooMuch = MAX_PER_CALL + 1;

        vm.prank(agent);
        vm.expectRevert(AgentWallet.ExceedsMaxPerCall.selector);
        wallet.agentCall(1, keccak256("req"), tooMuch, "");
    }

    function test_AgentCall_DailyLimitExceededReverts() public {
        // Daily limit = 100e6, max-per-call = 20e6.
        // Spend 5 × 20e6 = 100e6 first (exhausts the limit).
        _deposit(200e6);
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(agent);
            wallet.agentCall(1, keccak256(abi.encodePacked("req", i)), MAX_PER_CALL, "");
        }

        vm.prank(agent);
        vm.expectRevert(AgentWallet.ExceedsDailyLimit.selector);
        wallet.agentCall(1, keccak256("extra"), MAX_PER_CALL, "");
    }

    function test_AgentCall_WhitelistBlocksNonWhitelisted() public {
        _deposit(50e6);

        // Enable whitelist by adding provider 99; try to call with provider 1.
        vm.prank(owner);
        wallet.addToWhitelist(99);

        vm.prank(agent);
        vm.expectRevert(AgentWallet.ProviderNotWhitelisted.selector);
        wallet.agentCall(1, keccak256("req"), PRICE, "");
    }

    function test_AgentCall_WhitelistAllowsWhitelisted() public {
        _deposit(50e6);

        vm.prank(owner);
        wallet.addToWhitelist(1);

        vm.prank(agent);
        bytes32 callId = wallet.agentCall(1, keccak256("req"), PRICE, "");
        assertFalse(callId == bytes32(0), "callId non-zero for whitelisted provider");
    }

    function test_AgentCall_EmitsEvent() public {
        _deposit(50e6);
        bytes32 reqHash = keccak256("req1");

        // We can't predict callId in advance, so only check the indexed topic fields.
        vm.prank(agent);
        vm.expectEmit(false, false, false, false, address(wallet));
        emit AgentWallet.AgentCallMade(bytes32(0), 1, PRICE, DAILY_LIMIT - PRICE);
        wallet.agentCall(1, reqHash, PRICE, "");
    }

    function test_AgentCall_ActualSpendMismatchReverts() public {
        _deposit(50e6);
        // Force the mock to pull LESS than the wallet expected (PRICE - 1).
        // The allowance check passes (PRICE was approved), but the balance
        // delta (PRICE - 1) != PRICE, so AgentWallet reverts with
        // ActualSpendMismatch(PRICE, PRICE - 1).
        payPerCall.setForcedSpend(PRICE - 1);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(AgentWallet.ActualSpendMismatch.selector, PRICE, PRICE - 1)
        );
        wallet.agentCall(1, keccak256("req"), PRICE, "");
    }

    // -----------------------------------------------------------------------
    // 4. Daily limit reset — spend, warp 24 h, spend again
    // -----------------------------------------------------------------------

    function test_DailyLimitReset_AfterWarp() public {
        _deposit(500e6);

        // Spend the full daily limit.
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(agent);
            wallet.agentCall(1, keccak256(abi.encodePacked("day1", i)), MAX_PER_CALL, "");
        }
        assertEq(wallet.spentToday(), DAILY_LIMIT, "spentToday at end of day 1");

        // Warp exactly 1 day forward.
        skip(1 days);

        // Should be able to spend again.
        vm.prank(agent);
        wallet.agentCall(1, keccak256("day2"), PRICE, "");
        assertEq(wallet.spentToday(), PRICE, "spentToday after reset");
    }

    function test_DailyLimitReset_ViewReflectsReset() public {
        _deposit(200e6);

        vm.prank(agent);
        wallet.agentCall(1, keccak256("req"), PRICE, "");

        skip(1 days);

        // getStats should show spentToday_ == 0 (via _currentSpentToday) before
        // an actual tx triggers resetDailyIfNeeded.
        (,uint256 spentToday_,,, ) = wallet.getStats();
        assertEq(spentToday_, 0, "getStats spentToday should be 0 after 24h");
    }

    // -----------------------------------------------------------------------
    // 5. setAgent
    // -----------------------------------------------------------------------

    function test_SetAgent_Success() public {
        address newAgent = makeAddr("newAgent");
        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(wallet));
        emit AgentWallet.AgentUpdated(newAgent);
        wallet.setAgent(newAgent);

        assertEq(wallet.agent(), newAgent, "agent updated");
    }

    function test_SetAgent_ZeroAddressReverts() public {
        vm.prank(owner);
        vm.expectRevert(AgentWallet.ZeroAddress.selector);
        wallet.setAgent(address(0));
    }

    function test_SetAgent_NonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert(AgentWallet.NotOwner.selector);
        wallet.setAgent(makeAddr("x"));
    }

    // -----------------------------------------------------------------------
    // 6. setDailyLimit / setMaxPerCall
    // -----------------------------------------------------------------------

    function test_SetDailyLimit_Success() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(wallet));
        emit AgentWallet.LimitUpdated(50e6, MAX_PER_CALL);
        wallet.setDailyLimit(50e6);

        assertEq(wallet.dailyLimit(), 50e6, "dailyLimit updated");
    }

    function test_SetDailyLimit_NonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert(AgentWallet.NotOwner.selector);
        wallet.setDailyLimit(50e6);
    }

    function test_SetMaxPerCall_Success() public {
        vm.prank(owner);
        vm.expectEmit(false, false, false, true, address(wallet));
        emit AgentWallet.LimitUpdated(DAILY_LIMIT, 10e6);
        wallet.setMaxPerCall(10e6);

        assertEq(wallet.maxPerCall(), 10e6, "maxPerCall updated");
    }

    function test_SetMaxPerCall_NonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert(AgentWallet.NotOwner.selector);
        wallet.setMaxPerCall(10e6);
    }

    // -----------------------------------------------------------------------
    // 7. addToWhitelist / removeFromWhitelist
    // -----------------------------------------------------------------------

    function test_AddToWhitelist_Success() public {
        vm.prank(owner);
        wallet.addToWhitelist(42);

        assertTrue(wallet.whitelistedProviders(42), "provider 42 whitelisted");
        assertEq(wallet.whitelistIds(0), 42, "whitelistIds[0] == 42");
    }

    function test_AddToWhitelist_AlreadyWhitelistedReverts() public {
        vm.prank(owner);
        wallet.addToWhitelist(42);

        vm.prank(owner);
        vm.expectRevert(AgentWallet.AlreadyWhitelisted.selector);
        wallet.addToWhitelist(42);
    }

    function test_AddToWhitelist_NonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert(AgentWallet.NotOwner.selector);
        wallet.addToWhitelist(42);
    }

    function test_RemoveFromWhitelist_Success() public {
        vm.prank(owner);
        wallet.addToWhitelist(42);

        vm.prank(owner);
        wallet.removeFromWhitelist(42);

        assertFalse(wallet.whitelistedProviders(42), "provider 42 no longer whitelisted");
    }

    function test_RemoveFromWhitelist_NotWhitelistedReverts() public {
        vm.prank(owner);
        vm.expectRevert(AgentWallet.NotWhitelisted.selector);
        wallet.removeFromWhitelist(999);
    }

    function test_RemoveFromWhitelist_NonOwnerReverts() public {
        vm.prank(owner);
        wallet.addToWhitelist(42);

        vm.prank(alice);
        vm.expectRevert(AgentWallet.NotOwner.selector);
        wallet.removeFromWhitelist(42);
    }

    function test_RemoveFromWhitelist_EmptyListAllowsAllProviders() public {
        // After all providers are removed, the whitelist is empty → anyone passes.
        _deposit(50e6);

        vm.prank(owner);
        wallet.addToWhitelist(99);
        vm.prank(owner);
        wallet.removeFromWhitelist(99);

        // Provider 1 (not added) should now succeed.
        vm.prank(agent);
        bytes32 callId = wallet.agentCall(1, keccak256("req"), PRICE, "");
        assertFalse(callId == bytes32(0));
    }

    // -----------------------------------------------------------------------
    // 8. pause / unpause
    // -----------------------------------------------------------------------

    function test_Pause_Success() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(wallet));
        emit AgentWallet.Paused(owner);
        wallet.pause();

        assertTrue(wallet.paused(), "wallet paused");
    }

    function test_Unpause_Success() public {
        vm.prank(owner);
        wallet.pause();

        vm.prank(owner);
        vm.expectEmit(true, false, false, false, address(wallet));
        emit AgentWallet.Unpaused(owner);
        wallet.unpause();

        assertFalse(wallet.paused(), "wallet unpaused");
    }

    function test_Pause_NonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert(AgentWallet.NotOwner.selector);
        wallet.pause();
    }

    function test_Unpause_NonOwnerReverts() public {
        vm.prank(owner);
        wallet.pause();

        vm.prank(alice);
        vm.expectRevert(AgentWallet.NotOwner.selector);
        wallet.unpause();
    }

    function test_Pause_BlocksAgentCall() public {
        _deposit(50e6);
        vm.prank(owner);
        wallet.pause();

        vm.prank(agent);
        vm.expectRevert(AgentWallet.PausedState.selector);
        wallet.agentCall(1, keccak256("req"), PRICE, "");
    }

    function test_Unpause_AllowsAgentCallAgain() public {
        _deposit(50e6);
        vm.prank(owner);
        wallet.pause();

        vm.prank(owner);
        wallet.unpause();

        vm.prank(agent);
        bytes32 callId = wallet.agentCall(1, keccak256("req"), PRICE, "");
        assertFalse(callId == bytes32(0));
    }

    // -----------------------------------------------------------------------
    // 9. getStats — correct values
    // -----------------------------------------------------------------------

    function test_GetStats_AfterDeposit() public {
        _deposit(200e6);

        (uint256 balance, uint256 spentToday_, uint256 remainingToday, uint256 totalSpent_, uint256 totalCalls_) =
            wallet.getStats();

        assertEq(balance,        200e6,       "balance");
        assertEq(spentToday_,    0,            "spentToday");
        assertEq(remainingToday, DAILY_LIMIT,  "remainingToday");
        assertEq(totalSpent_,    0,            "totalSpent");
        assertEq(totalCalls_,    0,            "totalCalls");
    }

    function test_GetStats_AfterCalls() public {
        _deposit(200e6);

        // Make 3 calls at PRICE each.
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(agent);
            wallet.agentCall(1, keccak256(abi.encodePacked("req", i)), PRICE, "");
        }

        (uint256 balance, uint256 spentToday_, uint256 remainingToday, uint256 totalSpent_, uint256 totalCalls_) =
            wallet.getStats();

        uint256 spent = 3 * PRICE;
        assertEq(balance,        200e6 - spent,          "balance");
        assertEq(spentToday_,    spent,                   "spentToday");
        assertEq(remainingToday, DAILY_LIMIT - spent,     "remainingToday");
        assertEq(totalSpent_,    spent,                   "totalSpent");
        assertEq(totalCalls_,    3,                       "totalCalls");
    }

    // -----------------------------------------------------------------------
    // 10. Happy path: deposit → 3 agent calls → check stats → warp 24h → reset
    // -----------------------------------------------------------------------

    function test_HappyPath_DepositCallsWarpReset() public {
        // ── deposit ──────────────────────────────────────────────────────────
        uint256 depositAmount = 300e6;
        vm.prank(owner);
        wallet.deposit(depositAmount);
        assertEq(usdc.balanceOf(address(wallet)), depositAmount, "balance after deposit");

        // ── 3 agent calls ────────────────────────────────────────────────────
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(agent);
            wallet.agentCall(1, keccak256(abi.encodePacked("happy", i)), PRICE, "");
        }

        // ── check stats ──────────────────────────────────────────────────────
        uint256 spent3 = 3 * PRICE; // 15e6
        (uint256 bal, uint256 spentToday_, uint256 remaining, uint256 totalSpent_, uint256 calls) =
            wallet.getStats();

        assertEq(bal,         depositAmount - spent3,   "balance after 3 calls");
        assertEq(spentToday_, spent3,                    "spentToday after 3 calls");
        assertEq(remaining,   DAILY_LIMIT - spent3,      "remaining after 3 calls");
        assertEq(totalSpent_, spent3,                    "totalSpent after 3 calls");
        assertEq(calls,       3,                         "totalCalls after 3 calls");

        // ── warp 24 h ────────────────────────────────────────────────────────
        skip(1 days);

        // getStats should now show a reset (view uses _currentSpentToday).
        (, uint256 spentAfterWarp,,,) = wallet.getStats();
        assertEq(spentAfterWarp, 0, "spentToday resets after 24h (view)");

        // ── new call succeeds and state resets on-chain ───────────────────────
        vm.prank(agent);
        wallet.agentCall(1, keccak256("day2_call1"), PRICE, "");

        (,uint256 spentDay2,,,) = wallet.getStats();
        assertEq(spentDay2, PRICE, "spentToday on day 2");
    }

    // -----------------------------------------------------------------------
    // Fuzz: deposit/withdraw round-trip
    // -----------------------------------------------------------------------

    function testFuzz_DepositWithdraw(uint256 amount) public {
        amount = bound(amount, 1, 500e6);
        // Give owner more if needed
        if (amount > usdc.balanceOf(owner)) {
            usdc.mint(owner, amount);
        }

        uint256 walletBefore = usdc.balanceOf(address(wallet));

        vm.prank(owner);
        wallet.deposit(amount);
        assertEq(usdc.balanceOf(address(wallet)), walletBefore + amount, "fuzz: balance after deposit");

        vm.prank(owner);
        wallet.withdraw(amount);
        assertEq(usdc.balanceOf(address(wallet)), walletBefore, "fuzz: balance after withdraw");
    }

    // -----------------------------------------------------------------------
    // Fuzz: agentCall respects per-call and daily limits
    // -----------------------------------------------------------------------

    function testFuzz_AgentCall_Limits(uint256 callAmount) public {
        callAmount = bound(callAmount, 1, MAX_PER_CALL);
        _deposit(500e6);

        vm.prank(agent);
        wallet.agentCall(1, keccak256("fuzz"), callAmount, "");

        assertEq(wallet.spentToday(), callAmount, "fuzz: spentToday");
    }

    // -----------------------------------------------------------------------
    // Constructor — zero address reverts
    // -----------------------------------------------------------------------

    function test_Constructor_ZeroUSDCReverts() public {
        vm.prank(owner);
        vm.expectRevert(AgentWallet.ZeroAddress.selector);
        new AgentWallet(address(0), address(payPerCall), agent, DAILY_LIMIT, MAX_PER_CALL);
    }

    function test_Constructor_ZeroPayPerCallReverts() public {
        vm.prank(owner);
        vm.expectRevert(AgentWallet.ZeroAddress.selector);
        new AgentWallet(address(usdc), address(0), agent, DAILY_LIMIT, MAX_PER_CALL);
    }

    function test_Constructor_ZeroAgentReverts() public {
        vm.prank(owner);
        vm.expectRevert(AgentWallet.ZeroAddress.selector);
        new AgentWallet(address(usdc), address(payPerCall), address(0), DAILY_LIMIT, MAX_PER_CALL);
    }

    function test_Constructor_SetsStateCorrectly() public view {
        assertEq(wallet.owner(),      owner,          "owner");
        assertEq(wallet.agent(),      agent,          "agent");
        assertEq(wallet.usdc(),       address(usdc),  "usdc");
        assertEq(wallet.payPerCall(), address(payPerCall), "payPerCall");
        assertEq(wallet.dailyLimit(), DAILY_LIMIT,    "dailyLimit");
        assertEq(wallet.maxPerCall(), MAX_PER_CALL,   "maxPerCall");
        assertFalse(wallet.paused(),                  "not paused initially");
        assertEq(wallet.totalSpent(), 0,              "totalSpent starts 0");
        assertEq(wallet.totalCalls(), 0,              "totalCalls starts 0");
    }
}

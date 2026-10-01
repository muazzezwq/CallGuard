// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ReputationLoan } from "../src/ReputationLoan.sol";
import { IServiceRegistry } from "../src/interfaces/IServiceRegistry.sol";
import { MockUSDC } from "./helpers/MockUSDC.sol";

// ---------------------------------------------------------------------------
// MockRegistry
// ---------------------------------------------------------------------------
// Implements IServiceRegistry with configurable per-provider fields so tests
// can drive every reputation branch without touching a real ServiceRegistry.
// Also exposes completedCalls(uint256) and slashedCalls(uint256) as real
// public functions — required because ReputationLoan calls them via staticcall
// using the function-selector ABI dispatch (not the IServiceRegistry interface).
// ---------------------------------------------------------------------------
contract MockRegistry is IServiceRegistry {
    struct ProviderConfig {
        address owner;
        uint256 stake;
        bool active;
    }

    mapping(uint256 => ProviderConfig) private _providers;
    mapping(uint256 => uint32) private _completed;
    mapping(uint256 => uint32) private _slashed;

    // -----------------------------------------------------------------------
    // Test-helper setters
    // -----------------------------------------------------------------------

    function setProvider(uint256 id, address owner_, uint256 stake_, bool active_) external {
        _providers[id] = ProviderConfig({ owner: owner_, stake: stake_, active: active_ });
    }

    function setCompletedCalls(uint256 id, uint32 n) external {
        _completed[id] = n;
    }

    function setSlashedCalls(uint256 id, uint32 n) external {
        _slashed[id] = n;
    }

    function setStake(uint256 id, uint256 stake_) external {
        _providers[id].stake = stake_;
    }

    // -----------------------------------------------------------------------
    // IServiceRegistry implementation
    // -----------------------------------------------------------------------

    function getProvider(uint256 providerId) external view override returns (IServiceRegistry.ProviderView memory) {
        ProviderConfig storage cfg = _providers[providerId];
        return IServiceRegistry.ProviderView({
            owner: cfg.owner,
            signer: address(0),
            stake: cfg.stake,
            pricePerCall: 0,
            maxResponseTime: 0,
            slashBps: 0,
            active: cfg.active
        });
    }

    function slash(uint256, uint256, address) external override {}
    function markCallStarted(uint256) external override {}
    function markCallFinished(uint256) external override {}
    function incCompleted(uint256) external override {}
    function incSlashed(uint256) external override {}

    // -----------------------------------------------------------------------
    // Reputation accessors — called by ReputationLoan via staticcall
    // -----------------------------------------------------------------------

    function completedCalls(uint256 providerId) external view returns (uint32) {
        return _completed[providerId];
    }

    function slashedCalls(uint256 providerId) external view returns (uint32) {
        return _slashed[providerId];
    }
}

// ---------------------------------------------------------------------------
// ReputationLoanTest
// ---------------------------------------------------------------------------

contract ReputationLoanTest is Test {
    // Deployed contracts
    MockUSDC     internal usdc;
    MockRegistry internal registry;
    ReputationLoan internal pool;

    // Actors
    address internal owner    = makeAddr("owner");
    address internal lp       = makeAddr("lp");
    address internal provider = makeAddr("provider");
    address internal stranger = makeAddr("stranger");

    // Defaults
    uint256 internal constant PROVIDER_ID    = 1;
    uint256 internal constant LP_DEPOSIT     = 100_000e6; // 100k USDC
    uint256 internal constant PROVIDER_STAKE = 200_000e6; // 200k stake in registry

    // Constructor defaults (all 0 → contract applies its own defaults)
    uint16  internal constant MIN_HONOR_RATE  = 8_000; // 80%
    uint256 internal constant MIN_CALL_COUNT  = 10;
    uint16  internal constant MAX_LOAN_BPS    = 1_000; // 10% of pool
    uint16  internal constant INTEREST_BPS    = 500;   // 5% APR
    uint32  internal constant LOAN_DURATION   = 90 days;

    // ---------------------------------------------------------------------------
    // setUp — fresh state for every test
    // ---------------------------------------------------------------------------

    function setUp() public {
        usdc     = new MockUSDC();
        registry = new MockRegistry();

        vm.prank(owner);
        pool = new ReputationLoan(
            address(usdc),
            address(registry),
            owner,
            MIN_HONOR_RATE,
            MIN_CALL_COUNT,
            MAX_LOAN_BPS,
            INTEREST_BPS,
            LOAN_DURATION
        );

        // Default provider: active, good reputation
        registry.setProvider(PROVIDER_ID, provider, PROVIDER_STAKE, true);
        registry.setCompletedCalls(PROVIDER_ID, 100);
        registry.setSlashedCalls(PROVIDER_ID, 5);

        // Mint USDC to actors and approve pool
        usdc.mint(lp,       LP_DEPOSIT  * 2);
        usdc.mint(provider, LP_DEPOSIT  * 2);
        usdc.mint(stranger, LP_DEPOSIT);

        vm.prank(lp);
        usdc.approve(address(pool), type(uint256).max);
        vm.prank(provider);
        usdc.approve(address(pool), type(uint256).max);
        vm.prank(stranger);
        usdc.approve(address(pool), type(uint256).max);
    }

    // ===========================================================================
    // Helpers
    // ===========================================================================

    /// LP deposits into pool and returns shares received.
    function _lpDeposit(uint256 amount) internal returns (uint256 shares) {
        uint256 sharesBefore = pool.totalShares();
        vm.prank(lp);
        pool.deposit(amount);
        shares = pool.totalShares() - sharesBefore;
    }

    /// Provider borrows `amount` against PROVIDER_ID and returns loanId.
    function _borrow(uint256 amount) internal returns (uint256 loanId) {
        vm.prank(provider);
        loanId = pool.borrow(PROVIDER_ID, amount);
    }

    // ===========================================================================
    // 1. deposit
    // ===========================================================================

    function test_deposit_success() public {
        uint256 amount = LP_DEPOSIT;
        uint256 lpBalBefore = usdc.balanceOf(lp);
        uint256 poolBalBefore = usdc.balanceOf(address(pool));

        vm.expectEmit(true, false, false, true, address(pool));
        emit ReputationLoan.Deposited(lp, amount, amount); // first deposit: shares = amount

        vm.prank(lp);
        pool.deposit(amount);

        assertEq(usdc.balanceOf(lp),            lpBalBefore - amount,   "lp balance decreased");
        assertEq(usdc.balanceOf(address(pool)),  poolBalBefore + amount, "pool balance increased");
        assertEq(pool.totalAssets(),             amount,                 "totalAssets");
        assertEq(pool.totalShares(),             amount,                 "totalShares (first deposit 1:1)");

        (uint256 shares, ) = pool.lpPositions(lp);
        assertEq(shares, amount, "lp position shares");
    }

    function test_deposit_zeroAmount_reverts() public {
        vm.prank(lp);
        vm.expectRevert(ReputationLoan.InvalidAmount.selector);
        pool.deposit(0);
    }

    function test_deposit_secondDeposit_sharesProRata() public {
        // First deposit by lp
        vm.prank(lp);
        pool.deposit(LP_DEPOSIT);

        // Second depositor gets shares proportional to pool size
        uint256 secondAmount = LP_DEPOSIT / 2;
        uint256 expectedShares = (secondAmount * pool.totalShares()) / pool.totalAssets();

        vm.prank(stranger);
        pool.deposit(secondAmount);

        (uint256 shares, ) = pool.lpPositions(stranger);
        assertEq(shares, expectedShares, "pro-rata shares");
    }

    // ===========================================================================
    // 2. withdraw
    // ===========================================================================

    function test_withdraw_success() public {
        uint256 depositAmount = LP_DEPOSIT;
        vm.prank(lp);
        pool.deposit(depositAmount);

        (uint256 shares, ) = pool.lpPositions(lp);
        uint256 lpBalBefore = usdc.balanceOf(lp);

        vm.expectEmit(true, false, false, true, address(pool));
        emit ReputationLoan.Withdrawn(lp, shares, depositAmount);

        vm.prank(lp);
        pool.withdraw(shares);

        assertEq(usdc.balanceOf(lp), lpBalBefore + depositAmount, "lp got USDC back");
        assertEq(pool.totalShares(), 0, "totalShares zero");
        assertEq(pool.totalAssets(), 0, "totalAssets zero");

        (uint256 sharesAfter, ) = pool.lpPositions(lp);
        assertEq(sharesAfter, 0, "lp position cleared");
    }

    function test_withdraw_moreThanBalance_reverts() public {
        vm.prank(lp);
        pool.deposit(LP_DEPOSIT);

        (uint256 shares, ) = pool.lpPositions(lp);

        vm.prank(lp);
        vm.expectRevert(ReputationLoan.InsufficientShares.selector);
        pool.withdraw(shares + 1);
    }

    function test_withdraw_noPosition_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(ReputationLoan.InsufficientShares.selector);
        pool.withdraw(1);
    }

    function test_withdraw_zeroShares_reverts() public {
        vm.prank(lp);
        vm.expectRevert(ReputationLoan.InvalidAmount.selector);
        pool.withdraw(0);
    }

    // ===========================================================================
    // 3. borrow
    // ===========================================================================

    function test_borrow_success() public {
        _lpDeposit(LP_DEPOSIT);

        uint256 maxLoan = (pool.totalAssets() * pool.maxLoanBps()) / 10_000;
        uint256 borrowAmount = maxLoan;
        uint256 providerBalBefore = usdc.balanceOf(provider);

        vm.expectEmit(true, true, false, true, address(pool));
        emit ReputationLoan.LoanOpened(1, PROVIDER_ID, borrowAmount);

        uint256 loanId = _borrow(borrowAmount);

        assertEq(loanId, 1, "loanId");
        assertEq(pool.loanCount(), 1, "loanCount");
        assertEq(usdc.balanceOf(provider), providerBalBefore + borrowAmount, "provider received USDC");
        assertEq(pool.totalLoaned(), borrowAmount, "totalLoaned");
        assertEq(pool.activeLoan(PROVIDER_ID), loanId, "activeLoan set");

        (uint256 pid, address borrower, uint256 principal,,,, bool active) = pool.loans(loanId);
        assertEq(pid,       PROVIDER_ID,  "loan.providerId");
        assertEq(borrower,  provider,     "loan.borrower");
        assertEq(principal, borrowAmount, "loan.principal");
        assertTrue(active,               "loan.active");
    }

    function test_borrow_honorRateTooLow_reverts() public {
        _lpDeposit(LP_DEPOSIT);

        // 50 completed, 100 slashed → honor rate = 50/150 = 33% < 80%
        registry.setCompletedCalls(PROVIDER_ID, 50);
        registry.setSlashedCalls(PROVIDER_ID, 100);

        vm.prank(provider);
        vm.expectRevert(ReputationLoan.HonorRateTooLow.selector);
        pool.borrow(PROVIDER_ID, 1_000e6);
    }

    function test_borrow_callCountTooLow_reverts() public {
        _lpDeposit(LP_DEPOSIT);

        // Only 5 completed calls (minCallCount = 10)
        registry.setCompletedCalls(PROVIDER_ID, 5);
        registry.setSlashedCalls(PROVIDER_ID, 0);

        vm.prank(provider);
        vm.expectRevert(ReputationLoan.CallHistoryTooLow.selector);
        pool.borrow(PROVIDER_ID, 1_000e6);
    }

    function test_borrow_alreadyHasLoan_reverts() public {
        _lpDeposit(LP_DEPOSIT);
        _borrow(1_000e6);

        vm.prank(provider);
        vm.expectRevert(ReputationLoan.LoanAlreadyExists.selector);
        pool.borrow(PROVIDER_ID, 500e6);
    }

    function test_borrow_amountTooLarge_reverts() public {
        _lpDeposit(LP_DEPOSIT);

        uint256 maxLoan = (pool.totalAssets() * pool.maxLoanBps()) / 10_000;
        uint256 overLimit = maxLoan + 1;

        vm.prank(provider);
        vm.expectRevert(ReputationLoan.LoanTooLarge.selector);
        pool.borrow(PROVIDER_ID, overLimit);
    }

    function test_borrow_notProviderOwner_reverts() public {
        _lpDeposit(LP_DEPOSIT);

        vm.prank(stranger);
        vm.expectRevert(ReputationLoan.BorrowerNotProviderOwner.selector);
        pool.borrow(PROVIDER_ID, 1_000e6);
    }

    function test_borrow_providerNotActive_reverts() public {
        _lpDeposit(LP_DEPOSIT);
        registry.setProvider(PROVIDER_ID, provider, PROVIDER_STAKE, false);

        vm.prank(provider);
        vm.expectRevert(ReputationLoan.ProviderNotActive.selector);
        pool.borrow(PROVIDER_ID, 1_000e6);
    }

    function test_borrow_reputationUnavailable_reverts() public {
        // Deploy a registry that lacks completedCalls/slashedCalls functions
        // so staticcall returns data length == 0 → ReputationUnavailable.
        MockRegistryNoReputation noRep = new MockRegistryNoReputation();
        noRep.setProvider(PROVIDER_ID, provider, PROVIDER_STAKE, true);

        vm.prank(owner);
        ReputationLoan pool2 = new ReputationLoan(
            address(usdc),
            address(noRep),
            owner,
            MIN_HONOR_RATE,
            MIN_CALL_COUNT,
            MAX_LOAN_BPS,
            INTEREST_BPS,
            LOAN_DURATION
        );

        usdc.mint(lp, LP_DEPOSIT * 2);
        vm.prank(lp);
        usdc.approve(address(pool2), type(uint256).max);
        vm.prank(lp);
        pool2.deposit(LP_DEPOSIT);

        vm.prank(provider);
        vm.expectRevert(ReputationLoan.ReputationUnavailable.selector);
        pool2.borrow(PROVIDER_ID, 1_000e6);
    }

    // ===========================================================================
    // 4. repay
    // ===========================================================================

    function test_repay_fullSuccess() public {
        _lpDeposit(LP_DEPOSIT);
        uint256 borrowAmount = 5_000e6;
        uint256 loanId = _borrow(borrowAmount);

        // Warp 30 days into the loan
        skip(30 days);

        uint256 interest = pool.accrueInterest(loanId);
        uint256 totalDue = borrowAmount + interest;

        uint256 providerBalBefore = usdc.balanceOf(provider);
        uint256 poolAssetsBefore  = pool.totalAssets();

        vm.expectEmit(true, false, false, true, address(pool));
        emit ReputationLoan.LoanRepaid(loanId, totalDue);

        vm.prank(provider);
        pool.repay(loanId);

        // Loan closed
        (,,,,,, bool active) = pool.loans(loanId);
        assertFalse(active, "loan inactive after repay");
        assertEq(pool.activeLoan(PROVIDER_ID), 0, "activeLoan cleared");
        assertEq(pool.totalLoaned(), 0, "totalLoaned cleared");

        // Pool absorbed interest
        assertEq(pool.totalAssets(), poolAssetsBefore + interest, "pool gained interest");

        // Provider paid totalDue
        assertEq(usdc.balanceOf(provider), providerBalBefore - totalDue, "provider paid totalDue");
    }

    function test_repay_notBorrower_reverts() public {
        _lpDeposit(LP_DEPOSIT);
        uint256 loanId = _borrow(1_000e6);

        vm.prank(stranger);
        vm.expectRevert(ReputationLoan.NotBorrower.selector);
        pool.repay(loanId);
    }

    function test_repay_loanAlreadyRepaid_reverts() public {
        _lpDeposit(LP_DEPOSIT);
        uint256 loanId = _borrow(1_000e6);

        vm.prank(provider);
        pool.repay(loanId);

        // Second repay: loan is inactive → LoanNotActive
        vm.prank(provider);
        vm.expectRevert(ReputationLoan.LoanNotActive.selector);
        pool.repay(loanId);
    }

    function test_repay_nonExistentLoan_reverts() public {
        vm.prank(provider);
        vm.expectRevert(ReputationLoan.LoanNotActive.selector);
        pool.repay(999);
    }

    // "Partial repay" in this contract means calling repay when loan is
    // inactive (there is no partial-amount API). Verify that a second call
    // on the same loanId after full repayment reverts with LoanNotActive.
    function test_repay_afterFullRepay_reverts() public {
        _lpDeposit(LP_DEPOSIT);
        uint256 loanId = _borrow(1_000e6);

        vm.prank(provider);
        pool.repay(loanId); // full repay

        vm.prank(provider);
        vm.expectRevert(ReputationLoan.LoanNotActive.selector);
        pool.repay(loanId); // second attempt = "partial" after close
    }

    // ===========================================================================
    // 5. liquidate
    // ===========================================================================

    function test_liquidate_success_providerSlashedBelowPrincipal() public {
        _lpDeposit(LP_DEPOSIT);
        uint256 borrowAmount = 5_000e6;
        uint256 loanId = _borrow(borrowAmount);

        // Slash the registry stake so it falls below the loan principal
        registry.setStake(PROVIDER_ID, borrowAmount - 1);

        uint256 assetsBefore = pool.totalAssets();
        uint256 loanedBefore = pool.totalLoaned();

        vm.expectEmit(true, true, false, false, address(pool));
        emit ReputationLoan.LoanLiquidated(loanId, PROVIDER_ID);

        pool.liquidate(loanId); // anyone can liquidate

        (,,,,,, bool active) = pool.loans(loanId);
        assertFalse(active, "loan inactive after liquidation");
        assertEq(pool.activeLoan(PROVIDER_ID), 0, "activeLoan cleared");
        assertEq(pool.totalLoaned(), loanedBefore - borrowAmount, "totalLoaned reduced");
        assertEq(pool.totalAssets(), assetsBefore - borrowAmount, "pool took loss");
    }

    function test_liquidate_loanStillHealthy_reverts() public {
        _lpDeposit(LP_DEPOSIT);
        uint256 borrowAmount = 5_000e6;
        uint256 loanId = _borrow(borrowAmount);

        // Stake is still well above the loan principal
        // (registry stake = PROVIDER_STAKE = 200_000e6 >> 5_000e6)

        vm.expectRevert(ReputationLoan.NotLiquidatable.selector);
        pool.liquidate(loanId);
    }

    function test_liquidate_inactiveLoan_reverts() public {
        _lpDeposit(LP_DEPOSIT);
        uint256 loanId = _borrow(1_000e6);

        vm.prank(provider);
        pool.repay(loanId);

        vm.expectRevert(ReputationLoan.LoanNotActive.selector);
        pool.liquidate(loanId);
    }

    function test_liquidate_stakeExactlyEqualsPrincipal_reverts() public {
        _lpDeposit(LP_DEPOSIT);
        uint256 borrowAmount = 5_000e6;
        uint256 loanId = _borrow(borrowAmount);

        // stake == principal → NOT liquidatable (need stake < principal)
        registry.setStake(PROVIDER_ID, borrowAmount);

        vm.expectRevert(ReputationLoan.NotLiquidatable.selector);
        pool.liquidate(loanId);
    }

    // ===========================================================================
    // 6. accrueInterest — correct calculation after time warp
    // ===========================================================================

    function test_accrueInterest_afterTimeWarp() public {
        _lpDeposit(LP_DEPOSIT);
        uint256 borrowAmount = 10_000e6;
        uint256 loanId = _borrow(borrowAmount);

        uint256 elapsed = 30 days;
        skip(elapsed);

        uint256 expected = (borrowAmount * INTEREST_BPS * elapsed) / (365 days * 10_000);
        uint256 actual   = pool.accrueInterest(loanId);

        assertEq(actual, expected, "interest matches formula");
    }

    function test_accrueInterest_capsAtLoanDuration() public {
        _lpDeposit(LP_DEPOSIT);
        uint256 borrowAmount = 10_000e6;
        uint256 loanId = _borrow(borrowAmount);

        // Warp far beyond loan duration
        skip(LOAN_DURATION + 365 days);

        uint256 expectedCapped = (borrowAmount * INTEREST_BPS * LOAN_DURATION) / (365 days * 10_000);
        uint256 actual         = pool.accrueInterest(loanId);

        assertEq(actual, expectedCapped, "interest capped at loan duration");
    }

    function test_accrueInterest_returnsZeroForInactiveLoan() public {
        _lpDeposit(LP_DEPOSIT);
        uint256 loanId = _borrow(1_000e6);

        vm.prank(provider);
        pool.repay(loanId);

        skip(30 days);
        assertEq(pool.accrueInterest(loanId), 0, "no interest on inactive loan");
    }

    function test_accrueInterest_atZeroTime() public {
        _lpDeposit(LP_DEPOSIT);
        uint256 loanId = _borrow(1_000e6);

        // No time has passed
        assertEq(pool.accrueInterest(loanId), 0, "zero interest at t=0");
    }

    // ===========================================================================
    // 7. getPoolStats — correct values
    // ===========================================================================

    function test_getPoolStats_initialState() public view {
        (uint256 assets, uint256 loaned, uint256 avail, uint256 shares) = pool.getPoolStats();
        assertEq(assets,  0, "assets 0");
        assertEq(loaned,  0, "loaned 0");
        assertEq(avail,   0, "avail 0");
        assertEq(shares,  0, "shares 0");
    }

    function test_getPoolStats_afterDeposit() public {
        vm.prank(lp);
        pool.deposit(LP_DEPOSIT);

        (uint256 assets, uint256 loaned, uint256 avail, uint256 shares) = pool.getPoolStats();
        assertEq(assets, LP_DEPOSIT, "assets");
        assertEq(loaned, 0,          "nothing loaned");
        assertEq(avail,  LP_DEPOSIT, "available == deposited");
        assertEq(shares, LP_DEPOSIT, "shares (first deposit 1:1)");
    }

    function test_getPoolStats_afterBorrow() public {
        _lpDeposit(LP_DEPOSIT);
        uint256 borrowAmount = 5_000e6;
        _borrow(borrowAmount);

        (uint256 assets, uint256 loaned, uint256 avail, uint256 shares) = pool.getPoolStats();
        assertEq(assets, LP_DEPOSIT,            "totalAssets unchanged by borrow");
        assertEq(loaned, borrowAmount,           "totalLoaned");
        assertEq(avail,  LP_DEPOSIT - borrowAmount, "available = pool balance");
        assertEq(shares, LP_DEPOSIT,             "shares unchanged");
    }

    // ===========================================================================
    // 8. Happy path: LP deposits → provider borrows → time passes →
    //    repay with interest → LP earns yield
    // ===========================================================================

    function test_happyPath_lpEarnsYield() public {
        // --- Step 1: LP deposits ---
        uint256 depositAmount = LP_DEPOSIT;
        vm.prank(lp);
        pool.deposit(depositAmount);

        (uint256 lpShares, ) = pool.lpPositions(lp);
        assertEq(lpShares, depositAmount, "LP shares 1:1 on first deposit");

        // --- Step 2: Provider borrows ---
        uint256 borrowAmount = 5_000e6;
        uint256 loanId = _borrow(borrowAmount);
        assertEq(pool.totalLoaned(), borrowAmount);

        // --- Step 3: Time passes (30 days) ---
        uint256 elapsed = 30 days;
        skip(elapsed);

        uint256 interest = pool.accrueInterest(loanId);
        assertTrue(interest > 0, "interest accrued");

        // --- Step 4: Provider repays (must have enough USDC) ---
        // Provider received borrowAmount; totalDue = principal + interest. Top up the interest portion.
        usdc.mint(provider, interest);

        uint256 poolAssetsBefore = pool.totalAssets();

        vm.prank(provider);
        pool.repay(loanId);

        // Loan is closed
        (,,,,,, bool active) = pool.loans(loanId);
        assertFalse(active, "loan closed");

        // Pool absorbed interest → totalAssets increased
        assertEq(pool.totalAssets(), poolAssetsBefore + interest, "pool gained interest");

        // --- Step 5: LP withdraws more than deposited (yield) ---
        uint256 lpBalBefore = usdc.balanceOf(lp);

        vm.prank(lp);
        pool.withdraw(lpShares);

        uint256 lpReceived = usdc.balanceOf(lp) - lpBalBefore;
        assertTrue(lpReceived > depositAmount, "LP received more than deposited (yield)");
        assertEq(lpReceived, depositAmount + interest, "LP received principal + full interest");
    }

    // ===========================================================================
    // 9. Liquidation path: LP deposits → provider borrows →
    //    provider slashed → liquidate
    // ===========================================================================

    function test_liquidationPath_lpTakesLoss() public {
        // --- Step 1: LP deposits ---
        vm.prank(lp);
        pool.deposit(LP_DEPOSIT);

        uint256 assetsAfterDeposit = pool.totalAssets();
        (uint256 lpShares, ) = pool.lpPositions(lp);

        // --- Step 2: Provider borrows ---
        uint256 borrowAmount = 10_000e6;
        uint256 loanId = _borrow(borrowAmount);

        // --- Step 3: Provider stake slashed below principal ---
        registry.setStake(PROVIDER_ID, borrowAmount - 1);

        // --- Step 4: Anyone liquidates ---
        pool.liquidate(loanId);

        (,,,,,, bool active) = pool.loans(loanId);
        assertFalse(active, "loan liquidated");
        assertEq(pool.totalLoaned(), 0, "totalLoaned cleared");
        assertEq(pool.totalAssets(), assetsAfterDeposit - borrowAmount, "pool took loss");

        // --- Step 5: LP withdraws remaining assets (partial recovery) ---
        uint256 lpBalBefore = usdc.balanceOf(lp);

        vm.prank(lp);
        pool.withdraw(lpShares);

        uint256 lpReceived = usdc.balanceOf(lp) - lpBalBefore;
        assertEq(lpReceived, LP_DEPOSIT - borrowAmount, "LP received deposit minus loss");
        assertTrue(lpReceived < LP_DEPOSIT, "LP received less than deposited");
    }

    // ===========================================================================
    // 10. Fuzz: deposit / withdraw round-trip
    // ===========================================================================

    function testFuzz_depositWithdrawRoundTrip(uint256 amount) public {
        // Keep amounts in a realistic range (1 USDC to 10M USDC)
        amount = bound(amount, 1e6, 10_000_000e6);

        usdc.mint(lp, amount);
        vm.prank(lp);
        usdc.approve(address(pool), type(uint256).max);

        vm.prank(lp);
        pool.deposit(amount);

        (uint256 shares, ) = pool.lpPositions(lp);
        uint256 balBefore = usdc.balanceOf(lp);

        vm.prank(lp);
        pool.withdraw(shares);

        // Round-trip: LP gets back exactly what they put in (no loans outstanding)
        assertEq(usdc.balanceOf(lp) - balBefore, amount, "full round-trip");
        assertEq(pool.totalShares(), 0);
        assertEq(pool.totalAssets(), 0);
    }

    // ===========================================================================
    // 11. Fuzz: accrueInterest formula consistency
    // ===========================================================================

    function testFuzz_accrueInterest_formula(uint256 elapsed) public {
        elapsed = bound(elapsed, 0, uint256(LOAN_DURATION) + 365 days);

        _lpDeposit(LP_DEPOSIT);
        uint256 borrowAmount = 10_000e6;
        uint256 loanId = _borrow(borrowAmount);

        skip(elapsed);

        uint256 effectiveElapsed = elapsed > LOAN_DURATION ? LOAN_DURATION : elapsed;
        uint256 expected = (borrowAmount * INTEREST_BPS * effectiveElapsed) / (365 days * 10_000);
        assertEq(pool.accrueInterest(loanId), expected, "formula matches");
    }
}

// ---------------------------------------------------------------------------
// MockRegistryNoReputation — registry that does NOT expose completedCalls /
// slashedCalls, so ReputationLoan's staticcall returns empty data and triggers
// the ReputationUnavailable error path.
// ---------------------------------------------------------------------------
contract MockRegistryNoReputation is IServiceRegistry {
    struct ProviderConfig {
        address owner;
        uint256 stake;
        bool active;
    }

    mapping(uint256 => ProviderConfig) private _providers;

    function setProvider(uint256 id, address owner_, uint256 stake_, bool active_) external {
        _providers[id] = ProviderConfig({ owner: owner_, stake: stake_, active: active_ });
    }

    function getProvider(uint256 providerId) external view override returns (IServiceRegistry.ProviderView memory) {
        ProviderConfig storage cfg = _providers[providerId];
        return IServiceRegistry.ProviderView({
            owner: cfg.owner,
            signer: address(0),
            stake: cfg.stake,
            pricePerCall: 0,
            maxResponseTime: 0,
            slashBps: 0,
            active: cfg.active
        });
    }

    function slash(uint256, uint256, address) external override {}
    function markCallStarted(uint256) external override {}
    function markCallFinished(uint256) external override {}
    function incCompleted(uint256) external override {}
    function incSlashed(uint256) external override {}

    // Intentionally NO completedCalls() / slashedCalls() — triggers ReputationUnavailable
}

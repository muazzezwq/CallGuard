// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IServiceRegistry} from "./interfaces/IServiceRegistry.sol";

// ---------------------------------------------------------------------------
// ERC-4626 Tokenized Vault — minimal interface for Aave Arc yield integration.
// Idle LP liquidity is deposited into an ERC-4626 compliant vault (e.g. Aave Arc
// aUSDC vault on Arc Testnet). setYieldVault(address) activates yield mode;
// passing address(0) disables it. _ensureLiquidity() redeems vault shares
// on demand so borrows and withdrawals always have access to the full pool.
// ---------------------------------------------------------------------------
interface IERC4626Vault {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function balanceOf(address account) external view returns (uint256);
    function previewRedeem(uint256 shares) external view returns (uint256);
    function asset() external view returns (address);
}

contract ReputationLoan is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Loan {
        uint256 providerId;
        address borrower;
        uint256 principal;
        uint256 startTime;
        uint256 duration;
        uint256 repaid;
        bool active;
    }

    struct LPPosition {
        uint256 shares;
        uint256 depositTime;
    }

    error ZeroAddress();
    error InvalidBps();
    error InvalidAmount();
    error InsufficientShares();
    error InsufficientLiquidity();
    error LoanNotActive();
    error NotBorrower();
    error LoanAlreadyExists();
    error BorrowerNotProviderOwner();
    error ProviderNotActive();
    error ReputationUnavailable();
    error HonorRateTooLow();
    error CallHistoryTooLow();
    error LoanTooLarge();
    error NotLiquidatable();

    event Deposited(address indexed lp, uint256 amount, uint256 shares);
    event Withdrawn(address indexed lp, uint256 shares, uint256 amount);
    event LoanOpened(uint256 indexed loanId, uint256 indexed providerId, uint256 amount);
    event LoanRepaid(uint256 indexed loanId, uint256 totalRepaid);
    event LoanLiquidated(uint256 indexed loanId, uint256 indexed providerId);
    event YieldVaultSet(address indexed vault);
    event YieldDeposited(uint256 assets, uint256 shares);
    event YieldRedeemed(uint256 shares, uint256 assets);

    IERC20 public immutable usdc;
    IServiceRegistry public immutable registry;

    /// @notice ERC-4626 yield vault (e.g. Aave Arc aUSDC). address(0) = disabled.
    IERC4626Vault public yieldVault;
    /// @notice Vault shares held by this contract on behalf of the LP pool.
    uint256 public vaultShares;

    uint16 public minHonorRate;
    uint256 public minCallCount;
    uint16 public maxLoanBps;
    uint16 public interestRateBps;
    uint32 public loanDuration;

    mapping(address => LPPosition) public lpPositions;
    mapping(uint256 => Loan) public loans;
    mapping(uint256 => uint256) public activeLoan;

    uint256 public loanCount;
    uint256 public totalShares;
    uint256 public totalAssets;
    uint256 public totalLoaned;

    constructor(
        address _usdc,
        address _registry,
        address _owner,
        uint16 _minHonorRate,
        uint256 _minCallCount,
        uint16 _maxLoanBps,
        uint16 _interestRateBps,
        uint32 _loanDuration
    ) Ownable(_owner) {
        if (_usdc == address(0) || _registry == address(0) || _owner == address(0)) revert ZeroAddress();

        usdc = IERC20(_usdc);
        registry = IServiceRegistry(_registry);

        minHonorRate = _minHonorRate == 0 ? 8_000 : _minHonorRate;
        minCallCount = _minCallCount == 0 ? 10 : _minCallCount;
        maxLoanBps = _maxLoanBps == 0 ? 1_000 : _maxLoanBps;
        interestRateBps = _interestRateBps == 0 ? 500 : _interestRateBps;
        loanDuration = _loanDuration == 0 ? uint32(90 days) : _loanDuration;

        if (minHonorRate > 10_000 || maxLoanBps > 10_000 || interestRateBps > 10_000) revert InvalidBps();
    }

    function setMinHonorRate(uint16 newMinHonorRate) external onlyOwner {
        if (newMinHonorRate > 10_000) revert InvalidBps();
        minHonorRate = newMinHonorRate;
    }

    function setMinCallCount(uint256 newMinCallCount) external onlyOwner {
        minCallCount = newMinCallCount;
    }

    function setMaxLoanBps(uint16 newMaxLoanBps) external onlyOwner {
        if (newMaxLoanBps > 10_000) revert InvalidBps();
        maxLoanBps = newMaxLoanBps;
    }

    function setInterestRateBps(uint16 newInterestRateBps) external onlyOwner {
        if (newInterestRateBps > 10_000) revert InvalidBps();
        interestRateBps = newInterestRateBps;
    }

    function setLoanDuration(uint32 newLoanDuration) external onlyOwner {
        if (newLoanDuration == 0) revert InvalidAmount();
        loanDuration = newLoanDuration;
    }

    /// @notice Set or clear the ERC-4626 yield vault.
    ///         Pass address(0) to disable yield and keep liquidity direct.
    function setYieldVault(address vault) external onlyOwner {
        yieldVault = IERC4626Vault(vault);
        emit YieldVaultSet(vault);
    }

    /// @notice Ensure this contract holds at least `needed` USDC directly.
    ///         Redeems vault shares on demand if direct balance is insufficient.
    function _ensureLiquidity(uint256 needed) internal {
        if (address(yieldVault) == address(0)) return;
        uint256 direct = usdc.balanceOf(address(this));
        if (direct >= needed) return;
        uint256 deficit = needed - direct;
        // Redeem enough shares to cover the deficit.
        uint256 sharesToRedeem = vaultShares;
        // Clamp: don't redeem more than we have.
        uint256 redeemable = yieldVault.previewRedeem(sharesToRedeem);
        if (redeemable > deficit) {
            // Binary approximate: redeem proportional shares.
            sharesToRedeem = (deficit * sharesToRedeem) / redeemable + 1;
            if (sharesToRedeem > vaultShares) sharesToRedeem = vaultShares;
        }
        if (sharesToRedeem == 0) return;
        uint256 redeemed = yieldVault.redeem(sharesToRedeem, address(this), address(this));
        vaultShares -= sharesToRedeem;
        emit YieldRedeemed(sharesToRedeem, redeemed);
    }

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();

        uint256 shares;
        if (totalShares == 0 || totalAssets == 0) {
            shares = amount;
        } else {
            shares = (amount * totalShares) / totalAssets;
            if (shares == 0) revert InvalidAmount();
        }

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Route idle liquidity to yield vault if configured.
        if (address(yieldVault) != address(0)) {
            usdc.approve(address(yieldVault), amount);
            uint256 newShares = yieldVault.deposit(amount, address(this));
            vaultShares += newShares;
            emit YieldDeposited(amount, newShares);
        }

        LPPosition storage position = lpPositions[msg.sender];
        position.shares += shares;
        position.depositTime = block.timestamp;

        totalShares += shares;
        totalAssets += amount;

        emit Deposited(msg.sender, amount, shares);
    }

    function withdraw(uint256 shares) external nonReentrant {
        if (shares == 0) revert InvalidAmount();

        LPPosition storage position = lpPositions[msg.sender];
        if (position.shares < shares) revert InsufficientShares();

        uint256 amount = (shares * totalAssets) / totalShares;
        if (amount == 0) revert InvalidAmount();
        _ensureLiquidity(amount);
        if (usdc.balanceOf(address(this)) < amount) revert InsufficientLiquidity();

        position.shares -= shares;
        totalShares -= shares;
        totalAssets -= amount;

        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, shares, amount);
    }

    function borrow(uint256 providerId, uint256 amount) external nonReentrant returns (uint256 loanId) {
        if (amount == 0) revert InvalidAmount();
        if (activeLoan[providerId] != 0) revert LoanAlreadyExists();

        IServiceRegistry.ProviderView memory provider = registry.getProvider(providerId);
        if (!provider.active) revert ProviderNotActive();
        if (provider.owner != msg.sender) revert BorrowerNotProviderOwner();

        (uint256 completed, uint256 slashed, bool ok) = _readReputation(providerId);
        if (!ok) revert ReputationUnavailable();
        if (completed < minCallCount) revert CallHistoryTooLow();

        uint256 totalCalls = completed + slashed;
        uint256 honorRate = totalCalls == 0 ? 0 : (completed * 10_000) / totalCalls;
        if (honorRate < minHonorRate) revert HonorRateTooLow();

        uint256 maxLoan = (totalAssets * maxLoanBps) / 10_000;
        uint256 stakeBasedCap = (provider.stake * maxLoanBps) / 10_000;
        uint256 effectiveMax = maxLoan < stakeBasedCap ? maxLoan : stakeBasedCap;
        if (amount > effectiveMax) revert LoanTooLarge();
        _ensureLiquidity(amount);
        if (usdc.balanceOf(address(this)) < amount) revert InsufficientLiquidity();

        loanId = ++loanCount;
        loans[loanId] = Loan({
            providerId: providerId,
            borrower: msg.sender,
            principal: amount,
            startTime: block.timestamp,
            duration: loanDuration,
            repaid: 0,
            active: true
        });
        activeLoan[providerId] = loanId;

        totalLoaned += amount;

        // IServiceRegistry does not expose stake increase/decrease hooks.
        // Borrowed USDC is sent to the provider owner, who must manually stake
        // it in ServiceRegistry via their own transaction.
        usdc.safeTransfer(msg.sender, amount);

        emit LoanOpened(loanId, providerId, amount);
    }

    function repay(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        if (!loan.active) revert LoanNotActive();
        if (loan.borrower != msg.sender) revert NotBorrower();

        uint256 elapsed = block.timestamp - loan.startTime;
        if (elapsed > loan.duration) elapsed = loan.duration;

        uint256 interest = (loan.principal * interestRateBps * elapsed) / (365 days * 10_000);
        uint256 totalDue = loan.principal + interest;
        uint256 outstanding = totalDue - loan.repaid;
        if (outstanding == 0) revert InvalidAmount();

        // IServiceRegistry has no decreaseStake function in its public interface.
        // Borrower must source USDC externally (including unstaking manually)
        // and transfer it back to this pool for repayment.
        usdc.safeTransferFrom(msg.sender, address(this), outstanding);

        loan.repaid = totalDue;
        loan.active = false;
        activeLoan[loan.providerId] = 0;

        totalLoaned -= loan.principal;
        totalAssets += interest;

        emit LoanRepaid(loanId, outstanding);
    }

    function liquidate(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        if (!loan.active) revert LoanNotActive();

        IServiceRegistry.ProviderView memory provider = registry.getProvider(loan.providerId);
        uint256 principalOutstanding = loan.principal;
        if (provider.stake >= principalOutstanding) revert NotLiquidatable();

        loan.active = false;
        activeLoan[loan.providerId] = 0;

        totalLoaned -= principalOutstanding;
        totalAssets -= principalOutstanding;

        emit LoanLiquidated(loanId, loan.providerId);
    }

    function accrueInterest(uint256 loanId) public view returns (uint256) {
        Loan memory loan = loans[loanId];
        if (!loan.active) return 0;

        uint256 elapsed = block.timestamp - loan.startTime;
        if (elapsed > loan.duration) elapsed = loan.duration;

        return (loan.principal * interestRateBps * elapsed) / (365 days * 10_000);
    }

    function getPoolStats()
        external
        view
        returns (uint256 _totalAssets, uint256 _totalLoaned, uint256 availableLiquidity, uint256 _totalShares)
    {
        _totalAssets = totalAssets;
        _totalLoaned = totalLoaned;
        availableLiquidity = usdc.balanceOf(address(this));
        _totalShares = totalShares;
    }

    function _readReputation(uint256 providerId) internal view returns (uint256 completed, uint256 slashed, bool ok) {
        (bool okCompleted, bytes memory completedData) =
            address(registry).staticcall(abi.encodeWithSignature("completedCalls(uint256)", providerId));
        (bool okSlashed, bytes memory slashedData) =
            address(registry).staticcall(abi.encodeWithSignature("slashedCalls(uint256)", providerId));

        if (!okCompleted || completedData.length < 32 || !okSlashed || slashedData.length < 32) {
            return (0, 0, false);
        }

        completed = abi.decode(completedData, (uint64));
        slashed = abi.decode(slashedData, (uint64));
        ok = true;
    }
}

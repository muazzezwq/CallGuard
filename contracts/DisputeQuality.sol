// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { IServiceRegistry } from "./interfaces/IServiceRegistry.sol";

interface IServiceRegistryStake is IServiceRegistry {
    function providerIdOf(address owner) external view returns (uint256);
}

contract DisputeQuality is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum Vote {
        None,
        ForCaller,
        ForProvider
    }

    enum Outcome {
        Pending,
        CallerWins,
        ProviderWins,
        Tied
    }

    struct QualityDispute {
        bytes32 callId;
        address caller;
        uint256 providerId;
        uint64 openedAt;
        uint64 votingEndsAt;
        uint256 bond;
        string evidenceUri;
        string responseUri;
        uint256 votesForCaller;
        uint256 votesForProvider;
        Outcome outcome;
        bool finalized;
    }

    error InvalidAddress();
    error InvalidBps();
    error DisputeWindowClosed();
    error DisputeWindowNotStarted();
    error AlreadyDisputed();
    error DisputeNotFound();
    error NotProviderOwner();
    error VoteClosed();
    error InvalidVote();
    error AlreadyVoted();
    error InsufficientStake();
    error AlreadyFinalized();
    error VotingStillOpen();
    error NothingToWithdraw();

    event DisputeOpened(
        uint256 indexed disputeId,
        bytes32 indexed callId,
        address indexed caller,
        uint256 providerId,
        uint64 votingEndsAt,
        string evidenceUri
    );

    event EvidenceSubmitted(uint256 indexed disputeId, address indexed providerOwner, string responseUri);

    event Voted(
        uint256 indexed disputeId,
        address indexed voter,
        Vote choice,
        uint256 stakeWeight,
        uint256 voterBond
    );

    event Finalized(
        uint256 indexed disputeId,
        Outcome outcome,
        uint256 votesForCaller,
        uint256 votesForProvider,
        uint256 voterCount,
        uint256 slashAmount
    );
    event PayoutWithdrawn(address indexed account, uint256 amount);

    IERC20 public immutable usdc;
    IServiceRegistry public immutable registry;
    IServiceRegistryStake internal immutable registryStake;

    uint256 public disputeBond;
    uint256 public voterBond;
    uint256 public minVoterStake;
    uint32 public disputeWindow;
    uint32 public votingWindow;
    uint16 public disputeSlashBps;

    uint256 public disputeCount;

    mapping(bytes32 => uint256) public disputeIdByCallId;
    mapping(uint256 => QualityDispute) public disputes;

    // disputeId => voter => vote side
    mapping(uint256 => mapping(address => Vote)) public votes;

    // disputeId => voter => bond locked for vote
    mapping(uint256 => mapping(address => uint256)) public voterBonds;

    // disputeId => voter => stake weight captured at vote time
    mapping(uint256 => mapping(address => uint256)) public voteWeight;

    // bookkeeping for finalize payouts
    mapping(uint256 => address[]) internal _disputeVoters;
    mapping(uint256 => uint256) public voterCount;
    mapping(uint256 => uint256) public bondsForCallerSide;
    mapping(uint256 => uint256) public bondsForProviderSide;

    mapping(address => uint256) public pendingWithdrawals;

    constructor(
        address _usdc,
        address _registry,
        address _owner,
        uint256 _disputeBond,
        uint256 _voterBond,
        uint256 _minVoterStake,
        uint32 _disputeWindow,
        uint32 _votingWindow,
        uint16 _disputeSlashBps
    ) Ownable(_owner) {
        if (_usdc == address(0) || _registry == address(0)) revert InvalidAddress();
        if (_disputeSlashBps > 10_000) revert InvalidBps();

        usdc = IERC20(_usdc);
        registry = IServiceRegistry(_registry);
        registryStake = IServiceRegistryStake(_registry);

        disputeBond = _disputeBond;
        voterBond = _voterBond;
        minVoterStake = _minVoterStake;
        disputeWindow = _disputeWindow;
        votingWindow = _votingWindow;
        disputeSlashBps = _disputeSlashBps;
    }

    function openDispute(
        bytes32 callId,
        uint256 providerId,
        uint64 settledAt,
        string calldata evidenceUri
    ) external nonReentrant {
        if (block.timestamp < settledAt) revert DisputeWindowNotStarted();
        if (block.timestamp > uint256(settledAt) + disputeWindow) revert DisputeWindowClosed();
        if (disputeIdByCallId[callId] != 0) revert AlreadyDisputed();

        if (disputeBond > 0) {
            usdc.safeTransferFrom(msg.sender, address(this), disputeBond);
        }

        uint256 disputeId = ++disputeCount;
        disputeIdByCallId[callId] = disputeId;

        uint64 votingEndsAt = uint64(block.timestamp + votingWindow);

        disputes[disputeId] = QualityDispute({
            callId: callId,
            caller: msg.sender,
            providerId: providerId,
            openedAt: uint64(block.timestamp),
            votingEndsAt: votingEndsAt,
            bond: disputeBond,
            evidenceUri: evidenceUri,
            responseUri: "",
            votesForCaller: 0,
            votesForProvider: 0,
            outcome: Outcome.Pending,
            finalized: false
        });

        emit DisputeOpened(disputeId, callId, msg.sender, providerId, votingEndsAt, evidenceUri);
    }

    function submitResponseEvidence(uint256 disputeId, string calldata responseUri) external {
        QualityDispute storage d = disputes[disputeId];
        if (d.openedAt == 0) revert DisputeNotFound();
        if (d.finalized) revert AlreadyFinalized();

        IServiceRegistry.ProviderView memory provider = registry.getProvider(d.providerId);
        if (msg.sender != provider.owner) revert NotProviderOwner();

        d.responseUri = responseUri;
        emit EvidenceSubmitted(disputeId, msg.sender, responseUri);
    }

    function vote(uint256 disputeId, Vote choice) external nonReentrant {
        if (choice != Vote.ForCaller && choice != Vote.ForProvider) revert InvalidVote();

        QualityDispute storage d = disputes[disputeId];
        if (d.openedAt == 0) revert DisputeNotFound();
        if (d.finalized) revert AlreadyFinalized();
        if (block.timestamp > d.votingEndsAt) revert VoteClosed();
        if (votes[disputeId][msg.sender] != Vote.None) revert AlreadyVoted();

        uint256 stake = _voterStake(msg.sender);
        if (stake < minVoterStake) revert InsufficientStake();

        if (voterBond > 0) {
            usdc.safeTransferFrom(msg.sender, address(this), voterBond);
        }

        votes[disputeId][msg.sender] = choice;
        voterBonds[disputeId][msg.sender] = voterBond;
        voteWeight[disputeId][msg.sender] = stake;

        _disputeVoters[disputeId].push(msg.sender);
        voterCount[disputeId] += 1;

        if (choice == Vote.ForCaller) {
            d.votesForCaller += stake;
            bondsForCallerSide[disputeId] += voterBond;
        } else {
            d.votesForProvider += stake;
            bondsForProviderSide[disputeId] += voterBond;
        }

        emit Voted(disputeId, msg.sender, choice, stake, voterBond);
    }

    function finalize(uint256 disputeId) external nonReentrant {
        QualityDispute storage d = disputes[disputeId];
        if (d.openedAt == 0) revert DisputeNotFound();
        if (d.finalized) revert AlreadyFinalized();
        if (block.timestamp < d.votingEndsAt) revert VotingStillOpen();

        d.finalized = true;

        uint256 slashAmount = 0;
        uint256 totalVoters = voterCount[disputeId];

        if (totalVoters < 3 || d.votesForCaller == d.votesForProvider) {
            d.outcome = Outcome.Tied;
            _refundCallerAndAllVoters(disputeId, d);
            emit Finalized(disputeId, d.outcome, d.votesForCaller, d.votesForProvider, totalVoters, 0);
            return;
        }

        if (d.votesForCaller > d.votesForProvider) {
            d.outcome = Outcome.CallerWins;

            if (d.bond > 0) {
                pendingWithdrawals[d.caller] += d.bond;
            }

            IServiceRegistry.ProviderView memory provider = registry.getProvider(d.providerId);
            slashAmount = (provider.stake * disputeSlashBps) / 10_000;
            if (slashAmount > 0) {
                registry.slash(d.providerId, slashAmount, address(this));
            }

            uint256 spoils = bondsForProviderSide[disputeId] + slashAmount;
            _payoutWinningVoters(disputeId, Vote.ForCaller, d.votesForCaller, spoils);
        } else {
            d.outcome = Outcome.ProviderWins;

            uint256 spoils = d.bond + bondsForCallerSide[disputeId];
            _payoutWinningVoters(disputeId, Vote.ForProvider, d.votesForProvider, spoils);
        }

        emit Finalized(disputeId, d.outcome, d.votesForCaller, d.votesForProvider, totalVoters, slashAmount);
    }

    function changeWindow(uint32 newWindow) external onlyOwner {
        disputeWindow = newWindow;
    }

    function changeVotingWindow(uint32 newWindow) external onlyOwner {
        votingWindow = newWindow;
    }

    function getDisputeVoters(uint256 disputeId) external view returns (address[] memory) {
        return _disputeVoters[disputeId];
    }

    function withdrawPayout() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pendingWithdrawals[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);

        emit PayoutWithdrawn(msg.sender, amount);
    }

    function _voterStake(address voter) internal view returns (uint256) {
        uint256 providerId = registryStake.providerIdOf(voter);
        if (providerId == 0) return 0;

        IServiceRegistry.ProviderView memory provider = registry.getProvider(providerId);
        if (!provider.active) return 0;

        return provider.stake;
    }

    function _refundCallerAndAllVoters(uint256 disputeId, QualityDispute storage d) internal {
        if (d.bond > 0) {
            pendingWithdrawals[d.caller] += d.bond;
        }

        address[] storage voters_ = _disputeVoters[disputeId];
        uint256 len = voters_.length;

        for (uint256 i = 0; i < len; ++i) {
            address voter = voters_[i];
            uint256 bond = voterBonds[disputeId][voter];
            if (bond > 0) {
                pendingWithdrawals[voter] += bond;
            }
        }
    }

    function _payoutWinningVoters(
        uint256 disputeId,
        Vote winner,
        uint256 totalWinningWeight,
        uint256 spoils
    ) internal {
        if (totalWinningWeight == 0) return;

        address[] storage voters_ = _disputeVoters[disputeId];
        uint256 len = voters_.length;

        uint256 distributedSpoils = 0;
        address lastWinner = address(0);

        for (uint256 i = 0; i < len; ++i) {
            address voter = voters_[i];
            if (votes[disputeId][voter] != winner) continue;

            lastWinner = voter;

            uint256 weight = voteWeight[disputeId][voter];
            uint256 bond = voterBonds[disputeId][voter];

            uint256 reward = 0;
            if (spoils > 0) {
                reward = (spoils * weight) / totalWinningWeight;
                distributedSpoils += reward;
            }

            pendingWithdrawals[voter] += bond + reward;
        }

        if (spoils > distributedSpoils && lastWinner != address(0)) {
            pendingWithdrawals[lastWinner] += spoils - distributedSpoils;
        }
    }
}

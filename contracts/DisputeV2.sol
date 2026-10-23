// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IDisputeV2 } from "./interfaces/IDisputeV2.sol";
import { IPayPerCallV8 } from "./interfaces/IPayPerCallV8.sol";
import { IServiceRegistryV8 } from "./interfaces/IServiceRegistryV8.sol";

/// @title DisputeV2
/// @notice Call-bound arbitration for CallGuard v8.
/// @dev    Unlike v7, this contract never accepts a caller-supplied settlement
///         timestamp. It reads `Call.completedAt` from PayPerCallV8. The first
///         upward slash is held here until the appeal window closes, so a
///         successful provider appeal can return it instead of leaving an
///         irreversible transfer in place.
contract DisputeV2 is IDisputeV2, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error InvalidAddress();
    error InvalidBps();
    error NotArbiter();
    error NotAppealArbiter();
    error NotParty();
    error DisputeNotFound();
    error CallNotCompleted();
    error NotCallCaller();
    error ProviderMismatch();
    error AlreadyDisputed();
    error WindowClosed();
    error ResolutionWindowClosed();
    error ResolutionWindowOpen();
    error AlreadyResolved();
    error AlreadyAppealed();
    error AppealWindowClosed();
    error AppealWindowOpen();
    error NotAppealed();
    error AlreadySettled();

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    IERC20 public immutable usdc;
    IServiceRegistryV8 public immutable registry;
    IPayPerCallV8 public immutable payPerCall;

    address public arbiter;
    address public appealArbiter;
    address public treasury;

    uint256 public disputeBond;
    uint256 public appealBond;
    uint32 public disputeWindow;
    uint32 public appealWindow;
    uint32 public resolutionWindow;
    uint16 public disputeSlashBps;

    uint256 public disputeCount;
    mapping(bytes32 => uint256) public disputeIdByCallId;
    mapping(uint256 => DisputeRecord) internal _disputes;
    mapping(uint256 => address) public appealAppellant;
    mapping(uint256 => Status) public firstDecision;
    mapping(uint256 => uint256) public heldSlash;
    mapping(uint256 => bool) public settled;

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(
        IERC20 _usdc,
        IServiceRegistryV8 _registry,
        IPayPerCallV8 _payPerCall,
        address _arbiter,
        address _appealArbiter,
        address _treasury,
        uint256 _disputeBond,
        uint256 _appealBond,
        uint32 _disputeWindow,
        uint32 _appealWindow,
        uint32 _resolutionWindow,
        uint16 _disputeSlashBps
    ) {
        if (
            address(_usdc) == address(0) || address(_registry) == address(0) || address(_payPerCall) == address(0)
                || _arbiter == address(0) || _appealArbiter == address(0) || _treasury == address(0)
        ) revert InvalidAddress();
        if (_disputeSlashBps > 10_000) revert InvalidBps();

        usdc = _usdc;
        registry = _registry;
        payPerCall = _payPerCall;
        arbiter = _arbiter;
        appealArbiter = _appealArbiter;
        treasury = _treasury;
        disputeBond = _disputeBond;
        appealBond = _appealBond;
        disputeWindow = _disputeWindow;
        appealWindow = _appealWindow;
        resolutionWindow = _resolutionWindow;
        disputeSlashBps = _disputeSlashBps;
    }

    // ---------------------------------------------------------------------
    // Caller actions
    // ---------------------------------------------------------------------

    function openDispute(bytes32 callId, uint256 providerId, string calldata evidenceUri)
        external
        nonReentrant
        returns (uint256 disputeId)
    {
        if (disputeIdByCallId[callId] != 0) revert AlreadyDisputed();

        IPayPerCallV8.Call memory call_ = payPerCall.getCall(callId);
        if (call_.status != IPayPerCallV8.CallStatus.Completed || call_.completedAt == 0) {
            revert CallNotCompleted();
        }
        if (call_.caller != msg.sender) revert NotCallCaller();
        if (call_.providerId != providerId) revert ProviderMismatch();
        if (block.timestamp > uint256(call_.completedAt) + disputeWindow) revert WindowClosed();

        if (disputeBond > 0) {
            usdc.safeTransferFrom(msg.sender, address(this), disputeBond);
        }

        disputeId = ++disputeCount;
        disputeIdByCallId[callId] = disputeId;
        _disputes[disputeId] = DisputeRecord({
            callId: callId,
            caller: msg.sender,
            providerId: providerId,
            openedAt: uint64(block.timestamp),
            resolvedAt: 0,
            appealAt: 0,
            bond: disputeBond,
            appealBond: 0,
            status: Status.Pending,
            evidenceUri: evidenceUri,
            appealUri: ""
        });

        emit DisputeOpened(disputeId, callId, msg.sender, providerId);
    }

    function appeal(uint256 disputeId, string calldata evidenceUri) external nonReentrant {
        DisputeRecord storage d = _dispute(disputeId);
        if (settled[disputeId]) revert AlreadySettled();
        if (d.status == Status.Appealed) revert AlreadyAppealed();
        if (d.status != Status.Upheld && d.status != Status.Rejected) revert NotAppealed();
        if (block.timestamp > uint256(d.resolvedAt) + appealWindow) revert AppealWindowClosed();

        address providerOwner = _providerOwner(d.providerId);
        if (msg.sender != d.caller && msg.sender != providerOwner) revert NotParty();

        if (appealBond > 0) {
            usdc.safeTransferFrom(msg.sender, address(this), appealBond);
        }

        d.appealBond = appealBond;
        d.appealAt = uint64(block.timestamp);
        d.appealUri = evidenceUri;
        d.status = Status.Appealed;
        appealAppellant[disputeId] = msg.sender;

        emit DisputeAppealed(disputeId, evidenceUri);
    }

    function reclaimExpiredBond(uint256 disputeId) external nonReentrant {
        DisputeRecord storage d = _dispute(disputeId);
        if (settled[disputeId]) revert AlreadySettled();
        if (d.status != Status.Pending) revert AlreadyResolved();
        if (block.timestamp <= uint256(d.openedAt) + resolutionWindow) revert ResolutionWindowOpen();

        d.status = Status.Rejected;
        d.resolvedAt = uint64(block.timestamp);
        firstDecision[disputeId] = Status.Rejected;
        settled[disputeId] = true;

        uint256 bond = d.bond;
        if (bond > 0) {
            usdc.safeTransfer(d.caller, bond);
        }

        emit DisputeResolved(disputeId, Status.Rejected, 0);
        emit BondReclaimed(disputeId, d.caller, bond);
    }

    function finalize(uint256 disputeId) external nonReentrant {
        DisputeRecord storage d = _dispute(disputeId);
        if (settled[disputeId]) revert AlreadySettled();
        if (d.status != Status.Upheld && d.status != Status.Rejected) revert NotAppealed();
        if (block.timestamp <= uint256(d.resolvedAt) + appealWindow) revert AppealWindowOpen();

        settled[disputeId] = true;

        uint256 slashAmount = heldSlash[disputeId];
        if (d.status == Status.Upheld && slashAmount > 0) {
            heldSlash[disputeId] = 0;
            usdc.safeTransfer(d.caller, slashAmount);
        }

        emit DisputeFinalized(disputeId, d.status, slashAmount);
    }

    // ---------------------------------------------------------------------
    // Arbiter actions
    // ---------------------------------------------------------------------

    function resolve(uint256 disputeId, bool upheld) external nonReentrant {
        if (msg.sender != arbiter) revert NotArbiter();

        DisputeRecord storage d = _dispute(disputeId);
        if (settled[disputeId]) revert AlreadySettled();
        if (d.status != Status.Pending) revert AlreadyResolved();
        if (block.timestamp > uint256(d.openedAt) + resolutionWindow) revert ResolutionWindowClosed();

        d.resolvedAt = uint64(block.timestamp);

        if (upheld) {
            d.status = Status.Upheld;
            firstDecision[disputeId] = Status.Upheld;

            uint256 slashAmount = _currentDisputeSlash(d.providerId);
            if (slashAmount > 0) {
                heldSlash[disputeId] = slashAmount;
                registry.slash(d.providerId, slashAmount, address(this));
            }

            if (d.bond > 0) {
                usdc.safeTransfer(d.caller, d.bond);
            }
        } else {
            d.status = Status.Rejected;
            firstDecision[disputeId] = Status.Rejected;

            if (d.bond > 0) {
                usdc.safeTransfer(treasury, d.bond);
            }
        }

        emit DisputeResolved(disputeId, d.status, upheld ? heldSlash[disputeId] : 0);
    }

    function resolveAppeal(uint256 disputeId, bool upheld) external nonReentrant {
        if (msg.sender != appealArbiter) revert NotAppealArbiter();

        DisputeRecord storage d = _dispute(disputeId);
        if (settled[disputeId]) revert AlreadySettled();
        if (d.status != Status.Appealed) revert NotAppealed();

        Status first = firstDecision[disputeId];
        address appellant = appealAppellant[disputeId];
        address providerOwner = _providerOwner(d.providerId);

        d.resolvedAt = uint64(block.timestamp);
        d.status = upheld ? Status.AppealUpheld : Status.AppealRejected;
        settled[disputeId] = true;

        // The first upward slash is held in this contract. A successful
        // provider appeal returns it; a confirmed caller win releases it.
        uint256 slashAmount = heldSlash[disputeId];
        if (first == Status.Upheld) {
            if (slashAmount > 0) {
                heldSlash[disputeId] = 0;
                usdc.safeTransfer(upheld ? d.caller : providerOwner, slashAmount);
            }
        } else if (upheld) {
            slashAmount = _currentDisputeSlash(d.providerId);
            if (slashAmount > 0) {
                registry.slash(d.providerId, slashAmount, d.caller);
            }
        }

        // The appeal bond follows the appellant: a winning appellant gets it
        // back, a losing appellant forfeits it to the treasury.
        uint256 bond = d.appealBond;
        if (bond > 0) {
            if (appellant == d.caller) {
                usdc.safeTransfer(upheld ? d.caller : treasury, bond);
            } else {
                usdc.safeTransfer(upheld ? treasury : providerOwner, bond);
            }
        }

        emit AppealResolved(disputeId, d.status, slashAmount);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setArbiter(address next) external {
        if (msg.sender != arbiter) revert NotArbiter();
        if (next == address(0)) revert InvalidAddress();
        emit ArbiterChanged(arbiter, next);
        arbiter = next;
    }

    function setAppealArbiter(address next) external {
        if (msg.sender != arbiter) revert NotArbiter();
        if (next == address(0)) revert InvalidAddress();
        emit AppealArbiterChanged(appealArbiter, next);
        appealArbiter = next;
    }

    function setTreasury(address next) external {
        if (msg.sender != arbiter) revert NotArbiter();
        if (next == address(0)) revert InvalidAddress();
        emit TreasuryChanged(treasury, next);
        treasury = next;
    }

    function setDisputeBond(uint256 next) external {
        if (msg.sender != arbiter) revert NotArbiter();
        disputeBond = next;
    }

    function setAppealBond(uint256 next) external {
        if (msg.sender != arbiter) revert NotArbiter();
        appealBond = next;
    }

    function setDisputeSlashBps(uint16 next) external {
        if (msg.sender != arbiter) revert NotArbiter();
        if (next > 10_000) revert InvalidBps();
        disputeSlashBps = next;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getDispute(uint256 disputeId) external view returns (DisputeRecord memory) {
        return _disputes[disputeId];
    }

    function getDisputeByCallId(bytes32 callId) external view returns (DisputeRecord memory) {
        uint256 id = disputeIdByCallId[callId];
        if (id == 0) revert DisputeNotFound();
        return _disputes[id];
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _dispute(uint256 disputeId) internal view returns (DisputeRecord storage d) {
        d = _disputes[disputeId];
        if (d.openedAt == 0) revert DisputeNotFound();
    }

    function _providerOwner(uint256 providerId) internal view returns (address) {
        return registry.getProvider(providerId).owner;
    }

    function _currentDisputeSlash(uint256 providerId) internal view returns (uint256) {
        uint256 stake = registry.getProvider(providerId).stake;
        return (stake * disputeSlashBps) / 10_000;
    }
}

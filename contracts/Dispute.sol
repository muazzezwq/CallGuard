// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Dispute
/// @notice Off-chain evidence arbitration layer for CallGuard.
///         When a caller believes the provider's response was low-quality
///         (wrong data, malformed payload, off-topic) they can open a
///         dispute within the dispute window.  An arbiter (initially the
///         deployer; governance can change it) reviews off-chain evidence
///         and calls resolve() to either uphold or reject the dispute.
///
///         Economic design:
///         • Caller locks a small bond (disputeBond) to deter spam.
///         • If dispute is upheld: bond returned + provider slashed an
///           additional disputeSlashBps of their stake via the registry.
///         • If dispute is rejected: bond forfeited to the arbiter treasury.
///
///         This contract does NOT re-settle the escrow — that was already
///         settled by PayPerCall.  It only controls the reputation slash.

interface IServiceRegistry {
    function slash(uint256 providerId, uint256 amount) external;
    function getProvider(uint256 providerId) external view returns (
        address owner,
        address signer,
        uint256 stake,
        uint256 pricePerCall,
        uint32 maxResponseTime,
        uint32 slashBps,
        bool active
    );
}

contract Dispute is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    error NotCaller();
    error WindowClosed();
    error AlreadyDisputed();
    error NotArbiter();
    error AlreadyResolved();
    error BondTooLow();
    error DisputeNotFound();

    // -----------------------------------------------------------------------
    // Types
    // -----------------------------------------------------------------------

    enum Status { Pending, Upheld, Rejected }

    struct DisputeRecord {
        bytes32  callId;
        address  caller;
        uint256  providerId;
        uint64   openedAt;
        uint256  bond;
        Status   status;
        string   evidenceUri; // IPFS CID or URL of evidence document
    }

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------

    IERC20            public immutable usdc;
    IServiceRegistry  public immutable registry;

    address public arbiter;
    address public treasury;

    uint256 public disputeBond;          // USDC wei required to open a dispute
    uint32  public disputeWindow;        // seconds after call settlement
    uint16  public disputeSlashBps;      // extra slash % on upheld dispute (max 10000)

    uint256 public disputeCount;
    mapping(bytes32 => uint256) public disputeIdByCallId;
    mapping(uint256 => DisputeRecord) public disputes;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event DisputeOpened(uint256 indexed disputeId, bytes32 indexed callId, address indexed caller, uint256 providerId);
    event DisputeResolved(uint256 indexed disputeId, Status status, uint256 slashAmount);
    event ArbiterChanged(address indexed prev, address indexed next);
    event BondUpdated(uint256 prev, uint256 next);

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    constructor(
        address _usdc,
        address _registry,
        address _arbiter,
        address _treasury,
        uint256 _disputeBond,
        uint32  _disputeWindow,
        uint16  _disputeSlashBps
    ) {
        require(_usdc      != address(0), "bad usdc");
        require(_registry  != address(0), "bad registry");
        require(_arbiter   != address(0), "bad arbiter");
        require(_treasury  != address(0), "bad treasury");
        require(_disputeSlashBps <= 10000, "bps overflow");

        usdc             = IERC20(_usdc);
        registry         = IServiceRegistry(_registry);
        arbiter          = _arbiter;
        treasury         = _treasury;
        disputeBond      = _disputeBond;
        disputeWindow    = _disputeWindow;
        disputeSlashBps  = _disputeSlashBps;
    }

    // -----------------------------------------------------------------------
    // Caller actions
    // -----------------------------------------------------------------------

    /// @notice Open a dispute for a settled call.
    /// @param callId       On-chain call identifier (bytes32).
    /// @param providerId   Provider that served the call.
    /// @param settledAt    Unix timestamp when submitReceipt was mined.
    /// @param evidenceUri  IPFS CID or URL pointing to evidence document.
    function openDispute(
        bytes32 callId,
        uint256 providerId,
        uint64  settledAt,
        string  calldata evidenceUri
    ) external nonReentrant {
        if (block.timestamp > settledAt + disputeWindow) revert WindowClosed();
        if (disputeIdByCallId[callId] != 0)              revert AlreadyDisputed();

        // Pull bond from caller
        if (disputeBond > 0) {
            usdc.safeTransferFrom(msg.sender, address(this), disputeBond);
        }

        uint256 id = ++disputeCount;
        disputeIdByCallId[callId] = id;
        disputes[id] = DisputeRecord({
            callId:      callId,
            caller:      msg.sender,
            providerId:  providerId,
            openedAt:    uint64(block.timestamp),
            bond:        disputeBond,
            status:      Status.Pending,
            evidenceUri: evidenceUri
        });

        emit DisputeOpened(id, callId, msg.sender, providerId);
    }

    // -----------------------------------------------------------------------
    // Arbiter actions
    // -----------------------------------------------------------------------

    /// @notice Resolve a pending dispute.
    /// @param disputeId  ID returned when the dispute was opened.
    /// @param upheld     true = caller wins; false = provider cleared.
    function resolve(uint256 disputeId, bool upheld) external nonReentrant {
        if (msg.sender != arbiter)          revert NotArbiter();

        DisputeRecord storage d = disputes[disputeId];
        if (d.openedAt == 0)                revert DisputeNotFound();
        if (d.status != Status.Pending)     revert AlreadyResolved();

        uint256 slashAmount = 0;

        if (upheld) {
            d.status = Status.Upheld;

            // Return bond to caller
            if (d.bond > 0) usdc.safeTransfer(d.caller, d.bond);

            // Slash provider additional bps
            (, , uint256 stake, , , , ) = registry.getProvider(d.providerId);
            slashAmount = stake * disputeSlashBps / 10000;
            if (slashAmount > 0) {
                registry.slash(d.providerId, slashAmount);
            }
        } else {
            d.status = Status.Rejected;

            // Forfeit bond to treasury
            if (d.bond > 0) usdc.safeTransfer(treasury, d.bond);
        }

        emit DisputeResolved(disputeId, d.status, slashAmount);
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    function setArbiter(address next) external {
        if (msg.sender != arbiter) revert NotArbiter();
        emit ArbiterChanged(arbiter, next);
        arbiter = next;
    }

    function setDisputeBond(uint256 next) external {
        if (msg.sender != arbiter) revert NotArbiter();
        emit BondUpdated(disputeBond, next);
        disputeBond = next;
    }

    // -----------------------------------------------------------------------
    // View helpers
    // -----------------------------------------------------------------------

    function getDispute(uint256 disputeId) external view returns (DisputeRecord memory) {
        return disputes[disputeId];
    }

    function getDisputeByCallId(bytes32 callId) external view returns (DisputeRecord memory) {
        uint256 id = disputeIdByCallId[callId];
        if (id == 0) revert DisputeNotFound();
        return disputes[id];
    }
}

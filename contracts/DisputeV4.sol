// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IDisputeV2 } from "./interfaces/IDisputeV2.sol";
import { IPayPerCallV8 } from "./interfaces/IPayPerCallV8.sol";
import { IServiceRegistryV8 } from "./interfaces/IServiceRegistryV8.sol";

/// @title DisputeV4
/// @notice Call-bound arbitration for CallGuard v8, with the slash escrowed at
///         the moment the dispute opens.
/// @dev    DisputeV2 read the provider stake only when the arbiter resolved. A
///         provider could therefore `deactivate`, wait the 1 hour registry
///         cooldown, `unstake`, and leave nothing to slash: an upheld quality
///         dispute then held `0` and paid the caller nothing. `unstake` only
///         guards `pendingCalls`, and `disputeWindow` (7 days) is far longer than
///         the cooldown, so the escape was open for every completed call.
///
///         V3 moves the slash to `openDispute`: the stake is cut immediately and
///         the money is escrowed in this contract until the dispute settles, so
///         the provider cannot withdraw it. The amount is fixed at open time,
///         which also makes the penalty predictable instead of depending on
///         activity that happens between the receipt and the decision.
///
///         V4 is a faithful port of V3's money flow. It adds two constructor
///         wires: the `SLAEvidenceRegistryV2` (`evidence`), from which
///         `openDispute` snapshots every configured evidence claim, and the
///         previous arbitration contract (`legacyDispute`), against which open
///         legacy disputes will be checked. The snapshot is written at open and
///         read by nobody in the money paths: it can never change the bonds,
///         the slash or a verdict. The legacy-guard itself is a later task.
contract DisputeV4 is IDisputeV2, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant MAX_EVIDENCE_KINDS = 8;

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
    error TooManyKinds();
    error DuplicateKind();

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @notice Emitted when the slash is escrowed at open time.
    event SlashHeld(uint256 indexed disputeId, uint256 amount);

    event EvidenceKindsSet(bytes32[] kinds);

    /// @notice One configured kind had an anchored claim at open. `bound` is
    ///         false for a present claim that does not bind the call's response.
    event EvidenceLinked(
        uint256 indexed disputeId, bytes32 indexed kind, bytes32 claimHash, uint8 mode, bool bound
    );

    /// @notice One configured kind had nothing anchored for this call.
    event EvidenceAbsent(uint256 indexed disputeId, bytes32 indexed kind, AbsentReason reason);

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Why a snapshot row failed to bind, in evaluation order.
    /// @dev    Sixth value `VerifierNotBinding` extends the five planned
    ///         originally: a `Proof`-mode kind whose wiring recorded
    ///         `bindsResponse == false` would otherwise read "present, not
    ///         bound, `None`", which tells a reader nothing. A `Signature`-mode
    ///         kind can never be `bound`, even though `bindsResponse` is true
    ///         for it by construction.
    enum AbsentReason {
        None,
        NoVerifier,
        NoAnchor,
        WrongResponse,
        ModeIsSignature,
        VerifierNotBinding
    }

    /// @notice One configured evidence kind, as seen at the moment the dispute
    ///         opened. Written once at open and read by nobody in the money
    ///         paths: it cannot change `disputeBond`, the slash or a verdict.
    ///         `reason` is `None` exactly when `bound` is true, and otherwise
    ///         names the first check that failed.
    struct LinkedEvidence {
        bytes32 kind;
        bytes32 claimHash;
        bytes32 responseHash;
        bytes32 statementHash;
        bytes32 assumptionHash;
        address verifier;
        uint64 anchoredAt;
        uint8 mode;
        bool bound;
        bool present;
        AbsentReason reason;
    }

    // ---------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------

    IERC20 public immutable usdc;
    IServiceRegistryV8 public immutable registry;
    IPayPerCallV8 public immutable payPerCall;

    /// @notice Anchored-claim registry `openDispute` will snapshot evidence from.
    ISLAEvidenceV2 public immutable evidence;

    /// @notice The previous arbitration contract, for legacy-dispute checks.
    IDisputeV2 public immutable legacyDispute;

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

    /// @notice Claim kinds configured by the arbiter that `openDispute` snapshots.
    bytes32[] private _evidenceKinds;
    mapping(uint256 => LinkedEvidence[]) private _evidenceOf;

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
        uint16 _disputeSlashBps,
        ISLAEvidenceV2 _evidence,
        IDisputeV2 _legacyDispute
    ) {
        if (
            address(_usdc) == address(0) || address(_registry) == address(0) || address(_payPerCall) == address(0)
                || _arbiter == address(0) || _appealArbiter == address(0) || _treasury == address(0)
        ) revert InvalidAddress();
        if (address(_evidence) == address(0) || address(_legacyDispute) == address(0)) revert InvalidAddress();
        if (_disputeSlashBps > 10_000) revert InvalidBps();

        usdc = _usdc;
        registry = _registry;
        payPerCall = _payPerCall;
        evidence = _evidence;
        legacyDispute = _legacyDispute;
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

        // Escrow the penalty now. Doing this at resolution time is what let a
        // provider unstake before the decision and walk away from the claim.
        uint256 slashAmount = _currentDisputeSlash(providerId);
        if (slashAmount > 0) {
            heldSlash[disputeId] = slashAmount;
            registry.slash(providerId, slashAmount, address(this));
            emit SlashHeld(disputeId, slashAmount);
        }

        // The snapshot runs only after the escrow for one reason: this block
        // must never be able to skip or fail the money move above. It reads
        // pure storage from a fixed immutable registry and reverts nowhere.
        _snapshotEvidence(disputeId, callId, call_.responseHash);

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

        // No decision was reached, so the escrowed slash goes back to the
        // provider. Silence from the arbiter must not cost either party money.
        uint256 slashAmount = heldSlash[disputeId];
        if (slashAmount > 0) {
            heldSlash[disputeId] = 0;
            usdc.safeTransfer(_providerOwner(d.providerId), slashAmount);
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
        if (slashAmount > 0) {
            heldSlash[disputeId] = 0;
            // The escrow is the same in both directions, so a rejected claim
            // returns it instead of leaving it stranded in this contract.
            usdc.safeTransfer(d.status == Status.Upheld ? d.caller : _providerOwner(d.providerId), slashAmount);
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

        d.resolvedAt = uint64(block.timestamp);
        d.status = upheld ? Status.AppealUpheld : Status.AppealRejected;
        settled[disputeId] = true;

        // Both outcomes move the same escrow. `upheld` means the caller's claim
        // wins, whether or not a first decision had already gone the other way.
        address providerOwner = _providerOwner(d.providerId);
        address appellant = appealAppellant[disputeId];

        uint256 slashAmount = heldSlash[disputeId];
        if (slashAmount > 0) {
            heldSlash[disputeId] = 0;
            usdc.safeTransfer(upheld ? d.caller : providerOwner, slashAmount);
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

    /// @notice Sets which claim kinds `openDispute` snapshots, bounded to 8 so a
    ///         dispute open stays within one cheap loop.
    /// @dev    Arbiter-gated like every other admin lever in this contract.
    ///         A duplicated kind would render twice in the UI as if it were two
    ///         claims, so duplicates revert. An empty array is legal and means
    ///         "snapshot nothing": `openDispute` then performs zero external
    ///         calls, which is the state of a fresh deployment.
    function setEvidenceKinds(bytes32[] calldata kinds) external {
        if (msg.sender != arbiter) revert NotArbiter();
        if (kinds.length > MAX_EVIDENCE_KINDS) revert TooManyKinds();
        for (uint256 i = 0; i < kinds.length; ++i) {
            for (uint256 j = i + 1; j < kinds.length; ++j) {
                if (kinds[i] == kinds[j]) revert DuplicateKind();
            }
        }
        delete _evidenceKinds;
        for (uint256 i = 0; i < kinds.length; ++i) {
            _evidenceKinds.push(kinds[i]);
        }
        emit EvidenceKindsSet(kinds);
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

    /// @notice Slash that `openDispute` would escrow right now for a provider.
    function previewSlash(uint256 providerId) external view returns (uint256) {
        return _currentDisputeSlash(providerId);
    }

    /// @notice Claim kinds `openDispute` snapshots, in configured order.
    function evidenceKinds() external view returns (bytes32[] memory) {
        return _evidenceKinds;
    }

    /// @notice The evidence snapshot written once at open and never re-read by
    ///         `resolve`, `resolveAppeal`, `finalize` or `reclaimExpiredBond`.
    function evidenceOf(uint256 disputeId) external view returns (LinkedEvidence[] memory) {
        return _evidenceOf[disputeId];
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

    /// @notice Snapshots every configured evidence kind for the disputed call.
    /// @dev    No `try/catch`: `evidence` is a fixed immutable address of the
    ///         reviewed `SLAEvidenceRegistryV2`, whose `getEvidence`/`modeOf`/
    ///         `bindsResponse` are pure storage reads that cannot revert, and
    ///         with the default empty `evidenceKinds` this performs zero
    ///         external calls — so disputes open even before any kind is wired.
    ///         `present` means "something is anchored for this call and kind"
    ///         and is independent of `bound`. Reason precedence is fixed,
    ///         first failing wins: mode 0 → `NoVerifier`, never anchored →
    ///         `NoAnchor`, stored response mismatch → `WrongResponse`,
    ///         signature mode → `ModeIsSignature`, proof mode without a
    ///         response-binding verifier → `VerifierNotBinding`, else `bound`.
    function _snapshotEvidence(uint256 disputeId, bytes32 callId, bytes32 responseHash) private {
        bytes32[] memory kinds = _evidenceKinds;
        if (kinds.length == 0) return;

        LinkedEvidence[] storage rows = _evidenceOf[disputeId];
        for (uint256 i = 0; i < kinds.length; ++i) {
            bytes32 kind = kinds[i];
            uint8 mode = evidence.modeOf(kind);
            ISLAEvidenceV2.Evidence memory stored;
            bool present;
            bool bound;
            AbsentReason absent = AbsentReason.None;

            if (mode == 0) {
                absent = AbsentReason.NoVerifier;
            } else {
                stored = evidence.getEvidence(callId, kind);
                present = stored.anchoredAt != 0 && stored.claimHash != bytes32(0);

                if (!present) {
                    absent = AbsentReason.NoAnchor;
                } else if (stored.responseHash != responseHash) {
                    absent = AbsentReason.WrongResponse;
                } else if (mode == 1) {
                    absent = AbsentReason.ModeIsSignature;
                } else if (!evidence.bindsResponse(kind)) {
                    absent = AbsentReason.VerifierNotBinding;
                } else {
                    bound = true;
                }
            }

            LinkedEvidence memory row;
            row.kind = kind;
            row.claimHash = stored.claimHash;
            row.responseHash = stored.responseHash;
            row.statementHash = stored.statementHash;
            row.assumptionHash = stored.assumptionHash;
            row.verifier = stored.verifier;
            row.anchoredAt = stored.anchoredAt;
            row.mode = mode;
            row.bound = bound;
            row.present = present;
            row.reason = absent;
            rows.push(row);

            // At most one of the two fires per kind: a present claim reports
            // itself with `bound`, only an absent one reports why it is absent.
            if (present) {
                emit EvidenceLinked(disputeId, kind, stored.claimHash, mode, bound);
            } else {
                emit EvidenceAbsent(disputeId, kind, absent);
            }
        }
    }

    function _currentDisputeSlash(uint256 providerId) internal view returns (uint256) {
        uint256 stake = registry.getProvider(providerId).stake;
        return (stake * disputeSlashBps) / 10_000;
    }
}

/// @title ISLAEvidenceV2
/// @notice Minimal evidence-registry surface DisputeV4 needs. `openDispute` reads
///         `getEvidence` to snapshot the anchored claim into the dispute, and
///         `modeOf`/`bindsResponse` resolve why an anchored claim is unbound.
///         Declared here so the dispute never imports the concrete registry
///         contract.
interface ISLAEvidenceV2 {
    struct Evidence {
        bytes32 kind;
        bytes32 claimHash;
        bytes32 responseHash;
        bytes32 statementHash;
        bytes32 assumptionHash;
        address verifier;
        uint64 anchoredAt;
    }

    function getEvidence(bytes32 callId, bytes32 kind) external view returns (Evidence memory);

    function modeOf(bytes32 kind) external view returns (uint8);

    function bindsResponse(bytes32 kind) external view returns (bool);
}

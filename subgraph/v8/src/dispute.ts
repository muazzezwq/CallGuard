import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  AppealResolved,
  BondReclaimed,
  DisputeAppealed,
  DisputeFinalized,
  DisputeOpened,
  DisputeResolved,
  EvidenceAbsent,
  EvidenceLinked,
  SlashHeld,
} from "../generated/DisputeV4/DisputeV4";
import { DisputeEvidence, DisputeRecord } from "../generated/schema";

function statusName(status: i32): string {
  if (status == 1) return "PENDING";
  if (status == 2) return "UPHELD";
  if (status == 3) return "REJECTED";
  if (status == 4) return "APPEALED";
  if (status == 5) return "APPEAL_UPHELD";
  if (status == 6) return "APPEAL_REJECTED";
  return "NONE";
}

/** `AbsentReason` in `DisputeV4`, in declaration order. */
function absentReasonName(reason: i32): string {
  if (reason == 0) return "None";
  if (reason == 1) return "NoVerifier";
  if (reason == 2) return "NoAnchor";
  if (reason == 3) return "WrongResponse";
  if (reason == 4) return "ModeIsSignature";
  if (reason == 5) return "VerifierNotBinding";
  return "Unknown";
}

/**
 * `SlashHeld` is emitted before `DisputeOpened` in the same transaction, so the
 * row is created by whichever handler runs first and filled by the other. A
 * missing callId at this point is not an error: `DisputeOpened` supplies it.
 */
export function handleSlashHeld(event: SlashHeld): void {
  let id = event.params.disputeId.toString();
  let record = DisputeRecord.load(id);
  if (record == null) {
    record = new DisputeRecord(id);
    record.disputeId = event.params.disputeId;
    record.callId = Bytes.empty();
    record.caller = Bytes.empty();
    record.providerId = BigInt.fromI32(0);
    record.status = "PENDING";
    record.slashAmount = BigInt.fromI32(0);
    record.openedAt = event.block.timestamp;
    record.resolvedAt = null;
    record.appealAt = null;
    record.finalizedAt = null;
    record.bondReclaimedAt = null;
    record.evidenceUri = null;
    record.txHash = event.transaction.hash;
  }
  record.heldSlash = event.params.amount;
  record.save();
}

export function handleDisputeOpened(event: DisputeOpened): void {
  let record = DisputeRecord.load(event.params.disputeId.toString());
  if (record == null) {
    record = new DisputeRecord(event.params.disputeId.toString());
    record.disputeId = event.params.disputeId;
    record.slashAmount = BigInt.fromI32(0);
    record.heldSlash = BigInt.fromI32(0);
    record.resolvedAt = null;
    record.appealAt = null;
    record.finalizedAt = null;
    record.bondReclaimedAt = null;
    record.evidenceUri = null;
  }
  record.callId = event.params.callId;
  record.caller = event.params.caller;
  record.providerId = event.params.providerId;
  record.status = "PENDING";
  record.openedAt = event.block.timestamp;
  record.txHash = event.transaction.hash;
  record.save();
}

export function handleDisputeResolved(event: DisputeResolved): void {
  let record = DisputeRecord.load(event.params.disputeId.toString());
  if (record == null) return;

  record.status = statusName(event.params.status);
  record.slashAmount = event.params.slashAmount;
  record.resolvedAt = event.block.timestamp;
  record.save();
}

export function handleDisputeAppealed(event: DisputeAppealed): void {
  let record = DisputeRecord.load(event.params.disputeId.toString());
  if (record == null) return;

  record.status = "APPEALED";
  record.appealAt = event.block.timestamp;
  record.evidenceUri = event.params.evidenceUri;
  record.save();
}

export function handleAppealResolved(event: AppealResolved): void {
  let record = DisputeRecord.load(event.params.disputeId.toString());
  if (record == null) return;

  record.status = statusName(event.params.status);
  record.slashAmount = event.params.slashAmount;
  record.resolvedAt = event.block.timestamp;
  record.save();
}

export function handleDisputeFinalized(event: DisputeFinalized): void {
  let record = DisputeRecord.load(event.params.disputeId.toString());
  if (record == null) return;

  record.status = statusName(event.params.status);
  record.slashAmount = event.params.slashAmount;
  record.finalizedAt = event.block.timestamp;
  if (!record.resolvedAt) {
    record.resolvedAt = event.block.timestamp;
  }
  record.save();
}

export function handleBondReclaimed(event: BondReclaimed): void {
  let record = DisputeRecord.load(event.params.disputeId.toString());
  if (record == null) return;

  record.bondReclaimedAt = event.block.timestamp;
  record.save();
}

export function handleEvidenceLinked(event: EvidenceLinked): void {
  let disputeId = event.params.disputeId.toString();
  let evidence = new DisputeEvidence(disputeId + "-" + event.params.kind.toHexString());
  evidence.dispute = disputeId;
  evidence.kind = event.params.kind;
  evidence.present = true;
  evidence.bound = event.params.bound;
  evidence.reason = event.params.bound ? "None" : "NotBound";
  evidence.claimHash = event.params.claimHash;
  evidence.mode = event.params.mode;
  evidence.txHash = event.transaction.hash;
  evidence.blockNumber = event.block.number;
  evidence.save();
}

export function handleEvidenceAbsent(event: EvidenceAbsent): void {
  let disputeId = event.params.disputeId.toString();
  let evidence = new DisputeEvidence(disputeId + "-" + event.params.kind.toHexString());
  evidence.dispute = disputeId;
  evidence.kind = event.params.kind;
  evidence.present = false;
  evidence.bound = false;
  evidence.reason = absentReasonName(event.params.reason);
  evidence.claimHash = null;
  evidence.mode = 0;
  evidence.txHash = event.transaction.hash;
  evidence.blockNumber = event.block.number;
  evidence.save();
}

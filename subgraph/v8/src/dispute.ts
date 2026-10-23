import { BigInt } from "@graphprotocol/graph-ts";
import {
  AppealResolved,
  DisputeAppealed,
  DisputeFinalized,
  DisputeOpened,
  DisputeResolved,
} from "../generated/DisputeV2/DisputeV2";
import { DisputeRecord } from "../generated/schema";

function statusName(status: i32): string {
  if (status == 1) return "PENDING";
  if (status == 2) return "UPHELD";
  if (status == 3) return "REJECTED";
  if (status == 4) return "APPEALED";
  if (status == 5) return "APPEAL_UPHELD";
  if (status == 6) return "APPEAL_REJECTED";
  return "NONE";
}

export function handleDisputeOpened(event: DisputeOpened): void {
  let record = new DisputeRecord(event.params.disputeId.toString());
  record.disputeId = event.params.disputeId;
  record.callId = event.params.callId;
  record.caller = event.params.caller;
  record.providerId = event.params.providerId;
  record.status = "PENDING";
  record.slashAmount = BigInt.fromI32(0);
  record.openedAt = event.block.timestamp;
  record.resolvedAt = null;
  record.appealAt = null;
  record.evidenceUri = null;
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
  if (!record.resolvedAt) {
    record.resolvedAt = event.block.timestamp;
  }
  record.save();
}

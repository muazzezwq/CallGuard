import { BigInt } from "@graphprotocol/graph-ts";
import { DisputeOpened, DisputeResolved } from "../generated/Dispute/Dispute";
import { DisputeRecord } from "../generated/schema";

export function handleDisputeOpened(event: DisputeOpened): void {
  const id = event.params.disputeId.toString();
  let d = new DisputeRecord(id);
  d.disputeId   = event.params.disputeId;
  d.callId      = event.params.callId;
  d.caller      = event.params.caller;
  d.providerId  = event.params.providerId;
  d.status      = "Pending";
  d.slashAmount = BigInt.fromI32(0);
  d.openedAt    = event.block.timestamp;
  d.resolvedAt  = null;
  d.txHash      = event.transaction.hash;
  d.save();
}

export function handleDisputeResolved(event: DisputeResolved): void {
  const id = event.params.disputeId.toString();
  let d = DisputeRecord.load(id);
  if (!d) return;
  // 0=Pending 1=Upheld 2=Rejected
  const s = event.params.status;
  d.status      = s == 1 ? "Upheld" : s == 2 ? "Rejected" : "Pending";
  d.slashAmount = event.params.slashAmount;
  d.resolvedAt  = event.block.timestamp;
  d.save();
}

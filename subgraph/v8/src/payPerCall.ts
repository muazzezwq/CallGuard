import { BigInt } from "@graphprotocol/graph-ts";
import {
  CallSlashed,
  CallStarted,
  ReceiptSubmitted,
} from "../generated/PayPerCallV8/PayPerCallV8";
import { Call } from "../generated/schema";

export function handleCallStarted(event: CallStarted): void {
  let call = new Call(event.params.callId.toHexString());
  call.provider = event.params.providerId.toString();
  call.providerId = event.params.providerId;
  call.caller = event.params.caller;
  call.amount = event.params.amount;
  call.requestHash = event.params.requestHash;
  call.responseHash = null;
  call.status = "STARTED";
  call.refunded = BigInt.fromI32(0);
  call.slashed = BigInt.fromI32(0);
  call.keeperBounty = BigInt.fromI32(0);
  call.termsVersion = event.params.termsVersion.toI32();
  call.termsHash = event.params.termsHash;
  call.deadline = event.params.deadline;
  call.createdAt = event.block.timestamp;
  call.completedAt = null;
  call.save();
}

export function handleReceiptSubmitted(event: ReceiptSubmitted): void {
  let call = Call.load(event.params.callId.toHexString());
  if (call == null) return;

  call.responseHash = event.params.responseHash;
  call.status = "COMPLETED";
  call.completedAt = event.block.timestamp;
  call.save();
}

export function handleCallSlashed(event: CallSlashed): void {
  let call = Call.load(event.params.callId.toHexString());
  if (call == null) return;

  call.refunded = event.params.refunded;
  call.slashed = event.params.slashed;
  call.keeperBounty = event.params.keeperBounty;
  call.status = "SLASHED";
  call.completedAt = event.block.timestamp;
  call.save();
}

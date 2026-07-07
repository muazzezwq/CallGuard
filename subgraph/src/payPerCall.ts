import { BigInt } from "@graphprotocol/graph-ts";
import {
  CallStarted as CallStartedEvent,
  ReceiptSubmitted as ReceiptSubmittedEvent,
  CallSlashed as CallSlashedEvent,
} from "../generated/PayPerCall/PayPerCall";
import { Call, CallStarted, ReceiptSubmitted, CallSlashed } from "../generated/schema";

export function handleCallStarted(event: CallStartedEvent): void {
  let id = event.params.callId.toHexString();
  let call = new Call(id);
  call.callId = event.params.callId;
  call.caller = event.params.caller.toHexString();
  call.providerId = event.params.providerId;
  call.amount = event.params.amount;
  call.deadline = event.block.timestamp.plus(BigInt.fromI32(event.params.deadline));
  call.status = "pending";
  call.requestHash = event.params.requestHash;
  call.openedAt = event.block.timestamp;
  call.closedAt = null;
  call.txHash = event.transaction.hash;
  call.save();

  let ev = new CallStarted(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  ev.callId = event.params.callId;
  ev.caller = event.params.caller.toHexString();
  ev.providerId = event.params.providerId;
  ev.amount = event.params.amount;
  ev.deadline = call.deadline;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();
}

export function handleReceiptSubmitted(event: ReceiptSubmittedEvent): void {
  let call = Call.load(event.params.callId.toHexString());
  if (call) {
    call.status = "completed";
    call.closedAt = event.block.timestamp;
    call.save();
  }
  let ev = new ReceiptSubmitted(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  ev.callId = event.params.callId;
  ev.providerId = call ? call.providerId : BigInt.fromI32(0);
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();
}

export function handleCallSlashed(event: CallSlashedEvent): void {
  let call = Call.load(event.params.callId.toHexString());
  if (call) {
    call.status = "slashed";
    call.closedAt = event.block.timestamp;
    call.save();
  }
  let ev = new CallSlashed(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  ev.callId = event.params.callId;
  ev.providerId = call ? call.providerId : BigInt.fromI32(0);
  ev.slashed = event.params.slashed;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();
}

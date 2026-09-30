import { BigInt } from "@graphprotocol/graph-ts";
import {
  Subscribed,
  CallUsed,
  Cancelled,
  ExpiredReleased,
} from "../generated/Subscription/Subscription";
import { Subscription } from "../generated/schema";

export function handleSubscribed(event: Subscribed): void {
  const id = event.params.subId.toString();
  let s = new Subscription(id);
  s.subId          = event.params.subId;
  s.subscriber     = event.params.subscriber;
  s.providerId     = event.params.providerId;
  s.totalCalls     = event.params.calls as i32;
  s.remainingCalls = event.params.calls as i32;
  s.expiresAt      = BigInt.fromI64(event.params.expiresAt as i64);
  s.status         = "Active";
  s.refund         = BigInt.fromI32(0);
  s.createdAt      = event.block.timestamp;
  s.updatedAt      = event.block.timestamp;
  s.save();
}

export function handleCallUsed(event: CallUsed): void {
  const id = event.params.subId.toString();
  let s = Subscription.load(id);
  if (!s) return;
  s.remainingCalls = event.params.remaining as i32;
  s.updatedAt      = event.block.timestamp;
  if (s.remainingCalls == 0) s.status = "Exhausted";
  s.save();
}

export function handleCancelled(event: Cancelled): void {
  const id = event.params.subId.toString();
  let s = Subscription.load(id);
  if (!s) return;
  s.status    = "Cancelled";
  s.refund    = event.params.refund;
  s.updatedAt = event.block.timestamp;
  s.save();
}

export function handleExpiredReleased(event: ExpiredReleased): void {
  const id = event.params.subId.toString();
  let s = Subscription.load(id);
  if (!s) return;
  s.status    = "Expired";
  s.refund    = event.params.refund;
  s.updatedAt = event.block.timestamp;
  s.save();
}

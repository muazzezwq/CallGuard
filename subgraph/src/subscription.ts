import { BigInt } from "@graphprotocol/graph-ts";
import {
  Subscribed,
  CallUsed,
  Cancelled,
  ExpiredReleased,
  StreamSubscribed,
  StreamClaimed,
} from "../generated/Subscription/Subscription";
import { CallSubscription, StreamClaim } from "../generated/schema";

export function handleSubscribed(event: Subscribed): void {
  const id = event.params.subId.toString();
  let s = new CallSubscription(id);
  s.subId          = event.params.subId;
  s.subscriber     = event.params.subscriber;
  s.providerId     = event.params.providerId;
  s.totalCalls     = event.params.calls.toI32();
  s.remainingCalls = event.params.calls.toI32();
  s.expiresAt      = event.params.expiresAt;
  s.status         = "Active";
  s.refund         = BigInt.fromI32(0);
  s.createdAt      = event.block.timestamp;
  s.updatedAt      = event.block.timestamp;
  s.save();
}

export function handleCallUsed(event: CallUsed): void {
  const id = event.params.subId.toString();
  let s = CallSubscription.load(id);
  if (!s) return;
  s.remainingCalls = event.params.remaining.toI32();
  s.updatedAt      = event.block.timestamp;
  if (s.remainingCalls == 0) s.status = "Exhausted";
  s.save();
}

export function handleCancelled(event: Cancelled): void {
  const id = event.params.subId.toString();
  let s = CallSubscription.load(id);
  if (!s) return;
  s.status    = "Cancelled";
  s.refund    = event.params.refund;
  s.updatedAt = event.block.timestamp;
  s.save();
}

export function handleExpiredReleased(event: ExpiredReleased): void {
  const id = event.params.subId.toString();
  let s = CallSubscription.load(id);
  if (!s) return;
  s.status    = "Expired";
  s.refund    = event.params.refund;
  s.updatedAt = event.block.timestamp;
  s.save();
}

// ---------------------------------------------------------------------------
// StreamEscrow — StreamSubscribed
// ---------------------------------------------------------------------------

export function handleStreamSubscribed(event: StreamSubscribed): void {
  const id = event.params.subId.toString();
  let s = new CallSubscription(id);
  s.subId          = event.params.subId;
  s.subscriber     = event.params.subscriber;
  s.providerId     = event.params.providerId;
  s.totalCalls     = 0;
  s.remainingCalls = 0;
  s.expiresAt      = event.block.timestamp.plus(event.params.duration);
  s.status         = "StreamActive";
  s.refund         = BigInt.fromI32(0);
  s.streamMode     = true;
  s.streamReleased = BigInt.fromI32(0);
  s.createdAt      = event.block.timestamp;
  s.updatedAt      = event.block.timestamp;
  s.save();
}

// ---------------------------------------------------------------------------
// StreamEscrow — StreamClaimed
// ---------------------------------------------------------------------------

export function handleStreamClaimed(event: StreamClaimed): void {
  // Record immutable claim event.
  const claimId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  let claim = new StreamClaim(claimId);
  claim.subId         = event.params.subId;
  claim.providerOwner = event.params.providerOwner;
  claim.amount        = event.params.amount;
  claim.timestamp     = event.block.timestamp;
  claim.txHash        = event.transaction.hash;
  claim.save();

  // Update running streamReleased total on the Subscription entity.
  const subId = event.params.subId.toString();
  let s = CallSubscription.load(subId);
  if (s) {
    s.streamReleased = s.streamReleased.plus(event.params.amount);
    s.updatedAt      = event.block.timestamp;
    s.save();
  }
}

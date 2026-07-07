import { BigInt } from "@graphprotocol/graph-ts";
import {
  ProviderRegistered as ProviderRegisteredEvent,
  ReputationUpdated as ReputationUpdatedEvent,
  ProviderDeactivated as ProviderDeactivatedEvent,
} from "../generated/ServiceRegistry/ServiceRegistry";
import { Provider, ProviderRegistered } from "../generated/schema";

export function handleProviderRegistered(event: ProviderRegisteredEvent): void {
  let provider = new Provider(event.params.providerId.toString());
  provider.owner = event.params.owner.toHexString();
  provider.signer = event.params.signer.toHexString();
  provider.stake = event.params.stake;
  provider.pricePerCall = event.params.pricePerCall;
  provider.maxResponseTime = event.params.maxResponseTime.toI32();
  provider.slashBps = event.params.slashBps.toI32();
  provider.active = true;
  provider.reputation = 66;
  provider.completedCalls = 0;
  provider.slashedCalls = 0;
  provider.registeredAt = event.block.timestamp;
  provider.save();

  let reg = new ProviderRegistered(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  reg.providerId = event.params.providerId;
  reg.owner = event.params.owner.toHexString();
  reg.stake = event.params.stake;
  reg.pricePerCall = event.params.pricePerCall;
  reg.maxResponseTime = event.params.maxResponseTime.toI32();
  reg.timestamp = event.block.timestamp;
  reg.txHash = event.transaction.hash;
  reg.save();
}

export function handleReputationUpdated(event: ReputationUpdatedEvent): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider) {
    let completed = event.params.completedCalls.toI32();
    let slashed = event.params.slashedCalls.toI32();
    let total = completed + slashed;
    provider.completedCalls = completed;
    provider.slashedCalls = slashed;
    provider.reputation = total > 0 ? (completed + 2) * 100 / (total + 3) : 66;
    provider.save();
  }
}

export function handleProviderDeactivated(event: ProviderDeactivatedEvent): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider) {
    provider.active = false;
    provider.save();
  }
}

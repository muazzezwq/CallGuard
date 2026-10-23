import { BigInt } from "@graphprotocol/graph-ts";
import {
  MaxConcurrentCallsUpdated,
  PriceUpdated,
  ProviderDeactivated,
  ProviderRegistered,
  ProviderSlashed,
  ProviderUnstaked,
  ReputationUpdated,
  SignerUpdated,
  StakeAdded,
  TermsUpdated,
} from "../generated/ServiceRegistryV8/ServiceRegistryV8";
import { Provider } from "../generated/schema";

export function handleProviderRegistered(event: ProviderRegistered): void {
  let provider = new Provider(event.params.providerId.toString());
  provider.owner = event.params.owner;
  provider.signer = event.params.signer;
  provider.stake = event.params.stake;
  provider.pricePerCall = event.params.pricePerCall;
  provider.latestTermsVersion = event.params.termsVersion.toI32();
  provider.termsHash = event.params.termsHash;
  provider.endpoint = event.params.endpoint;
  provider.active = true;
  provider.deactivatedAt = null;
  provider.completedCalls = 0;
  provider.slashedCalls = 0;
  provider.maxConcurrentCalls = 0;
  provider.nftTokenId = null;
  provider.nftBound = false;
  provider.totalSlashed = BigInt.fromI32(0);
  provider.totalUnstaked = BigInt.fromI32(0);
  provider.createdAt = event.block.timestamp;
  provider.updatedAt = event.block.timestamp;
  provider.save();
}

export function handleStakeAdded(event: StakeAdded): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider == null) return;

  provider.stake = event.params.newStake;
  provider.updatedAt = event.block.timestamp;
  provider.save();
}

export function handleProviderDeactivated(event: ProviderDeactivated): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider == null) return;

  provider.active = false;
  provider.deactivatedAt = event.params.deactivatedAt;
  provider.updatedAt = event.block.timestamp;
  provider.save();
}

export function handleProviderUnstaked(event: ProviderUnstaked): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider == null) return;

  provider.stake = provider.stake.minus(event.params.amount);
  provider.totalUnstaked = provider.totalUnstaked.plus(event.params.amount);
  provider.active = false;
  provider.updatedAt = event.block.timestamp;
  provider.save();
}

export function handleProviderSlashed(event: ProviderSlashed): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider == null) return;

  provider.stake = provider.stake.minus(event.params.amount);
  provider.totalSlashed = provider.totalSlashed.plus(event.params.amount);
  provider.updatedAt = event.block.timestamp;
  provider.save();
}

export function handleReputationUpdated(event: ReputationUpdated): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider == null) return;

  provider.completedCalls = event.params.completedCalls.toI32();
  provider.slashedCalls = event.params.slashedCalls.toI32();
  provider.updatedAt = event.block.timestamp;
  provider.save();
}

export function handlePriceUpdated(event: PriceUpdated): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider == null) return;

  provider.pricePerCall = event.params.newPrice;
  provider.updatedAt = event.block.timestamp;
  provider.save();
}

export function handleSignerUpdated(event: SignerUpdated): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider == null) return;

  provider.signer = event.params.newSigner;
  provider.updatedAt = event.block.timestamp;
  provider.save();
}

export function handleMaxConcurrentCallsUpdated(event: MaxConcurrentCallsUpdated): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider == null) return;

  provider.maxConcurrentCalls = event.params.newCap.toI32();
  provider.updatedAt = event.block.timestamp;
  provider.save();
}

export function handleTermsUpdated(event: TermsUpdated): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider == null) return;

  provider.latestTermsVersion = event.params.version.toI32();
  provider.termsHash = event.params.termsHash;
  provider.updatedAt = event.block.timestamp;
  provider.save();
}

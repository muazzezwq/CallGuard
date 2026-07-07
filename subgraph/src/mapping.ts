import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  ProviderRegistered,
  ProviderDeactivated,
  ProviderUnstaked,
  ProviderSlashed,
  PriceUpdated,
  SignerUpdated,
  ReputationUpdated,
  NFTBound,
} from "../generated/ServiceRegistry/ServiceRegistry";
import {
  CallStarted,
  ReceiptSubmitted,
  CallSlashed,
} from "../generated/PayPerCall/PayPerCall";
import {
  CrossChainCallTriggered,
} from "../generated/CrossChainReceiver/CrossChainReceiver";
import {
  RegisteredWithNFT,
} from "../generated/RegisterWithNFT/RegisterWithNFT";
import {
  Provider,
  Call,
  CrossChainCall,
  NFTRegistration,
} from "../generated/schema";

export function handleProviderRegistered(event: ProviderRegistered): void {
  let provider = new Provider(event.params.providerId.toString());
  provider.owner = event.params.owner;
  provider.signer = event.params.signer;
  provider.stake = event.params.stake;
  provider.pricePerCall = event.params.pricePerCall;
  provider.active = true;
  provider.deactivatedAt = null;
  provider.completedCalls = 0;
  provider.slashedCalls = 0;
  provider.nftTokenId = null;
  provider.nftBound = false;
  provider.totalSlashed = BigInt.fromI32(0);
  provider.totalUnstaked = BigInt.fromI32(0);
  provider.createdAt = event.block.timestamp;
  provider.updatedAt = event.block.timestamp;
  provider.save();
}

export function handleProviderDeactivated(event: ProviderDeactivated): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider) {
    provider.active = false;
    provider.deactivatedAt = event.params.deactivatedAt;
    provider.updatedAt = event.block.timestamp;
    provider.save();
  }
}

export function handleProviderUnstaked(event: ProviderUnstaked): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider) {
    provider.stake = provider.stake.minus(event.params.amount);
    provider.totalUnstaked = provider.totalUnstaked.plus(event.params.amount);
    provider.updatedAt = event.block.timestamp;
    provider.save();
  }
}

export function handleProviderSlashed(event: ProviderSlashed): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider) {
    provider.stake = provider.stake.minus(event.params.amount);
    provider.totalSlashed = provider.totalSlashed.plus(event.params.amount);
    provider.updatedAt = event.block.timestamp;
    provider.save();
  }
}

export function handlePriceUpdated(event: PriceUpdated): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider) {
    provider.pricePerCall = event.params.newPrice;
    provider.updatedAt = event.block.timestamp;
    provider.save();
  }
}

export function handleSignerUpdated(event: SignerUpdated): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider) {
    provider.signer = event.params.newSigner;
    provider.updatedAt = event.block.timestamp;
    provider.save();
  }
}

export function handleReputationUpdated(event: ReputationUpdated): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider) {
    provider.completedCalls = event.params.completedCalls.toI32();
    provider.slashedCalls = event.params.slashedCalls.toI32();
    provider.updatedAt = event.block.timestamp;
    provider.save();
  }
}

export function handleNFTBound(event: NFTBound): void {
  let provider = Provider.load(event.params.providerId.toString());
  if (provider) {
    provider.nftTokenId = event.params.tokenId;
    provider.nftBound = true;
    provider.updatedAt = event.block.timestamp;
    provider.save();
  }
}

export function handleCallStarted(event: CallStarted): void {
  let call = new Call(event.params.callId.toHexString());
  call.providerId = event.params.providerId;
  call.provider = event.params.providerId.toString();
  call.caller = event.params.caller;
  call.amount = event.params.amount;
  call.requestHash = event.params.requestHash;
  call.responseHash = null;
  call.status = "STARTED";
  call.refunded = BigInt.fromI32(0);
  call.slashed = BigInt.fromI32(0);
  call.createdAt = event.block.timestamp;
  call.completedAt = null;
  call.save();
}

export function handleReceiptSubmitted(event: ReceiptSubmitted): void {
  let call = Call.load(event.params.callId.toHexString());
  if (call) {
    call.responseHash = event.params.responseHash;
    call.status = "COMPLETED";
    call.completedAt = event.block.timestamp;
    call.save();
  }
}

export function handleCallSlashed(event: CallSlashed): void {
  let call = Call.load(event.params.callId.toHexString());
  if (call) {
    call.refunded = event.params.refunded;
    call.slashed = event.params.slashed;
    call.status = "SLASHED";
    call.completedAt = event.block.timestamp;
    call.save();
  }
}

export function handleCrossChainCallTriggered(event: CrossChainCallTriggered): void {
  let crossCall = new CrossChainCall(event.params.callId.toHexString());
  crossCall.providerId = event.params.providerId;
  crossCall.provider = event.params.providerId.toString();
  crossCall.originalCaller = event.params.originalCaller;
  crossCall.amount = event.params.amount;
  crossCall.createdAt = event.block.timestamp;
  crossCall.save();
}

export function handleRegisteredWithNFT(event: RegisteredWithNFT): void {
  let id = event.params.providerId.toString() + "-" + event.params.tokenId.toString();
  let registration = new NFTRegistration(id);
  registration.providerId = event.params.providerId;
  registration.provider = event.params.providerId.toString();
  registration.tokenId = event.params.tokenId;
  registration.stakeAmount = event.params.stakeAmount;
  registration.providerAddress = event.params.provider;
  registration.createdAt = event.block.timestamp;
  registration.save();
}

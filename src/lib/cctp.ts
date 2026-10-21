// CCTP v2 configuration for cross-chain USDC bridging
export const CCTP_CONFIG = {
  contracts: {
    TokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
    MessageTransmitterV2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
  },
  domains: { sepolia: 0, base: 6, amoy: 7, arc: 26 } as Record<string, number>,
  usdc: {
    sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    base: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    amoy: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    arc: "0x3600000000000000000000000000000000000000",
  } as Record<string, string>,
  chains: {
    sepolia: { chainId: 11155111, chainIdHex: "0xaa36a7", rpcUrl: "https://rpc.sepolia.org", name: "Ethereum Sepolia", explorer: "https://sepolia.etherscan.io" },
    base: { chainId: 84532, chainIdHex: "0x14a34", rpcUrl: "https://sepolia.base.org", name: "Base Sepolia", explorer: "https://sepolia.basescan.org" },
    amoy: { chainId: 80002, chainIdHex: "0x13882", rpcUrl: "https://rpc-amoy.polygon.technology", name: "Polygon Amoy", explorer: "https://amoy.polygonscan.com" },
    arc: { chainId: 5042002, chainIdHex: "0x4CEF52", rpcUrl: "https://rpc.testnet.arc.io", name: "Arc Testnet", explorer: "https://explorer.testnet.arc.io" }, // primary RPC per Arc docs
  } as Record<string, { chainId: number; chainIdHex: string; rpcUrl: string; name: string; explorer: string }>,
  irisApi: "https://iris-api-sandbox.circle.com/v2/messages",
  // CRITICAL-05 fix: v2 CrossChainReceiver address
  crossChainReceiver: "0x760326de3cba39994dfd81d2b71b072c0265601c",
};

export async function switchToChain(chainKey: string): Promise<void> {
  const chain = CCTP_CONFIG.chains[chainKey];
  if (!chain) throw new Error(`Unknown chain: ${chainKey}`);
  const provider = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  if (!provider) throw new Error("No wallet provider found");
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.chainIdHex }] });
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;
    if (code === 4902 || code === -32603) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: chain.chainIdHex,
          chainName: chain.name,
          rpcUrls: [chain.rpcUrl],
          // Arc EVM gas layer uses 18 decimals (native); ERC-20 returns 6.
          // MetaMask requires 18 here for correct gas display.
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          blockExplorerUrls: [chain.explorer],
        }],
      });
    } else if (code === 4001) {
      throw new Error("Chain switch rejected by user.");
    } else {
      throw err;
    }
  }
}

export type CctpDecodedMessage = {
  sourceDomain: number;
  destinationDomain: number;
  recipient: string;
  mintRecipient: string;
  destinationCaller: string;
  burnToken: string;
  amount: string;
  cctpVersion: number;
  bodyVersion: number;
  sender: string;
  messageSender: string;
  maxFee: string;
  feeExecuted: string;
  hookData: string;
};

export type CctpAttestation = {
  message: `0x${string}`;
  attestation: `0x${string}`;
  /* Decoded from the actual message bytes, not from IRIS's JSON summary. */
  decoded: CctpDecodedMessage | null;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MESSAGE_HEADER_BYTES = 148;
const BURN_BODY_BYTES = 228;
const BURN_BODY_OFFSET = MESSAGE_HEADER_BYTES;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asHexBytes(value: unknown): `0x${string}` | null {
  return typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})+$/.test(value)
    ? value as `0x${string}`
    : null;
}

function hexSlice(message: string, byteOffset: number, byteLength: number): string {
  const start = 2 + byteOffset * 2;
  return message.slice(start, start + byteLength * 2);
}

function uintAt(message: string, byteOffset: number): number {
  return Number.parseInt(hexSlice(message, byteOffset, 4), 16);
}

function uint256At(message: string, byteOffset: number): string {
  return BigInt(`0x${hexSlice(message, byteOffset, 32)}`).toString();
}

function addressAt(message: string, byteOffset: number): string {
  return `0x${hexSlice(message, byteOffset, 32).slice(-40)}`;
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Decodes the fixed CCTP v2 header and BurnMessage body. */
export function decodeCctpMessage(message: `0x${string}`): CctpDecodedMessage | null {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(message)) return null;
  if (message.length < 2 + (MESSAGE_HEADER_BYTES + BURN_BODY_BYTES) * 2) return null;

  return {
    cctpVersion: uintAt(message, 0),
    sourceDomain: uintAt(message, 4),
    destinationDomain: uintAt(message, 8),
    sender: addressAt(message, 44),
    recipient: addressAt(message, 76),
    destinationCaller: addressAt(message, 108),
    bodyVersion: uintAt(message, BURN_BODY_OFFSET),
    burnToken: addressAt(message, BURN_BODY_OFFSET + 4),
    mintRecipient: addressAt(message, BURN_BODY_OFFSET + 36),
    amount: uint256At(message, BURN_BODY_OFFSET + 68),
    messageSender: addressAt(message, BURN_BODY_OFFSET + 100),
    maxFee: uint256At(message, BURN_BODY_OFFSET + 132),
    feeExecuted: uint256At(message, BURN_BODY_OFFSET + 164),
    hookData: `0x${message.slice(2 + (BURN_BODY_OFFSET + 228) * 2)}`,
  };
}

/** Parses one IRIS v2 message. Returns null until a usable attestation is complete. */
export function parseCctpAttestationResponse(payload: unknown): CctpAttestation | null {
  const root = asRecord(payload);
  const messages = root?.messages;
  if (!Array.isArray(messages)) return null;
  const first = asRecord(messages[0]);
  if (!first || first.status !== "complete") return null;

  const message = asHexBytes(first.message);
  const attestation = asHexBytes(first.attestation);
  if (!message || !attestation) return null;

  const decoded = decodeCctpMessage(message);
  if (!decoded) return null;
  return { message, attestation, decoded };
}

export type CctpMintExpectation = {
  sourceDomain: number;
  destinationDomain: number;
  mintRecipient: string;
  burnToken: string;
  amount: bigint;
  destinationCaller?: string;
  recipient?: string;
  sender?: string;
  messageSender?: string;
  maxFee?: bigint;
  hookData?: string;
};

/** Validates the decoded message against the burn this UI just made. The
    on-chain attestation remains the final authority; this check prevents a
    different valid message from being minted for this operation. */
export function validateCctpMintMessage(
  decoded: CctpDecodedMessage | null,
  expected: CctpMintExpectation,
): { ok: true } | { ok: false; reason: string } {
  if (!decoded) return { ok: false, reason: "Decoded CCTP message data is unavailable." };
  if (decoded.cctpVersion !== 2 || decoded.bodyVersion !== 2) {
    return { ok: false, reason: `Unexpected CCTP version: header=${decoded.cctpVersion}, body=${decoded.bodyVersion}.` };
  }
  if (decoded.sourceDomain !== expected.sourceDomain) {
    return { ok: false, reason: `Source domain mismatch: message=${decoded.sourceDomain}, expected=${expected.sourceDomain}.` };
  }
  if (decoded.destinationDomain !== expected.destinationDomain) {
    return { ok: false, reason: `Destination domain mismatch: message=${decoded.destinationDomain}, expected=${expected.destinationDomain}.` };
  }
  if (!sameAddress(decoded.mintRecipient, expected.mintRecipient)) {
    return { ok: false, reason: "Mint recipient does not match the Bridge recipient." };
  }
  if (!sameAddress(decoded.burnToken, expected.burnToken)) {
    return { ok: false, reason: "Burn token does not match the selected source-chain USDC." };
  }
  if (!sameAddress(decoded.destinationCaller, expected.destinationCaller ?? ZERO_ADDRESS)) {
    return { ok: false, reason: "Destination caller does not match the burn settings." };
  }
  if (expected.recipient && !sameAddress(decoded.recipient, expected.recipient)) {
    return { ok: false, reason: "Message recipient is not the Arc TokenMessenger." };
  }
  if (expected.sender && !sameAddress(decoded.sender, expected.sender)) {
    return { ok: false, reason: "Message sender is not the selected source-chain TokenMessenger." };
  }
  if (expected.messageSender && !sameAddress(decoded.messageSender, expected.messageSender)) {
    return { ok: false, reason: "Burn initiator does not match the connected wallet." };
  }
  if (BigInt(decoded.amount) !== expected.amount) {
    return { ok: false, reason: `Mint amount mismatch: message=${decoded.amount}, expected=${expected.amount.toString()}.` };
  }
  const expectedMaxFee = expected.maxFee ?? 0n;
  if (BigInt(decoded.maxFee) !== expectedMaxFee) {
    return { ok: false, reason: `Max fee mismatch: message=${decoded.maxFee}, expected=${expectedMaxFee.toString()}.` };
  }
  if (BigInt(decoded.feeExecuted) > BigInt(decoded.maxFee)) {
    return { ok: false, reason: "Executed fee exceeds the message max fee." };
  }
  const expectedHookData = (expected.hookData ?? "0x").toLowerCase();
  if (decoded.hookData.toLowerCase() !== expectedHookData) {
    return { ok: false, reason: "Unexpected hook data in the CCTP message." };
  }
  return { ok: true };
}

export async function waitForAttestation(sourceDomain: number, burnTxHash: string): Promise<CctpAttestation> {
  const url = `${CCTP_CONFIG.irisApi}/${sourceDomain}/${burnTxHash}`;
  const maxAttempts = 100;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      const parsed = parseCctpAttestationResponse(await res.json());
      if (parsed) return parsed;
    } catch { /* transient fetch/parse error — retry */ }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error("Attestation timeout. Burn TX succeeded — check ArcScan in a few minutes.");
}

export const TOKEN_MESSENGER_ABI = [
  { name: "depositForBurn", type: "function", inputs: [{ name: "amount", type: "uint256" }, { name: "destinationDomain", type: "uint32" }, { name: "mintRecipient", type: "bytes32" }, { name: "burnToken", type: "address" }, { name: "destinationCaller", type: "bytes32" }, { name: "maxFee", type: "uint256" }, { name: "minFinalityThreshold", type: "uint32" }], outputs: [{ name: "", type: "uint64" }], stateMutability: "nonpayable" },
] as const;

export const MESSAGE_TRANSMITTER_ABI = [
  { name: "receiveMessage", type: "function", inputs: [{ name: "message", type: "bytes" }, { name: "attestation", type: "bytes" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
] as const;

export const USDC_APPROVE_ABI = [
  { name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
  { name: "allowance", type: "function", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
] as const;

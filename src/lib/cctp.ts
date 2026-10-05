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
    arc: { chainId: 5042002, chainIdHex: "0x4CEF52", rpcUrl: "https://rpc.testnet.arc.io", name: "Arc Testnet", explorer: "https://explorer.testnet.arc.io" },
  } as Record<string, { chainId: number; chainIdHex: string; rpcUrl: string; name: string; explorer: string }>,
  irisApi: "https://iris-api-sandbox.circle.com/v2/messages",
  crossChainReceiver: "0x28a683A5fAB9B5DC2608089e86d733aB1f116e5c",
};

export async function switchToChain(chainKey: string): Promise<void> {
  const chain = CCTP_CONFIG.chains[chainKey];
  if (!chain) throw new Error(`Unknown chain: ${chainKey}`);
  const provider = (window as any).ethereum;
  if (!provider) throw new Error("No wallet provider found");
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.chainIdHex }] });
  } catch (err: any) {
    if (err.code === 4902 || err.code === -32603) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: chain.chainIdHex,
          chainName: chain.name,
          rpcUrls: [chain.rpcUrl],
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          blockExplorerUrls: [chain.explorer],
        }],
      });
    } else if (err.code === 4001) {
      throw new Error("Chain switch rejected by user.");
    } else {
      throw err;
    }
  }
}

export async function waitForAttestation(sourceDomain: number, burnTxHash: string): Promise<{ message: string; attestation: string }> {
  const url = `${CCTP_CONFIG.irisApi}/${sourceDomain}/${burnTxHash}`;
  const maxAttempts = 100;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      const json = await res.json();
      const msg = json.messages?.[0];
      if (msg?.status === "complete" && msg?.attestation && msg?.attestation !== "PENDING") {
        return { message: msg.message, attestation: msg.attestation };
      }
    } catch {}
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

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { ethers } from "ethers";

export interface WalletState {
  address: string | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  chainId: number | null;
  balance: string | null;
  connected: boolean;
}

interface WalletContextValue extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToArc: () => Promise<void>;
}

const ARC_TESTNET = {
  chainId: "0x4CE512", // 5042002
  chainName: "Arc Testnet",
  rpcUrls: ["https://rpc.testnet.arc.io"],
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  blockExplorerUrls: ["https://explorer.testnet.arc.io"],
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({
    address: null, provider: null, signer: null,
    chainId: null, balance: null, connected: false,
  });

  const connect = useCallback(async () => {
    const win = window as any;
    if (!win.ethereum) { alert("No wallet found. Please install MetaMask."); return; }
    try {
      const provider = new ethers.BrowserProvider(win.ethereum);
      await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      const bal = await provider.getBalance(address);
      setState({ address, provider, signer, chainId, balance: ethers.formatUnits(bal, 18), connected: true });
    } catch (e: any) {
      console.error("connect error", e);
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ address: null, provider: null, signer: null, chainId: null, balance: null, connected: false });
  }, []);

  const switchToArc = useCallback(async () => {
    const win = window as any;
    if (!win.ethereum) return;
    try {
      await win.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_TESTNET.chainId }] });
    } catch (e: any) {
      if (e.code === 4902) {
        await win.ethereum.request({ method: "wallet_addEthereumChain", params: [ARC_TESTNET] });
      }
    }
  }, []);

  return (
    <WalletContext.Provider value={{ ...state, connect, disconnect, switchToArc }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}

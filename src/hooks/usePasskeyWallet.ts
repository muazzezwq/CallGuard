/**
 * usePasskeyWallet
 *
 * React hook wrapping @circle-fin/modular-wallets-core for
 * passkey-based Circle Smart Account (MSCA) on Arc Testnet.
 *
 * Prerequisites (user action required):
 *   1. Circle Console → Keys → Client Keys → create key (TEST_API_KEY:...)
 *   2. Console → Passkey Settings → Domain: <this app's preview hostname>
 *   3. Add to .env:
 *        VITE_CLIENT_KEY=TEST_API_KEY:...
 *        VITE_CLIENT_URL=https://modular-sdk.circle.com/v1/rpc/w3s/buidl
 *
 * Usage:
 *   const { register, login, account, sendGaslessCall, status } = usePasskeyWallet();
 */

import { useState, useCallback } from "react";

// Arc Testnet chain ID
const ARC_TESTNET_CHAIN_ID = 5042002;

export type PasskeyWalletStatus =
  | "idle"
  | "registering"
  | "logging-in"
  | "ready"
  | "sending"
  | "error";

export interface PasskeyWalletState {
  account: unknown | null;
  address: `0x${string}` | null;
  status: PasskeyWalletStatus;
  error: string | null;
  register: (username: string) => Promise<void>;
  login: () => Promise<void>;
  sendGaslessCall: (
    to: `0x${string}`,
    abi: unknown[],
    functionName: string,
    args: unknown[]
  ) => Promise<`0x${string}` | null>;
  reset: () => void;
}

export function usePasskeyWallet(): PasskeyWalletState {
  const [account, setAccount] = useState<unknown | null>(null);
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [status, setStatus] = useState<PasskeyWalletStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const clientKey = import.meta.env.VITE_CLIENT_KEY as string | undefined;
  const clientUrl = (import.meta.env.VITE_CLIENT_URL as string | undefined)
    ?? "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";

  const getTransports = useCallback(async () => {
    if (!clientKey) throw new Error("VITE_CLIENT_KEY is not set in .env");
    // @circle-fin/modular-wallets-core is an optional peer dependency.
    // Install with: bun add @circle-fin/modular-wallets-core
    const mod = await import("@circle-fin/modular-wallets-core" as string) as {
      toModularTransport: (url: string, key: string) => unknown;
      toPasskeyTransport: (url: string, key: string) => unknown;
    };
    return {
      modular: mod.toModularTransport(`${clientUrl}/arcTestnet`, clientKey),
      passkey: mod.toPasskeyTransport(clientUrl, clientKey),
    };
  }, [clientKey, clientUrl]);

  const register = useCallback(async (username: string) => {
    setStatus("registering");
    setError(null);
    try {
      const { modular, passkey } = await getTransports();
      const {
        toCircleSmartAccount,
        toWebAuthnCredential,
        WebAuthnMode,
      } = await import("@circle-fin/modular-wallets-core" as string) as Record<string, unknown>;
      const { createPublicClient } = await import("viem");

      const credential = await (toWebAuthnCredential as (opts: { transport: unknown; mode: unknown; username?: string }) => Promise<unknown>)({
        transport: passkey,
        mode: (WebAuthnMode as Record<string,unknown>).Register,
        username,
      });

      // Persist credential to sessionStorage (dev only — use httpOnly cookie in production)
      sessionStorage.setItem("cg_passkey_credential", JSON.stringify(credential));

      const publicClient = (createPublicClient as (opts: { transport: unknown }) => unknown)({ transport: modular });
      const acc = await (toCircleSmartAccount as (opts: { client: unknown; credential: unknown }) => Promise<{ address: string }>)({ client: publicClient, credential });

      setAccount(acc);
      setAddress((acc as {address: string}).address as `0x${string}`);
      setStatus("ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus("error");
    }
  }, [getTransports]);

  const login = useCallback(async () => {
    setStatus("logging-in");
    setError(null);
    try {
      const { modular, passkey } = await getTransports();
      const {
        toCircleSmartAccount,
        toWebAuthnCredential,
        WebAuthnMode,
      } = await import("@circle-fin/modular-wallets-core" as string) as Record<string, unknown>;
      const { createPublicClient } = await import("viem");

      const credential = await (toWebAuthnCredential as (opts: { transport: unknown; mode: unknown }) => Promise<unknown>)({
        transport: passkey,
        mode: (WebAuthnMode as Record<string,unknown>).Login,
      });

      sessionStorage.setItem("cg_passkey_credential", JSON.stringify(credential));

      const publicClient = (createPublicClient as (opts: { transport: unknown }) => unknown)({ transport: modular });
      const acc = await (toCircleSmartAccount as (opts: { client: unknown; credential: unknown }) => Promise<{ address: string }>)({ client: publicClient, credential });

      setAccount(acc);
      setAddress((acc as {address: string}).address as `0x${string}`);
      setStatus("ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus("error");
    }
  }, [getTransports]);

  const sendGaslessCall = useCallback(async (
    to: `0x${string}`,
    abi: unknown[],
    functionName: string,
    args: unknown[]
  ): Promise<`0x${string}` | null> => {
    if (!account) { setError("No account — register or login first"); return null; }
    setStatus("sending");
    setError(null);
    try {
      const { modular } = await getTransports();
      const { createWalletClient } = await import("viem");

      const walletClient = (createWalletClient as (opts: { account: unknown; transport: unknown }) => unknown)({
        account,
        transport: modular,
      });

      // sendUserOperation with paymaster: true → Circle Gas Station sponsors gas.
      const result = await (walletClient as unknown as {
        sendUserOperation: (opts: unknown) => Promise<{ userOperationHash: `0x${string}` }>;
        waitForUserOperationReceipt: (opts: unknown) => Promise<unknown>;
      }).sendUserOperation({
        account,
        calls: [{ to, abi, functionName, args }],
        paymaster: true,
      });

      setStatus("ready");
      return result.userOperationHash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus("error");
      return null;
    }
  }, [account, getTransports]);

  const reset = useCallback(() => {
    setAccount(null);
    setAddress(null);
    setStatus("idle");
    setError(null);
    sessionStorage.removeItem("cg_passkey_credential");
  }, []);

  return { account, address, status, error, register, login, sendGaslessCall, reset };
}

export const ARC_TESTNET = ARC_TESTNET_CHAIN_ID;

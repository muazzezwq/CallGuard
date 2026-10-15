/**
 * PasskeyWallet
 *
 * Circle Modular Wallets passkey demo component.
 * Shows the passkey registration, login, and gasless callService flow.
 *
 * Prerequisite: VITE_CLIENT_KEY and VITE_CLIENT_URL must be defined in .env.
 * Bkz. src/hooks/usePasskeyWallet.ts
 */

import { useState } from "react";
import { usePasskeyWallet } from "../hooks/usePasskeyWallet";
import { CONFIG } from "../lib/config";

const PAY_PER_CALL_ADDR = ((import.meta.env.VITE_PAY_PER_CALL as string | undefined) ?? CONFIG.payPerCall) as `0x${string}`;

const PAY_PER_CALL_ABI: unknown[] = [
  {
    name: "callService",
    type: "function",
    inputs: [
      { name: "providerId", type: "uint256" },
      { name: "requestHash", type: "bytes32" },
    ],
    outputs: [{ name: "callId", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
];

export default function PasskeyWallet() {
  const { address, status, error, register, login, sendGaslessCall, reset } = usePasskeyWallet();
  const [username, setUsername] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);

  const clientKeySet = !!import.meta.env.VITE_CLIENT_KEY;

  async function handleGaslessDemo() {
    const hash = await sendGaslessCall(
      PAY_PER_CALL_ADDR,
      PAY_PER_CALL_ABI as unknown[],
      "callService",
      [BigInt(1), "0x" + "aa".repeat(32)]
    );
    if (hash) setTxHash(hash);
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold text-sm">
          PK
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">Circle Modular Wallets</h3>
          <p className="text-xs text-zinc-400">Passkey authentication + gasless transactions</p>
        </div>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
          status === "ready"
            ? "bg-emerald-500/20 text-emerald-400"
            : status === "error"
            ? "bg-red-500/20 text-red-400"
            : "bg-zinc-500/20 text-zinc-400"
        }`}>
          {status}
        </span>
      </div>

      {!clientKeySet && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-300 space-y-1">
          <p className="font-semibold">VITE_CLIENT_KEY is not set</p>
          <p>Circle Console → Keys → Client Keys → create a key, then add it to the .env file.</p>
        </div>
      )}

      {status === "idle" || status === "error" ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-zinc-400">Username (for registration)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="agent-alice"
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => register(username)}
              disabled={!clientKeySet || !username}
              className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              Register Passkey
            </button>
            <button
              onClick={login}
              disabled={!clientKeySet}
              className="flex-1 rounded-xl bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              Log In
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      ) : status === "ready" ? (
        <div className="space-y-3">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-1">
            <p className="text-xs text-zinc-400">Smart Account Address</p>
            <p className="text-xs text-white font-mono break-all">{address}</p>
          </div>
          <button
            onClick={handleGaslessDemo}
            className="w-full rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            Gasless callService Demo
          </button>
          {txHash && (
            <div className="rounded-xl bg-white/5 p-3 space-y-1">
              <p className="text-xs text-zinc-400">UserOp Hash</p>
              <p className="text-xs text-white font-mono break-all">{txHash}</p>
            </div>
          )}
          <button
            onClick={reset}
            className="w-full rounded-xl bg-zinc-800 hover:bg-zinc-700 px-4 py-2 text-xs text-zinc-400 transition-colors"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <div className="w-3 h-3 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          {status === "registering" && "Creating passkey..."}
          {status === "logging-in" && "Logging in..."}
          {status === "sending" && "Sending transaction..."}
        </div>
      )}

      <div className="border-t border-white/5 pt-3">
        <p className="text-xs text-zinc-500">
          Sponsored via Gas Station — the user pays zero gas.
          ERC-4337 + ERC-6900 MSCA infrastructure.
        </p>
      </div>
    </div>
  );
}

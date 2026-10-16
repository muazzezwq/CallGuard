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
import { PageHeader, SectionCard, Button, Badge, Field, Input } from "../ui";

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

const STATUS_TONE: Record<string, "guard" | "slash"> = {
  ready: "guard",
  error: "slash",
};

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
    <div className="ov-page">
      <PageHeader
        title="Passkey Wallet"
        subtitle="Passkey authentication + gasless transactions."
        actions={<Badge tone={STATUS_TONE[status] ?? "neutral"} dot>{status}</Badge>}
      />

      <SectionCard>
        {!clientKeySet && (
          <div className="pk-warn">
            <p className="pk-warn__title">VITE_CLIENT_KEY is not set</p>
            <p>Circle Console → Keys → Client Keys → create a key, then add it to the .env file.</p>
          </div>
        )}

        {(status === "idle" || status === "error") && (
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Username (for registration)">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="agent-alice"
              />
            </Field>
            <div style={{ display: "flex", gap: 10 }}>
              <Button
                variant="primary"
                onClick={() => register(username)}
                disabled={!clientKeySet || !username}
              >
                Register Passkey
              </Button>
              <Button variant="secondary" onClick={login} disabled={!clientKeySet}>
                Log In
              </Button>
            </div>
            {error && <p className="ub-error">{error}</p>}
          </div>
        )}

        {status === "ready" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="pk-field">
              <p className="pk-field__lbl">Smart Account Address</p>
              <p className="pk-field__val">{address}</p>
            </div>
            <Button variant="primary" onClick={handleGaslessDemo}>
              Gasless callService Demo
            </Button>
            {txHash && (
              <div className="pk-field">
                <p className="pk-field__lbl">UserOp Hash</p>
                <p className="pk-field__val">{txHash}</p>
              </div>
            )}
            <Button variant="secondary" size="sm" onClick={reset}>
              Disconnect
            </Button>
          </div>
        )}

        {status !== "idle" && status !== "error" && status !== "ready" && (
          <div className="pk-spin-row">
            <span className="pk-spin" />
            {status === "registering" && "Creating passkey…"}
            {status === "logging-in" && "Logging in…"}
            {status === "sending" && "Sending transaction…"}
          </div>
        )}

        <p className="ub-note" style={{ marginTop: 16 }}>
          Sponsored via Gas Station — the user pays zero gas. ERC-4337 + ERC-6900 MSCA infrastructure.
        </p>
      </SectionCard>
    </div>
  );
}

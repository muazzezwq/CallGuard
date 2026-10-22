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
import { PageHeader, Button, Badge, Field, Input } from "../ui";
import {
  KeyValue, PanelShell, PanelSource, PanelSplit, StatusNotice,
} from "./panel/PanelUi";

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

const STATUS_COPY: Record<string, string> = {
  registering: "Creating passkey…",
  "logging-in": "Logging in…",
  sending: "Sending transaction…",
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
    <PanelShell>
      <PageHeader
        title="Passkey Wallet"
        subtitle="Passkey authentication + gasless transactions."
        actions={<Badge tone={STATUS_TONE[status] ?? "neutral"} dot>{status}</Badge>}
      />
      <PanelSource
        label="Circle Modular Wallets"
        value={clientKeySet ? "client key set" : "client key missing"}
        hint="passkey session"
        state={clientKeySet ? "idle" : "unavailable"}
      />

      <PanelSplit
        main={(
          <>
            {!clientKeySet && (
              <StatusNotice tone="warn" title="VITE_CLIENT_KEY is not set">
                <p>Circle Console → Keys → Client Keys → create a key, then add it to the .env file.</p>
              </StatusNotice>
            )}

            {(status === "idle" || status === "error") && (
              <section className="ui-section">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">Passkey Session</h2>
                </div>
                <div className="ui-section__body">
                  <div className="pg-form">
                    <Field label="Username (for registration)" htmlFor="pk-username">
                      <Input
                        id="pk-username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="agent-alice"
                      />
                    </Field>
                  </div>
                  <div className="pg-form__actions pg-form__actions--spaced">
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
                  {error && (
                    <StatusNotice
                      tone="danger"
                      title={error}
                      className="pg-section--spaced"
                    />
                  )}
                </div>
              </section>
            )}

            {status === "ready" && (
              <>
                <KeyValue
                  label="Account"
                  rows={[
                    { label: "Smart Account Address", value: address ?? "—", mono: true },
                    { label: "Signer", value: "Passkey", mono: true },
                  ]}
                />
                <section className="ui-section pg-section--spaced">
                  <div className="ui-section__head">
                    <h2 className="ui-section__title">Gasless Execution</h2>
                  </div>
                  <div className="ui-section__body">
                    <p className="pg-copy">
                      Send a sponsored <code>callService</code> request through the smart account.
                    </p>
                    <div className="pg-form__actions pg-form__actions--spaced">
                      <Button variant="primary" onClick={handleGaslessDemo}>
                        Gasless callService Demo
                      </Button>
                      <Button variant="secondary" size="sm" onClick={reset}>
                        Disconnect
                      </Button>
                    </div>
                  </div>
                </section>
                {txHash && (
                  <KeyValue
                    label="Last UserOperation"
                    className="pg-section--spaced"
                    rows={[
                      { label: "UserOp Hash", value: txHash, mono: true },
                    ]}
                  />
                )}
              </>
            )}

            {status !== "idle" && status !== "error" && status !== "ready" && (
              <section className="ui-section">
                <div className="ui-section__head">
                  <h2 className="ui-section__title">Passkey Session</h2>
                </div>
                <div className="ui-section__body">
                  <StatusNotice
                    tone="info"
                    title={STATUS_COPY[status] ?? status}
                  />
                </div>
              </section>
            )}

            <p className="pg-note">
              Sponsored via Gas Station — the user pays zero gas. ERC-4337 + ERC-6900 MSCA infrastructure.
            </p>
          </>
        )}
        rail={(
          <>
            <KeyValue
              label="Prerequisites"
              rows={[
                { label: "Client key", value: clientKeySet ? "set" : "missing", mono: true },
                { label: "Env", value: "VITE_CLIENT_KEY", mono: true },
                { label: "Client URL", value: "VITE_CLIENT_URL", mono: true },
                { label: "Network", value: "Arc Testnet" },
              ]}
            />
            <KeyValue
              label="Account"
              rows={[
                { label: "Type", value: "MSCA" },
                { label: "Signer", value: "Passkey" },
                { label: "Gas", value: "Sponsored" },
              ]}
            />
          </>
        )}
      />
    </PanelShell>
  );
}

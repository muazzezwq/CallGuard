import { useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { Button, Input, PageHeader } from "../../ui";
import { CONFIG } from "../../lib/config";
import { useAppStore } from "../../store/useAppStore";
import {
  CodeSurface, KeyValue, Ledger, LedgerRow, PanelShell, PanelSource,
  PanelSplit, StatusNotice,
} from "../panel/PanelUi";

const SDK_SNIPPET = `// npm install ethers
import { ethers } from "ethers";
const PPC = "${CONFIG.ppcAddress}";
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const ppc = new ethers.Contract(PPC, ABI, signer);
const tx = await ppc.callService(1, requestHash);`;

export default function SettingsPanel() {
  const { theme, setTheme, mode, setMode } = useAppStore();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const [budget, setBudget] = useState(() => localStorage.getItem("cg_budget") ?? "");
  const [saved, setSaved] = useState(false);

  const saveBudget = () => {
    if (budget) localStorage.setItem("cg_budget", budget);
    else localStorage.removeItem("cg_budget");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <PanelShell>
      <PageHeader
        title="Settings"
        subtitle="Appearance and session preferences"
      />

      <PanelSource
        label="Local settings"
        value="this browser"
        hint="Theme and mode apply immediately"
        state="idle"
      />

      <PanelSplit
        main={
          <>
            <Ledger label="Appearance">
              <LedgerRow
                lead="Theme"
                meta="Dark or light mode"
                trailing={
                  <div className="pg-choice" role="group" aria-label="Theme">
                    <Button
                      size="sm"
                      variant={theme === "dark" ? "primary" : "secondary"}
                      aria-pressed={theme === "dark"}
                      onClick={() => setTheme("dark")}
                    >
                      Dark
                    </Button>
                    <Button
                      size="sm"
                      variant={theme === "light" ? "primary" : "secondary"}
                      aria-pressed={theme === "light"}
                      onClick={() => setTheme("light")}
                    >
                      Light
                    </Button>
                  </div>
                }
              />
              <LedgerRow
                lead="Mode"
                meta="Simple shows core features, Pro shows all"
                trailing={
                  <div className="pg-choice" role="group" aria-label="Mode">
                    <Button
                      size="sm"
                      variant={mode === "simple" ? "primary" : "secondary"}
                      aria-pressed={mode === "simple"}
                      onClick={() => setMode("simple")}
                    >
                      Simple
                    </Button>
                    <Button
                      size="sm"
                      variant={mode === "pro" ? "primary" : "secondary"}
                      aria-pressed={mode === "pro"}
                      onClick={() => setMode("pro")}
                    >
                      Pro
                    </Button>
                  </div>
                }
              />
            </Ledger>

            <Ledger label="Session Budget">
              <LedgerRow
                lead="Max USDC per session"
                meta="Calls above this limit are blocked"
                trailing={
                  <div className="pg-inline-form">
                    <Input
                      className="pg-budget-input"
                      type="number"
                      placeholder="e.g. 5"
                      aria-label="Max USDC per session"
                      value={budget}
                      onChange={e => setBudget(e.target.value)}
                    />
                    <Button size="sm" variant="primary" onClick={saveBudget}>
                      {saved ? "Saved!" : "Set"}
                    </Button>
                    {budget && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setBudget(""); localStorage.removeItem("cg_budget"); }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                }
              />
            </Ledger>

            <Ledger label="Network">
              <LedgerRow
                lead="PayPerCall Contract"
                meta={<span className="pg-mono">{CONFIG.ppcAddress}</span>}
                trailing={
                  <a
                    href={`https://explorer.testnet.arc.io/address/${CONFIG.ppcAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    className="pg-rowlink"
                  >
                    ArcScan ↗
                  </a>
                }
              />
              <LedgerRow
                lead="Connected Wallet"
                meta={<span className="pg-mono">{address}</span>}
                trailing={
                  <Button
                    size="sm"
                    variant="ghost"
                    style={{ color: "var(--danger)" }}
                    onClick={() => disconnect()}
                  >
                    Disconnect
                  </Button>
                }
              />
            </Ledger>
          </>
        }
        rail={
          <>
            <KeyValue
              label="Current session"
              rows={[
                { label: "Theme", value: theme },
                { label: "Mode", value: mode },
                { label: "Budget", value: budget ? `${budget} USDC` : "Not set", mono: Boolean(budget) },
                { label: "Network", value: "Arc Testnet" },
              ]}
            />
            <StatusNotice tone="info" title="Local preferences" live="off">
              Theme and mode are stored in this browser. Disconnecting only ends the wallet session.
            </StatusNotice>
          </>
        }
      />

      <CodeSurface
        label="SDK — QUICK INTEGRATION"
        language="ethers"
        code={SDK_SNIPPET}
      />
    </PanelShell>
  );
}

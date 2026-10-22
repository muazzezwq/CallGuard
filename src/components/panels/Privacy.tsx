import { useState, useEffect } from "react";
import { CheckCircle2, KeyRound, Link2, LockKeyhole, Trash2 } from "lucide-react";
import { Button, PageHeader, Stat, Switch } from "../../ui";
import {
  KeyValue, Ledger, LedgerRow, PanelShell, PanelSource, PanelSplit,
  SignalRow, StatusNotice,
} from "../panel/PanelUi";

const STORAGE_KEYS = [
  "cg_mode", "cg_theme", "cg_adv_open", "cg_agent_wallet",
  "cg_onboarding_step1", "cg_onboarding_step2", "cg_onboarding_step3",
  "cg_new_seen_quality", "cg_new_seen_agent", "cg_new_seen_lending",
  "cg_new_seen_futures", "cg_new_seen_attestation", "cg_budget",
];

const SETTINGS = [
  { key: "analytics", label: "Anonymous analytics", desc: "Help improve CallGuard by sharing usage data (no wallet data sent)" },
  { key: "subgraph_cache", label: "Subgraph cache", desc: "Cache subgraph responses locally for faster loading" },
  { key: "rpc_fallback", label: "Public RPC fallback", desc: "Fall back to public RPC when custom RPC is unavailable" },
  { key: "activity_history", label: "Activity history", desc: "Store recent calls and receipts in localStorage for quick access" },
];

const POLICY = [
  { icon: LockKeyhole, title: "No server-side tracking", desc: "CallGuard is a fully client-side app. No user data is sent to our servers." },
  { icon: KeyRound, title: "Keys stay in your wallet", desc: "Private keys never leave MetaMask or your connected wallet." },
  { icon: Link2, title: "On-chain data is public", desc: "All contract interactions are public on Arc Testnet by design." },
  { icon: Trash2, title: "Right to erasure", desc: "Clear all local data at any time using the button above." },
];

export default function Privacy() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    analytics: false,
    subgraph_cache: true,
    rpc_fallback: true,
    activity_history: true,
  });
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("cg_privacy_prefs");
    if (saved) { try { setPrefs(JSON.parse(saved)); } catch { /* ignore malformed prefs */ } }
  }, []);

  function toggle(key: string) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    localStorage.setItem("cg_privacy_prefs", JSON.stringify(next));
  }

  function clearData() {
    STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
    // Clear only this app's transient hand-off keys, not the whole session store
    ["callbuilder_provider", "nano_provider", "provprofile_id"].forEach(k => sessionStorage.removeItem(k));
    setCleared(true);
    setTimeout(() => setCleared(false), 3000);
  }

  const storageSize = STORAGE_KEYS.reduce((acc, k) => {
    const v = localStorage.getItem(k);
    return acc + (v ? v.length : 0);
  }, 0);

  const storedKeyCount = STORAGE_KEYS.filter(k => localStorage.getItem(k) !== null).length;

  return (
    <PanelShell>
      <PageHeader
        title="Privacy"
        subtitle="Control what data CallGuard stores locally. No server-side user data is collected."
      />

      <PanelSource
        label="Browser storage"
        value={`${storedKeyCount} of ${STORAGE_KEYS.length} tracked keys present`}
        hint="No server-side user data"
        state={storedKeyCount > 0 ? "cached" : "idle"}
      />

      <SignalRow label="Local data">
        <Stat
          label="Stored Keys"
          value={storedKeyCount}
          hint={`of ${STORAGE_KEYS.length} tracked keys`}
        />
        <Stat
          label="Data Size"
          value={`~${Math.round(storageSize / 1024 * 10) / 10}KB`}
          hint="localStorage values"
        />
      </SignalRow>

      <PanelSplit
        main={
          <>
            <Ledger label="Local Storage">
              <LedgerRow
                lead="Stored data"
                meta="CallGuard stores only UI preferences and cached blockchain data in your browser. No wallet keys, private data, or personal information is stored."
              />
              <LedgerRow
                lead="Clear local data"
                meta="Removes the tracked preference and cache keys from this browser. On-chain state is unchanged."
                trailing={
                  <Button
                    variant={cleared ? "secondary" : "danger"}
                    size="sm"
                    onClick={clearData}
                    leftIcon={cleared ? <CheckCircle2 size={14} /> : <Trash2 size={14} />}
                  >
                    {cleared ? "Cleared!" : "Clear all local data"}
                  </Button>
                }
              />
            </Ledger>
            <span className="pg-visually-hidden" role="status" aria-live="polite">
              {cleared ? "Local data cleared." : ""}
            </span>

            <Ledger label="Preferences">
              {SETTINGS.map(s => (
                <LedgerRow
                  key={s.key}
                  lead={s.label}
                  meta={s.desc}
                  trailing={
                    <span title={prefs[s.key] ? "Enabled" : "Disabled"}>
                      <Switch
                        checked={Boolean(prefs[s.key])}
                        onChange={() => toggle(s.key)}
                        label={
                          <span className="pg-visually-hidden">
                            {s.label} {prefs[s.key] ? "enabled" : "disabled"}
                          </span>
                        }
                      />
                    </span>
                  }
                />
              ))}
            </Ledger>
          </>
        }
        rail={
          <>
            <Ledger label="Data Policy">
              {POLICY.map(item => {
                const Icon = item.icon;
                return (
                  <LedgerRow
                    key={item.title}
                    lead={
                      <span className="pg-policy-title">
                        <Icon size={14} aria-hidden="true" />
                        {item.title}
                      </span>
                    }
                    meta={item.desc}
                  />
                );
              })}
            </Ledger>

            <KeyValue
              label="Storage scope"
              rows={[
                { label: "Preferences", value: "cg_privacy_prefs", mono: true },
                { label: "Tracked keys", value: `${STORAGE_KEYS.length}`, mono: true },
                { label: "Session keys", value: "3", mono: true },
                { label: "Server data", value: "None" },
              ]}
            />

            <StatusNotice tone="info" title="Local only" live="off">
              These settings are stored locally and never sent to any server.
            </StatusNotice>
          </>
        }
      />
    </PanelShell>
  );
}

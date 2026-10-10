import { useState, useEffect, useCallback } from "react";
import { Bell, Plus, Trash2, Send, ExternalLink, CheckCircle, AlertTriangle } from "lucide-react";

interface WebhookEntry {
  id: string;
  url: string;
  events: string[];
  addedAt: number;
  lastTest?: { status: number; latency: number; ok: boolean; time: number };
}

const EVENT_TYPES = ["call.opened", "call.completed", "call.slashed", "call.timeout", "provider.registered"];

const STORAGE_KEY = "cg_webhooks_v2";

function loadWebhooks(): WebhookEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveWebhooks(wh: WebhookEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wh));
}

const s = {
  page: { padding: "24px 20px", maxWidth: 1100, margin: "0 auto", paddingBottom: 80 },
  h1: { fontSize: 22, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", fontFamily: "var(--font-display)" },
  sub: { fontSize: 13, color: "var(--text-dim)", margin: "0 0 20px" },
  section: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 12 },
  sectionTitle: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 12 },
  label: { fontSize: 11, color: "var(--text-dim)", fontWeight: 600, display: "block", marginBottom: 6 },
  input: { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-3)", color: "var(--text)", fontSize: 13, boxSizing: "border-box" as const },
  btn: (v = "default", d = false) => ({ padding: "8px 14px", borderRadius: 8, border: "none", cursor: d ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, background: v === "primary" ? "linear-gradient(135deg,#10b981,#059669)" : v === "danger" ? "rgba(239,68,68,0.1)" : "var(--bg-3)", color: v === "primary" ? "#fff" : v === "danger" ? "#ef4444" : "var(--text)", opacity: d ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6 }) as React.CSSProperties,
  whCard: { background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 8 },
};

export default function Webhooks() {
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>(loadWebhooks);
  const [urlInput, setUrlInput] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["call.opened", "call.slashed"]);
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [addStatus, setAddStatus] = useState<string | null>(null);

  // Persist on change
  useEffect(() => { saveWebhooks(webhooks); }, [webhooks]);

  const handleAdd = useCallback(() => {
    const url = urlInput.trim();
    if (!url || !url.startsWith("http")) { setAddStatus("❌ Enter a valid URL (http…)"); return; }
    const entry: WebhookEntry = { id: Date.now().toString(), url, events: selectedEvents, addedAt: Date.now() };
    setWebhooks(prev => [...prev, entry]);
    setUrlInput("");
    setAddStatus(`✅ Webhook saved — ${url.slice(0, 40)}…`);
  }, [urlInput, selectedEvents]);

  const handleRemove = useCallback((id: string) => {
    setWebhooks(prev => prev.filter(w => w.id !== id));
  }, []);

  const handleTest = useCallback(async (entry: WebhookEntry) => {
    setTesting(entry.id);
    const fakeCallId = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    const payload = {
      event: "call.opened",
      callId: fakeCallId,
      providerId: 1,
      caller: "0x0000000000000000000000000000000000000001",
      amount: "1000000",
      deadline: Math.floor(Date.now() / 1000) + 120,
      payload: "ping",
      network: "arc-testnet",
      timestamp: Date.now(),
      _test: true,
    };
    const t0 = Date.now();
    try {
      const res = await fetch(entry.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const latency = Date.now() - t0;
      const body = await res.text().catch(() => "");
      const resultStr = `✅ ${res.status} ${res.statusText} · ${latency}ms${body ? ` · ${body.slice(0, 60)}` : ""}`;
      setTestResults(prev => ({ ...prev, [entry.id]: resultStr }));
      setWebhooks(prev => prev.map(w => w.id === entry.id ? { ...w, lastTest: { status: res.status, latency, ok: res.ok, time: Date.now() } } : w));
    } catch (e: unknown) {
      const resultStr = `❌ ${(e instanceof Error ? e.message : String(e))} (CORS? Use webhook.site to test)`;
      setTestResults(prev => ({ ...prev, [entry.id]: resultStr }));
    }
    setTesting(null);
  }, []);

  const toggleEvent = (ev: string) => {
    setSelectedEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
  };

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Webhooks</h1>
      <p style={s.sub}>Get POST notifications when calls open, complete, timeout, or get slashed. No backend needed to get started.</p>

      {/* Info */}
      <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "var(--text-dim)" }}>
        <strong style={{ color: "var(--accent)" }}>Quick start:</strong> Use{" "}
        <a href="https://webhook.site" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>webhook.site</a>{" "}
        to get a free URL and see the exact payload. Then point it to your own server.
        Failed deliveries are retried 3 times automatically.
      </div>

      {/* Add webhook */}
      <div style={s.section}>
        <div style={s.sectionTitle}>ADD WEBHOOK</div>
        <label style={s.label}>Endpoint URL</label>
        <input style={s.input} type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://your-server.com/webhook or https://webhook.site/…" />

        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <label style={s.label}>Events to subscribe</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {EVENT_TYPES.map(ev => (
              <label key={ev} style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, padding: "4px 10px", borderRadius: 99, background: selectedEvents.includes(ev) ? "rgba(16,185,129,0.15)" : "var(--bg-3)", border: `1px solid ${selectedEvents.includes(ev) ? "rgba(16,185,129,0.3)" : "var(--border)"}`, color: selectedEvents.includes(ev) ? "var(--accent)" : "var(--text-dim)" }}>
                <input type="checkbox" style={{ width: 12, height: 12, accentColor: "var(--accent)" }} checked={selectedEvents.includes(ev)} onChange={() => toggleEvent(ev)} />
                {ev}
              </label>
            ))}
          </div>
        </div>

        <button style={s.btn("primary")} onClick={handleAdd}>
          <Plus size={13} /> Add webhook
        </button>

        {addStatus && (
          <div style={{ marginTop: 10, fontSize: 12, color: addStatus.startsWith("✅") ? "var(--accent)" : "#ef4444" }}>{addStatus}</div>
        )}
      </div>

      {/* List */}
      <div style={s.section}>
        <div style={s.sectionTitle}>REGISTERED WEBHOOKS ({webhooks.length})</div>
        {webhooks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px", color: "var(--text-faint)", fontSize: 12 }}>
            No webhooks yet — add one above.
          </div>
        ) : webhooks.map(wh => (
          <div key={wh.id} style={s.whCard}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: wh.lastTest?.ok ? "var(--accent)" : wh.lastTest ? "#ef4444" : "var(--text-faint)", display: "inline-block", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wh.url}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                  {wh.events.map(ev => (
                    <span key={ev} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "rgba(16,185,129,0.1)", color: "var(--accent)", fontWeight: 600 }}>{ev}</span>
                  ))}
                </div>
                {wh.lastTest && (
                  <div style={{ fontSize: 11, color: wh.lastTest.ok ? "var(--accent)" : "#ef4444" }}>
                    Last: {wh.lastTest.status} · {wh.lastTest.latency}ms · {new Date(wh.lastTest.time).toLocaleTimeString("en-US", { hour12: false })}
                  </div>
                )}
                {testResults[wh.id] && (
                  <div style={{ fontSize: 11, marginTop: 4, fontFamily: "var(--font-mono)", color: testResults[wh.id].startsWith("✅") ? "var(--accent)" : "#ef4444" }}>
                    {testResults[wh.id]}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button style={s.btn("default", testing === wh.id)} onClick={() => handleTest(wh)} disabled={testing === wh.id} title="Send test event">
                  <Send size={12} /> {testing === wh.id ? "Sending…" : "Test"}
                </button>
                <button style={s.btn("danger")} onClick={() => handleRemove(wh.id)} title="Remove webhook">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sample payload */}
      <div style={s.section}>
        <div style={s.sectionTitle}>SAMPLE PAYLOAD</div>
        <pre style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", background: "var(--bg-3)", borderRadius: 8, padding: 12, overflow: "auto", margin: 0 }}>
{`// POST application/json
{
  "event": "call.opened",
  "callId": "0xabc…def",
  "providerId": 1,
  "caller": "0x1234…5678",
  "amount": "1000000",       // 1 USDC in 6-decimal units
  "deadline": 1717600000,   // unix timestamp
  "payload": "ping",
  "network": "arc-testnet",
  "timestamp": 1717599880000
}`}
        </pre>
      </div>
    </div>
  );
}

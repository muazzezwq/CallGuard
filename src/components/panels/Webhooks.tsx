import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Send } from "lucide-react";
import { Button, Chip, ChipRow, Field, Input, PageHeader } from "../../ui";
import {
  CodeSurface, KeyValue, Ledger, LedgerRow, PanelShell, PanelSource, PanelSplit, StatusNotice,
} from "../panel/PanelUi";

interface WebhookEntry {
  id: string;
  url: string;
  events: string[];
  addedAt: number;
  lastTest?: { status: number; latency: number; ok: boolean; time: number };
}

const EVENT_TYPES = ["call.opened", "call.completed", "call.slashed", "call.timeout", "provider.registered"];

const STORAGE_KEY = "cg_webhooks_v2";

const SAMPLE_PAYLOAD = `// POST application/json
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
}`;

function loadWebhooks(): WebhookEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
}
function saveWebhooks(wh: WebhookEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wh));
}

function statusTone(status: string): "success" | "danger" {
  return status.startsWith("✅") ? "success" : "danger";
}

function stripStatus(status: string): string {
  return status.replace(/^[✅❌]\s*/u, "");
}

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
    <PanelShell>
      <PageHeader
        title="Webhooks"
        subtitle="Get POST notifications when calls open, complete, timeout, or get slashed. No backend needed to get started."
      />
      <PanelSource
        label="Webhook registry"
        value={STORAGE_KEY}
        hint={`${webhooks.length} saved locally`}
        state="idle"
      />

      <PanelSplit
        main={(
          <>
            <StatusNotice tone="info" title="Quick start">
              Use{" "}
              <a href="https://webhook.site" target="_blank" rel="noreferrer">webhook.site</a>{" "}
              to get a free URL and see the exact payload. Then point it to your own server.
            </StatusNotice>

            <section className="ui-section">
              <div className="ui-section__head">
                <h2 className="ui-section__title">Add Webhook</h2>
              </div>
              <div className="ui-section__body">
                <div className="pg-form">
                  <Field label="Endpoint URL" htmlFor="wh-url">
                    <Input
                      id="wh-url"
                      type="url"
                      value={urlInput}
                      onChange={e => setUrlInput(e.target.value)}
                      placeholder="https://your-server.com/webhook or https://webhook.site/…"
                    />
                  </Field>
                  <div>
                    <div className="pg-range__label" id="wh-events-label">Events to subscribe</div>
                    <div role="group" aria-labelledby="wh-events-label" className="pg-section--spaced">
                      <ChipRow>
                        {EVENT_TYPES.map(ev => (
                          <Chip key={ev} active={selectedEvents.includes(ev)} onClick={() => toggleEvent(ev)}>
                            {ev}
                          </Chip>
                        ))}
                      </ChipRow>
                    </div>
                  </div>
                </div>
                <div className="pg-form__actions pg-form__actions--spaced">
                  <Button
                    type="button"
                    variant="primary"
                    leftIcon={<Plus size={13} />}
                    onClick={handleAdd}
                  >
                    Add webhook
                  </Button>
                </div>
                {addStatus && (
                  <StatusNotice
                    tone={statusTone(addStatus)}
                    title={stripStatus(addStatus)}
                    className="pg-section--spaced"
                  />
                )}
              </div>
            </section>

            <Ledger
              label={`Registered Webhooks (${webhooks.length})`}
              className="pg-section--spaced"
              empty={<span>No webhooks yet — add one above.</span>}
            >
              {webhooks.length > 0 && webhooks.map(wh => (
                <LedgerRow
                  key={wh.id}
                  tone={wh.lastTest?.ok ? "guard" : wh.lastTest ? "danger" : "neutral"}
                  lead={<span className="pg-webhook-url">{wh.url}</span>}
                  meta={(
                    <span className="pg-row-stack pg-row-stack--start">
                      <span className="pg-event-tags">
                        {wh.events.map(ev => (
                          <span key={ev} className="pg-event-tag">{ev}</span>
                        ))}
                      </span>
                      {wh.lastTest && (
                        <span className={wh.lastTest.ok ? "pg-testline is-ok" : "pg-testline is-err"}>
                          Last: {wh.lastTest.status} · {wh.lastTest.latency}ms · {new Date(wh.lastTest.time).toLocaleTimeString("en-US", { hour12: false })}
                        </span>
                      )}
                      {testResults[wh.id] && (
                        <span
                          className={testResults[wh.id].startsWith("✅") ? "pg-testline is-ok" : "pg-testline is-err"}
                          aria-live="polite"
                        >
                          {testResults[wh.id]}
                        </span>
                      )}
                    </span>
                  )}
                  trailing={(
                    <span className="pg-row-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        leftIcon={<Send size={12} />}
                        onClick={() => handleTest(wh)}
                        disabled={testing === wh.id}
                        loading={testing === wh.id}
                        title="Send test event"
                      >
                        {testing === wh.id ? "Sending…" : "Test"}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => handleRemove(wh.id)}
                        title="Remove webhook"
                        aria-label={`Remove webhook ${wh.url}`}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </span>
                  )}
                />
              ))}
            </Ledger>
          </>
        )}
        rail={(
          <>
            <KeyValue
              label="Registry"
              rows={[
                { label: "Storage", value: STORAGE_KEY, mono: true },
                { label: "Saved", value: String(webhooks.length) },
                { label: "Events", value: String(EVENT_TYPES.length) },
                { label: "Delivery", value: "Browser only" },
              ]}
            />
            <StatusNotice tone="warn" title="Local registry only">
              This panel stores webhooks in this browser. It has no server relay; only the Test button sends a POST.
            </StatusNotice>
            <CodeSurface
              label="Sample Payload"
              language="jsonc"
              code={SAMPLE_PAYLOAD}
              wrap
            />
          </>
        )}
      />
    </PanelShell>
  );
}

import { useOutletContext } from "react-router-dom";
import { useReveal } from "./useReveal";

const ENDPOINTS = [
  { m: "GET", p: "/api/health", d: "Service liveness and contract wiring." },
  { m: "GET", p: "/api/marketplace", d: "Listed providers with price, stake and honor rate." },
  { m: "GET", p: "/api/marketplace/health", d: "Health roll-up across listed providers." },
  { m: "POST", p: "/api/call-service", d: "Execute a paid call (server-side escrow + receipt)." },
  { m: "POST", p: "/api/nano-call", d: "Batched Circle Gateway nanopayment call." },
  { m: "GET", p: "/api/nano-balance", d: "Unified Gateway balance for an address." },
  { m: "POST", p: "/api/auto-receipt", d: "Provider webhook: sign and submit a receipt." },
  { m: "GET", p: "/api/attestation", d: "Cross-chain SLA attestation for a call id." },
];

export default function Docs() {
  const { launch } = useOutletContext<{ launch: () => void }>();
  useReveal();

  return (
    <div className="mk-container">
      <header className="mk-page-head">
        <h1 className="mk-page-title">API &amp; integration</h1>
        <p className="mk-page-sub">
          CallGuard ships as plain HTTP plus on-chain contracts. Anything that speaks HTTP — or holds a
          key — can call a service; anything that can sign can provide one.
        </p>
      </header>

      <div className="mk-section mk-section--tight">
        <h2 className="mk-h2" style={{ fontSize: 22 }}>REST endpoints</h2>
        <div className="mk-tableWrap" style={{ marginTop: 22 }}>
          <table className="mk-table">
            <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={e.p}>
                  <td><span className={`ui-badge ui-badge--${e.m === "GET" ? "info" : "guard"}`}>{e.m}</span></td>
                  <td><code style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{e.p}</code></td>
                  <td style={{ color: "var(--text-dim)" }}>{e.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mk-prose mk-section mk-section--tight" style={{ paddingTop: 0 }}>
        <h2>Call a service</h2>
        <p>Server-side call executes escrow, performs the request, and submits the signed receipt:</p>
        <div className="mk-code">
          <div><span className="dim">POST</span> /callService</div>
          <div>{"{"} <span className="cmd">"providerId"</span>: 1, <span className="cmd">"payload"</span>: {"{"} "ping": true {"}"} {"}"}</div>
          <div><span className="ok">→</span> {"{"} callId, txHash, status: "settled" {"}"}</div>
        </div>

        <h2 style={{ marginTop: 32 }}>For agents</h2>
        <ul>
          <li><strong>MCP tools</strong> — expose CallGuard as callable tools to any MCP-capable agent.</li>
          <li><strong>x402</strong> — HTTP <code>402</code> payment flow for pay-per-request access.</li>
          <li><strong>Agent wallet</strong> — a spend-limited hot wallet with daily and per-call caps.</li>
        </ul>

        <div style={{ marginTop: 32 }}>
          <button className="ui-btn ui-btn--primary ui-btn--lg" onClick={launch}>Open the app</button>
        </div>
      </div>
    </div>
  );
}

import { Badge, PageHeader } from "../../ui";
import {
  CodeSurface, KeyValue, Ledger, LedgerRow, PanelShell, PanelSource, PanelSplit, StatusNotice,
} from "../panel/PanelUi";

const ENDPOINTS = [
  { method: "GET", path: "/api/health", auth: false, desc: "Health check — RPC, signer, contract connectivity" },
  { method: "GET", path: "/api/attestation?providerId=1&type=score", auth: false, desc: "Provider reputation score + proof" },
  { method: "GET", path: "/api/attestation?callId=0x...", auth: false, desc: "Call verdict (COMPLETED/SLASHED/OPEN)" },
  { method: "POST", path: "/api/attestation", auth: true, desc: "Issue on-chain attestation (facilitator)" },
  { method: "GET", path: "/api/nano-balance?address=0x...", auth: false, desc: "USDC balance via nano endpoint" },
  { method: "POST", path: "/api/nano-call", auth: true, desc: "Nano-payment call (gasless, 0.001 USDC)" },
  { method: "GET", path: "/api/energy-data", auth: "x402", desc: "Premium energy data (x402 payment required)" },
  { method: "GET", path: "/api/premium-report", auth: "x402", desc: "Premium SLA report (x402 payment required)" },
  { method: "GET", path: "/api/mcp-server", auth: false, desc: "MCP server manifest for AI agent integration" },
];

const CODE = `// Browser JS — call a service
import { ethers } from "ethers";
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const PPC = new ethers.Contract(PPC_ADDRESS, PPC_ABI, signer);
const tx = await PPC.callService(providerId, payloadHash);
await tx.wait();`;

const EMBED = `<script src="https://arcsla.vercel.app/api/widget.js"></script>
<button data-callguard-provider="1" data-callguard-payload="ping">
  Pay with CallGuard
</button>`;

const MCP_CONFIG = `{
  "mcpServers": {
    "callguard": {
      "url": "https://arcsla.vercel.app/api/mcp-server",
      "agentWallet": "YOUR_AGENT_WALLET_ADDRESS"
    }
  }
}`;

const CONTENTS = [
  { id: "api-rest", label: "REST Endpoints" },
  { id: "api-quick", label: "Quick Integration" },
  { id: "api-widget", label: "Embed Widget" },
  { id: "api-mcp", label: "MCP Server" },
];

export default function ApiDocs() {
  return (
    <PanelShell>
      <PageHeader
        title="API & Integration Docs"
        subtitle="REST endpoints, MCP server, ERC-8004 agent identity, and SDK examples."
      />
      <PanelSource
        label="API base"
        value="https://arcsla.vercel.app/api"
        hint={`${ENDPOINTS.length} REST endpoints · MCP manifest`}
        state="idle"
      />

      <PanelSplit
        className="pg-docs-split"
        main={(
          <>
            <section id="api-rest" className="pg-docs-section">
              <Ledger
                label="REST Endpoints"
                action={<span className="pg-mono">{ENDPOINTS.length} endpoints</span>}
              >
                {ENDPOINTS.map(e=>(
                  <LedgerRow
                    key={e.path}
                    lead={<code className="pg-endpoint">{e.path}</code>}
                    meta={e.desc}
                    trailing={(
                      <span className="pg-row-actions">
                        <Badge tone={e.method === "GET" ? "guard" : "info"}>{e.method}</Badge>
                        {e.auth === "x402" && <Badge tone="pending">x402</Badge>}
                        {e.auth === true && <Badge tone="slash">Auth</Badge>}
                      </span>
                    )}
                  />
                ))}
              </Ledger>
            </section>

            <section id="api-quick" className="pg-docs-section">
              <h2 className="pg-docs-title">Quick Integration</h2>
              <CodeSurface label="JavaScript" code={CODE} />
            </section>

            <section id="api-widget" className="pg-docs-section">
              <h2 className="pg-docs-title">Embed Widget</h2>
              <CodeSurface label="HTML" code={EMBED} />
            </section>

            <section id="api-mcp" className="pg-docs-section">
              <h2 className="pg-docs-title">MCP Server</h2>
              <StatusNotice
                tone="info"
                title="Add to your AI agent config to enable autonomous USDC payments."
              />
              <CodeSurface label="JSON" code={MCP_CONFIG} className="pg-section--spaced" />
            </section>
          </>
        )}
        rail={(
          <>
            <nav className="pg-toc" aria-label="On this page">
              <div className="pg-toc__title">Contents</div>
              <ul className="pg-toc__list">
                {CONTENTS.map(item => (
                  <li key={item.id}>
                    <a className="pg-toc__link" href={`#${item.id}`}>{item.label}</a>
                  </li>
                ))}
              </ul>
            </nav>

            <KeyValue
              label="Reference"
              rows={[
                { label: "REST endpoints", value: String(ENDPOINTS.length) },
                { label: "MCP manifest", value: "/api/mcp-server", mono: true },
                { label: "Network", value: "Arc Testnet" },
                { label: "ERC-8004", value: "Agent identity" },
              ]}
            />

            <KeyValue
              label="Legend"
              rows={[
                { label: <Badge tone="guard">GET</Badge>, value: "Read" },
                { label: <Badge tone="info">POST</Badge>, value: "Write" },
                { label: <Badge tone="slash">Auth</Badge>, value: "Facilitator" },
                { label: <Badge tone="pending">x402</Badge>, value: "Paid" },
              ]}
            />
          </>
        )}
      />
    </PanelShell>
  );
}

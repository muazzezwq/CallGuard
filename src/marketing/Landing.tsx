import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { motion } from "framer-motion";
import { useSubgraph } from "../hooks/useSubgraph";
import { CONFIG } from "../lib/config";
import { useReveal } from "./useReveal";
import { NetworkGraph } from "../components/viz/NetworkGraph";
import {
  Lock, FileCheck2, ShieldCheck, Zap, Terminal, Webhook, Workflow, BadgeCheck,
  Check, Copy,
} from "lucide-react";

const HERO_CHIPS = [
  { label: "On-chain Escrow",  Icon: Lock },
  { label: "EIP-712 Receipts", Icon: FileCheck2 },
  { label: "SLA Enforcement",  Icon: ShieldCheck },
  { label: "x402 Payments",    Icon: Zap },
];

const PRODUCT = [
  {
    t: "On-chain Escrow",
    d: "Funds are escrowed when the call starts and released the moment a signed receipt lands — or refunded and slashed if the deadline passes.",
  },
  {
    t: "EIP-712 Receipts",
    d: "The response hash is committed on-chain and signed EIP-712, so a disputed result is provable — not a he-said-she-said.",
  },
  {
    t: "SLA Enforcement",
    d: "Providers stake USDC and commit to a response-time SLA. Missed deadlines are slashed on-chain, automatically and immediately.",
  },
  {
    t: "x402 Payments",
    d: "Dual settlement: per-call escrow, or batched Circle Gateway nanopayments with sub-500ms finality for high-frequency agents.",
  },
];

const FLOW = [
  { t: "Payment", s: "USDC escrowed up front" },
  { t: "SLA", s: "Set by provider" },
  { t: "Receipt", s: "EIP-712 verified" },
  { t: "Settlement", s: "On-chain" },
];

const DEVELOPERS = [
  { t: "API / MCP", d: "MCP server plus REST endpoints so any agent or service can call a service and pay per request.", Icon: Terminal },
  { t: "Webhooks", d: "Provider webhook (/api/auto-receipt) signs and submits a receipt the moment the work is done.", Icon: Webhook },
  { t: "Pipeline Hook", d: "The ERC-8183 pipeline hook wires SLA calls into agentic commerce flows.", Icon: Workflow },
  { t: "Verify Receipt", d: "Independently verify an EIP-712 receipt and reconstruct the SLA lifecycle for any call.", Icon: BadgeCheck },
];

const ECOSYSTEM = [
  { name: "Arc",      glyph: "◠" },
  { name: "Circle",   glyph: "○" },
  { name: "Ethereum", glyph: "◆" },
  { name: "Base",     glyph: "◉" },
  { name: "Polygon",  glyph: "⬡" },
];

const CODE = `POST /callService
{ "providerId": 1, "payload": { "ping": true } }
-> { callId, txHash, status: "settled" }`;

const OPEN_STATES = new Set(["STARTED", "OPEN", "PENDING"]);

type Call = { id: string; status: string; amount: string; providerId: string };
type Prov = { id: string; active: boolean; completedCalls: string; slashedCalls: string };

const Q = `{
  calls(first:120,orderBy:createdAt,orderDirection:desc){id status amount providerId}
  providers(first:60,orderBy:completedCalls,orderDirection:desc){id active completedCalls slashedCalls}
}`;

function Num({ value }: { value: number }) {
  return <>{value.toLocaleString("en-US")}</>;
}

export default function Landing() {
  const { launch } = useOutletContext<{ launch: () => void }>();
  const { data } = useSubgraph<{ calls: Call[]; providers: Prov[] }>(Q, { enabled: true });
  const [copied, setCopied] = useState(false);
  useReveal([data]);

  const stats = useMemo(() => {
    const calls = data?.calls ?? [];
    const provs = data?.providers ?? [];
    const completed = provs.reduce((s, p) => s + Number(p.completedCalls || 0), 0);
    const slashed = provs.reduce((s, p) => s + Number(p.slashedCalls || 0), 0);
    const total = completed + slashed;
    const escrowRaw = calls
      .filter((c) => OPEN_STATES.has(c.status))
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);
    return {
      totalCalls: total || calls.length,
      activeProviders: provs.filter((p) => p.active).length || provs.length,
      escrow: escrowRaw / 1e6,
      honor: total > 0 ? Math.round(((completed + 2) / (total + 3)) * 100) : null,
    };
  }, [data]);

  const copy = () => {
    navigator.clipboard?.writeText(CODE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  };

  return (
    <>
      {/* ── HERO ── */}
      <section className="mk-hero">
        <div className="mk-container mk-hero__grid">
          <div className="mk-hero__copy">
            <h1 className="mk-hero__title">
              Reliable Calls.
              <br />
              On-Chain Trust.
              <br />
              <em>Built for AI Agents.</em>
            </h1>
            <p className="mk-hero__sub">
              CallGuard is a programmable SLA marketplace for autonomous services. Pay per request,
              verify with EIP-712 receipts, and get protected by on-chain escrow, slashing and settlement.
            </p>
            <div className="mk-hero__cta">
              <button className="ui-btn ui-btn--primary ui-btn--lg" onClick={launch}>Launch App</button>
              <Link className="ui-btn ui-btn--outline ui-btn--lg" to="/docs">Explore Docs</Link>
            </div>
            <ul className="mk-hero__chips">
              {HERO_CHIPS.map(({ label, Icon }) => (
                <li className="mk-chip" key={label}><Icon size={13} strokeWidth={2.2} />{label}</li>
              ))}
            </ul>
          </div>

          <div className="mk-hero__art">
            <NetworkGraph labels={["AI Agents", "Providers", "Callers"]} seed={11} height={420} />
          </div>
        </div>

        <div className="mk-container mk-trust">
          <p className="mk-trust__lead">Trusted by developers building the next generation of autonomous services</p>
          <div className="mk-trust__logos">
            {ECOSYSTEM.map((e) => (
              <span className="mk-eco" key={e.name} aria-label={e.name}>
                <span className="mk-eco__glyph" aria-hidden="true">{e.glyph}</span>
                <span className="mk-eco__name">{e.name}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUCT ── */}
      <section className="mk-section" id="product">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">Everything a call needs to be trustworthy.</h2>
            <p className="mk-lead">Four primitives turn a vague API promise into a contract you can enforce.</p>
          </div>
          <div className="mk-prodgrid mk-reveal">
            {PRODUCT.map((p) => (
              <div className="mk-prodcard" key={p.t}>
                <span className="mk-prodcard__t">{p.t}</span>
                <span className="mk-prodcard__d">{p.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRANSACTION FLOW ── */}
      <section className="mk-section mk-section--tight">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">One call, four steps, all on-chain.</h2>
            <p className="mk-lead">Every call is a small on-chain agreement, settled atomically.</p>
          </div>
          <div className="mk-flow mk-flow--seq">
            {FLOW.map((f, i) => (
              <motion.div
                className="mk-flow__item"
                key={f.t}
                initial={{ opacity: 0.35, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.45, delay: i * 0.18 }}
              >
                <span className="mk-flow__n">{i + 1}</span>
                <span className="mk-flow__t">{f.t}<small>{f.s}</small></span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DEVELOPERS ── */}
      <section className="mk-section" id="developers">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">Build against it in an afternoon.</h2>
            <p className="mk-lead">Plain HTTP plus on-chain contracts. Anything that speaks HTTP can call a service.</p>
          </div>
          <div className="mk-devgrid mk-reveal">
            {DEVELOPERS.map(({ t, d, Icon }) => (
              <div className="mk-devcard" key={t}>
                <span className="mk-devcard__ico"><Icon size={16} strokeWidth={2.1} /></span>
                <span className="mk-devcard__t">{t}</span>
                <span className="mk-devcard__d">{d}</span>
              </div>
            ))}
          </div>
          <div className="mk-codewrap mk-reveal">
            <button className="mk-copy" onClick={copy} aria-label="Copy code">
              {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}
            </button>
            <pre className="mk-codeblock">{CODE}</pre>
          </div>
        </div>
      </section>

      {/* ── LIVE STATS ── */}
      <section className="mk-section mk-section--tight">
        <div className="mk-container">
          <div className="mk-band mk-reveal">
            <div className="mk-band__cell"><div className="mk-band__v"><Num value={stats.totalCalls} /></div><div className="mk-band__l">Total Calls</div></div>
            <div className="mk-band__cell"><div className="mk-band__v"><Num value={stats.activeProviders} /></div><div className="mk-band__l">Active Providers</div></div>
            <div className="mk-band__cell"><div className="mk-band__v">{stats.escrow.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div><div className="mk-band__l">Escrowed USDC</div></div>
            <div className="mk-band__cell"><div className="mk-band__v mk-band__v--guard">{stats.honor === null ? "—" : `${stats.honor}%`}</div><div className="mk-band__l">SLA Success Rate</div></div>
          </div>
        </div>
      </section>

      {/* ── ECOSYSTEM ── */}
      <section className="mk-section mk-section--tight" id="ecosystem">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">Built on Arc, connected everywhere.</h2>
          </div>
          <div className="mk-trust__logos mk-reveal">
            {ECOSYSTEM.map((e) => (
              <span className="mk-eco" key={e.name} aria-label={e.name}>
                <span className="mk-eco__glyph" aria-hidden="true">{e.glyph}</span>
                <span className="mk-eco__name">{e.name}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mk-cta">
        <div className="mk-container mk-reveal">
          <h2 className="mk-cta__title">Make reliability something you can buy.</h2>
          <p className="mk-cta__sub">Connect a wallet to call a service, or stake USDC and start earning per answered call.</p>
          <div className="mk-hero__cta">
            <button className="ui-btn ui-btn--primary ui-btn--lg" onClick={launch}>Launch App</button>
            <Link className="ui-btn ui-btn--outline ui-btn--lg" to="/docs">Explore Docs</Link>
          </div>
        </div>
      </section>
    </>
  );
}

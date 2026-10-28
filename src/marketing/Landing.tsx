import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useSubgraph } from "../hooks/useSubgraph";
import { useReveal } from "./useReveal";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { NetworkGraph } from "../components/viz/NetworkGraph";
import { ACTIVE_PPC_ADDRESS, ACTIVE_REGISTRY_ADDRESS, CONFIG } from "../lib/config";
import { INTEGRATIONS, badgeTone } from "../lib/landing/claims";
import { CALL_WINDOW, landingStats, type CallRow, type ProviderRow } from "../lib/landing/stats";
import {
  Lock, FileCheck2, ShieldCheck, Zap, Terminal, Webhook, Workflow, BadgeCheck,
  Check, Copy, Coins, Boxes, Clock, ChevronDown, ExternalLink,
} from "lucide-react";

const HeroScene = lazy(() => import("./HeroScene"));

const HERO_CHIPS = [
  { label: "USDC Settlement",     Icon: Coins },
  { label: "EIP-712 Verification", Icon: FileCheck2 },
  { label: "On-chain Enforcement", Icon: ShieldCheck },
  { label: "Built on Arc",         Icon: Boxes },
];

const PROBLEM = [
  {
    t: "Paying for a call today",
    items: [
      "You pay up front, on trust",
      "A 500 is just a 500 — no proof, no record",
      "Deadlines slip with no consequence",
      "Disputes happen off-chain, if at all",
    ],
  },
  {
    t: "Paying through CallGuard",
    good: true,
    items: [
      "Payment is escrowed before the call starts",
      "Every response is a signed, on-chain receipt",
      "Missed deadlines are slashable, per the SLA",
      "Refunds and slashing follow on-chain rules",
    ],
  },
];

const PRIMITIVES = [
  {
    t: "On-chain Escrow",
    d: "The caller's USDC is held by PayPerCall when the call starts, and released only against a verified receipt.",
    Icon: Lock,
  },
  {
    t: "EIP-712 Receipts",
    d: "Providers sign the response hash with domain ArcSLA/2. The signature is recovered and checked on-chain.",
    Icon: FileCheck2,
  },
  {
    t: "SLA Enforcement",
    d: "Each provider commits to a max response time and a slash percentage. Breach it and stake is slashed.",
    Icon: ShieldCheck,
  },
  {
    t: "x402 + Gateway",
    d: "x402 per-call escrow is the SLA path. Circle Gateway nanopayments of 0.001 USDC move plain USDC outside it — no call, no receipt, no slash.",
    Icon: Zap,
  },
];

const FLOW = [
  { t: "Payment",    s: "USDC enters escrow for this call" },
  { t: "SLA",        s: "Provider terms: deadline and slash %" },
  { t: "Receipt",    s: "Response hash signed EIP-712" },
  { t: "Settlement", s: "Release, refund or slash — on-chain" },
];

const OUTCOMES = [
  {
    key: "settled",
    Icon: Check,
    t: "Receipt verified in time",
    d: "The provider submits a valid EIP-712 receipt before the deadline. PayPerCall recovers the signer and settles.",
    items: [
      "Signature must match the provider's registered signer",
      "Escrow is released to the provider",
      "The completion is recorded on-chain and read by the subgraph",
    ],
  },
  {
    key: "missed",
    Icon: Clock,
    t: "Deadline missed",
    d: "No valid receipt arrives by the deadline plus the 5-second submit grace.",
    items: [
      "The caller can reclaim the escrowed amount",
      "The provider's stake is slashed by the SLA's slash %",
      "The penalty follows the provider's terms, not a fixed rate",
    ],
  },
];

const DEVELOPERS = [
  {
    t: "REST API",
    d: "POST /callService answers 402 with the provider's terms, then calls callServiceWithAuthorization with the signed EIP-3009 authorization.",
    Icon: Terminal,
  },
  {
    t: "MCP server (self-hosted)",
    d: "Three MCP servers live in the repository under x402-facilitator/. None is deployed on arcsla.vercel.app, so you run one yourself against the subgraph.",
    Icon: Workflow,
  },
  {
    t: "Webhooks",
    d: "POST /api/auto-receipt lets a provider sign and submit a receipt the moment the work completes.",
    Icon: Webhook,
  },
  {
    t: "Pipeline hook — not wired",
    d: "PayPerCallV8 has no ERC-8183 hook. The ERC-8183 reference contract is reachable as a separate job flow; it is not wired into the call lifecycle.",
    Icon: BadgeCheck,
  },
];

const ECOSYSTEM = [
  { n: "Arc",            role: "Settlement network — chain 5042002, USDC-native gas", s: "Live",     k: "impl" },
  { n: "Circle USDC",    role: "The settlement asset, 6 decimals",                     s: "Live",     k: "impl" },
  { n: "Circle Gateway", role: "0.001 USDC nanopayments, settled as plain USDC outside the SLA", s: "Outside SLA", k: "opt" },
  { n: "CCTP",           role: "Burn-and-mint USDC from Sepolia, Base Sepolia and Polygon Amoy",   s: "Testnet",  k: "test" },
  { n: "Ethereum",       role: "EIP-712 typed receipts and EVM tooling",               s: "Standard", k: "opt" },
  { n: "ERC-8004 / 8183", role: "Reference contracts; not wired into the SLA call path", s: "Not wired", k: "opt" },
];

const CONTRACTS = [
  { name: "ServiceRegistry", role: "Providers, stakes and SLA terms", addr: ACTIVE_REGISTRY_ADDRESS },
  { name: "PayPerCall",      role: "Escrow, receipts and settlement", addr: ACTIVE_PPC_ADDRESS },
  { name: "USDC",            role: "Settlement token and gas",        addr: CONFIG.usdcAddress },
];

const FAQ = [
  {
    q: "What is CallGuard?",
    a: "A pay-per-call marketplace for services. Callers escrow USDC per request; providers stake USDC and commit to a response-time SLA. Settlement happens on-chain.",
  },
  {
    q: "How does a provider define an SLA?",
    a: "At registration a provider sets a price per call, a maximum response time and a slash percentage. Those terms live in ServiceRegistry and are read back at settlement.",
  },
  {
    q: "How are receipts verified?",
    a: "After the work, the provider signs the response hash with EIP-712 (domain ArcSLA, version 2, including respondedAt and the call's terms version). PayPerCall recovers the signer on-chain and requires it to match the provider's registered signer.",
  },
  {
    q: "What happens when a deadline is missed?",
    a: "Once the deadline plus the 5-second submit grace passes with no valid receipt, the caller can reclaim the escrowed amount and the provider's stake can be slashed by the SLA's slash percentage. The penalty follows the provider's configured terms, not a fixed rule.",
  },
  {
    q: "How does settlement work?",
    a: "On a valid receipt, escrow is released to the provider. On a missed deadline, the caller is refunded and the provider is slashed. Circle Gateway nanopayments are separate: they move 0.001 USDC as a plain transfer, with no call and no SLA.",
  },
  {
    q: "Which network is supported?",
    a: "Arc Testnet, chain ID 5042002, where USDC is also the gas token. CCTP bridging is wired for testnets.",
  },
  {
    q: "What can be disputed?",
    a: "A completed call can be disputed in DisputeV4 (0xECDb019F1E92Ad35324cc7bBDf1D56b9e70B305B), which escrows a bond and reads evidence from SLAEvidenceRegistryV2 (0x64872c29A19dF8E471103d0708397BAb96A311FC). Two kinds are anchored today: zk-execution, a RISC Zero receipt binding the committed response to the call, and witness, a provenance record of the bytes a key saw. Evidence never changes a bond, a window or a verdict.",
  },
  {
    q: "How do developers integrate?",
    a: "POST /callService with a signed EIP-3009 authorization, or run the self-hosted MCP server from the repository. Both paths end in the same on-chain lifecycle.",
  },
];

const CODE = `POST /callService
{
  "providerId": 1,
  "requestHash": "0x…keccak256(payload)",
  "authorization": {
    "from": "0x…",
    "to": "0x3600…0000",
    "value": "1000000",
    "validAfter": "0",
    "validBefore": "1790000000",
    "nonce": "0x…"
  },
  "signature": "0x…"
}

-> { "success": true, "callId": "0x…", "txHash": "0x…" }`;

type Call = CallRow;
type Prov = ProviderRow;

const Q = `{
  calls(first:${CALL_WINDOW},orderBy:createdAt,orderDirection:desc){id status amount providerId}
  providers(first:60,orderBy:completedCalls,orderDirection:desc){id active completedCalls slashedCalls}
}`;

function Num({ value }: { value: number }) {
  return <>{value.toLocaleString("en-US")}</>;
}

function short(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

const ART_LABELS = ["AI Agents", "Providers", "Callers"];

function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

/* Low-end guard: WebGL may exist but be software-rendered / underpowered. */
function isLowEnd() {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 8;
  const mem = nav.deviceMemory ?? 8;
  return cores <= 4 || mem <= 4;
}

function HeroArt() {
  const reduce = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [count, setCount] = useState(60);
  const [scene, setScene] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCount(window.innerWidth < 700 ? 28 : 60);
    setScene(supportsWebGL() && !isLowEnd());
    setReady(true);
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setPaused(!e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const fallback = <div className="viz3d-fallback"><NetworkGraph labels={ART_LABELS} seed={11} height={420} /></div>;

  return (
    <div className="viz3d-wrap" ref={box}>
      {ready && scene && !reduce ? (
        <Suspense fallback={fallback}>
          <HeroScene paused={paused} count={count} />
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
}

function CopyAddr({ addr }: { addr: string }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(addr).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    }).catch(() => {});
  };
  return (
    <button className="mk-contract__copy" onClick={copy} aria-label={`Copy ${addr}`}>
      {done ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

export default function Landing() {
  const { launch } = useOutletContext<{ launch: () => void }>();
  const { data } = useSubgraph<{ calls: Call[]; providers: Prov[] }>(Q, { enabled: true });
  const [copied, setCopied] = useState(false);
  const [focus, setFocus] = useState<"settled" | "missed" | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  useReveal([data]);

  const stats = useMemo(
    () => landingStats(data?.calls ?? [], data?.providers ?? []),
    [data],
  );

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
              Trust Every Call. Enforce Every Promise.
            </h1>
            <p className="mk-hero__sub">
              Programmable settlement infrastructure for AI agents and autonomous services. Define the
              terms, verify execution with signed receipts, and let on-chain rules govern settlement.
            </p>
            <div className="mk-hero__cta">
              <button className="ui-btn ui-btn--primary ui-btn--lg" onClick={launch}>Launch App</button>
              <Link className="ui-btn ui-btn--outline ui-btn--lg" to="/how-it-works">Explore the Protocol</Link>
            </div>
            <ul className="mk-hero__chips">
              {HERO_CHIPS.map(({ label, Icon }) => (
                <li className="mk-chip" key={label}><Icon size={13} strokeWidth={2.2} />{label}</li>
              ))}
            </ul>
          </div>

          <div className="mk-hero__art">
            <HeroArt />
          </div>
        </div>
      </section>

      {/* ── A · THE PROBLEM ── */}
      <section className="mk-section mk-section--field" id="problem">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">Payments can be automated. Reliability should be too.</h2>
            <p className="mk-lead">
              Agents already pay for work over HTTP. What they cannot do is prove a promise was kept — so a
              missed deadline costs a support ticket, not a settlement.
            </p>
          </div>
          <div className="mk-problem mk-reveal">
            {PROBLEM.map((p) => (
              <div className={`mk-problem__panel${p.good ? " is-good" : ""}`} key={p.t}>
                <span className="mk-problem__h">{p.t}</span>
                <ul className="mk-problem__list">
                  {p.items.map((it) => (
                    <li key={it} className="mk-problem__item">
                      <span className="mk-problem__mark" aria-hidden="true">{p.good ? "✓" : "✕"}</span>
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mk-note mk-reveal">
            CallGuard turns a service promise into something the chain can enforce: escrow, a signed receipt,
            and rules that settle without anyone in the middle.
          </p>
        </div>
      </section>

      {/* ── PRIMITIVES ── */}
      <section className="mk-section" id="product">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">Four primitives make a call enforceable.</h2>
            <p className="mk-lead">Each one removes a piece of trust from the loop.</p>
          </div>
          <div className="mk-bento mk-reveal">
            {PRIMITIVES.map(({ t, d, Icon }) => (
              <div className="mk-cell mk-cell--half" key={t}>
                <span className="mk-devcard__ico"><Icon size={16} strokeWidth={2.1} /></span>
                <span className="mk-cell__t">{t}</span>
                <span className="mk-cell__d">{d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── B · PROTOCOL LIFECYCLE ── */}
      <section className="mk-section mk-section--tight" id="protocol">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">One request, four on-chain steps.</h2>
            <p className="mk-lead">Payment, terms, proof and settlement — every step is a transaction you can audit.</p>
          </div>
          <ol className="mk-track mk-reveal">
            {FLOW.map((f, i) => (
              <li className="mk-track__item" key={f.t} style={{ "--d": `${i * 0.16}s` } as CSSProperties}>
                <span className="mk-track__node" aria-hidden="true">
                  <span className="mk-track__num">{i + 1}</span>
                  <Check className="mk-track__check" size={18} strokeWidth={2.6} />
                </span>
                <span className="mk-track__body">
                  <span className="mk-track__t">{f.t}</span>
                  <span className="mk-track__s">{f.s}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── C · TWO OUTCOMES ── */}
      <section className="mk-section" id="outcomes">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">One request. Two possible outcomes.</h2>
            <p className="mk-lead">Settlement depends on whether a valid receipt lands before the deadline.</p>
          </div>
          <div className="mk-switch mk-reveal" role="group" aria-label="Highlight an outcome">
            <button
              className={`mk-switch__btn${focus === null ? " is-on" : ""}`}
              aria-pressed={focus === null}
              onClick={() => setFocus(null)}
            >Both</button>
            {OUTCOMES.map((o) => (
              <button
                key={o.key}
                className={`mk-switch__btn${focus === o.key ? " is-on" : ""}`}
                aria-pressed={focus === o.key}
                onClick={() => setFocus(focus === o.key ? null : (o.key as "settled" | "missed"))}
              >{o.t}</button>
            ))}
          </div>
          <div className="mk-outcome mk-reveal">
            {OUTCOMES.map((o) => (
              <div
                key={o.key}
                className={`mk-outcome__card${o.key === "settled" ? " is-good" : " is-late"}${
                  focus === o.key ? " is-active" : focus !== null ? " is-dim" : ""
                }`}
              >
                <span className="mk-outcome__ico"><o.Icon size={18} strokeWidth={2.2} /></span>
                <span className="mk-outcome__t">{o.t}</span>
                <span className="mk-outcome__d">{o.d}</span>
                <ul className="mk-outcome__list">
                  {o.items.map((it) => <li key={it}>{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── D · ACTIVITY & EVIDENCE ── */}
      <section className="mk-section mk-section--field" id="activity">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">Built to be verified.</h2>
            <p className="mk-lead">
              Read straight from the live CallGuard subgraph on Arc Testnet. Values are rounded for display.
            </p>
          </div>
          <div className="mk-band mk-reveal">
            <div className="mk-band__cell">
              <div className="mk-band__v">{stats.hasData ? <Num value={stats.settledOrSlashed} /> : "—"}</div>
              <div className="mk-band__l">Calls settled or slashed</div>
            </div>
            <div className="mk-band__cell">
              <div className="mk-band__v">{stats.hasData ? <Num value={stats.activeProviders} /> : "—"}</div>
              <div className="mk-band__l">Active providers</div>
            </div>
            <div className="mk-band__cell">
              <div className="mk-band__v">
                {stats.hasData
                  ? `${stats.escrowCapped ? "≥ " : ""}${stats.escrow.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                  : "—"}
              </div>
              <div className="mk-band__l">USDC in open escrow · newest {CALL_WINDOW} calls</div>
            </div>
            <div className="mk-band__cell">
              <div className="mk-band__v mk-band__v--guard">
                {stats.reputationScore === null ? "—" : `${stats.reputationScore}%`}
              </div>
              <div className="mk-band__l">Bayesian reputation score</div>
            </div>
          </div>
          <p className="mk-note mk-reveal">
            The score is <span className="mk-mono">(completed + 2) / (completed + slashed + 3)</span>, so it
            starts at 67% and never reaches 100%. Escrow covers the open calls inside the newest{" "}
            {CALL_WINDOW}, which is why it can read as a floor. Source: CallGuard subgraph · refreshed every
            30 seconds.{" "}
            <a className="mk-link" href={CONFIG.subgraphUrl} target="_blank" rel="noopener noreferrer">
              Inspect the subgraph<ExternalLink size={12} strokeWidth={2.4} />
            </a>
          </p>
        </div>
      </section>

      {/* ── E · DEVELOPERS ── */}
      <section className="mk-section" id="developers">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">Give every service call a verifiable outcome.</h2>
            <p className="mk-lead">
              Call a payable endpoint, or wire CallGuard into an agent framework. Every path ends in the same
              on-chain lifecycle.
            </p>
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

          <ul className="mk-pills mk-reveal">
            {INTEGRATIONS.map((it) => (
              <li className={`mk-pill mk-pill--${badgeTone(it.state)}`} key={it.name} title={it.detail}>
                <span className="mk-pill__dot" aria-hidden="true" />
                <span className="mk-pill__n">{it.name}</span>
                <span className="mk-pill__s">{it.status}</span>
              </li>
            ))}
          </ul>

          <div className="mk-codewrap mk-reveal">
            <button className="mk-copy" onClick={copy} aria-label="Copy code">
              {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Copied" : "Copy"}
            </button>
            <pre className="mk-codeblock">{CODE}</pre>
          </div>
        </div>
      </section>

      {/* ── F · CONNECTED STACK ── */}
      <section className="mk-section mk-section--tight" id="ecosystem">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">One settlement layer. A connected stack.</h2>
            <p className="mk-lead">CallGuard settles on Arc and interoperates with the Circle stack. Each label states what the piece actually does here.</p>
          </div>
          <div className="mk-ecogrid mk-reveal">
            {ECOSYSTEM.map((e) => (
              <div className="mk-ecocard" key={e.n}>
                <div className="mk-ecocard__top">
                  <span className="mk-ecocard__n">{e.n}</span>
                  <span className={`mk-tag mk-tag--${e.k}`}>{e.s}</span>
                </div>
                <span className="mk-ecocard__role">{e.role}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── G · TRUST & VERIFICATION ── */}
      <section className="mk-section" id="trust">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">Audit it yourself.</h2>
            <p className="mk-lead">
              There is no security audit to point at. Everything below is public and verifiable on Arc Testnet.
            </p>
          </div>
          <div className="mk-contracts mk-reveal">
            {CONTRACTS.map((c) => (
              <div className="mk-contract" key={c.name}>
                <div>
                  <div className="mk-contract__name">{c.name}</div>
                  <div className="mk-contract__role">{c.role}</div>
                </div>
                <div className="mk-contract__right">
                  <a
                    className="mk-contract__addr"
                    href={CONFIG.explorerAddr(c.addr)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={c.addr}
                  >
                    {short(c.addr)}
                  </a>
                  <CopyAddr addr={c.addr} />
                </div>
              </div>
            ))}
          </div>

          <dl className="mk-facts mk-reveal">
            <div className="mk-fact">
              <dt>Network</dt>
              <dd>Arc Testnet · chain <span className="mk-mono">5042002</span></dd>
            </div>
            <div className="mk-fact">
              <dt>RPC</dt>
              <dd><span className="mk-mono">rpc.testnet.arc.io</span></dd>
            </div>
            <div className="mk-fact">
              <dt>Explorer</dt>
              <dd>
                <a className="mk-link" href={CONFIG.explorerBase} target="_blank" rel="noopener noreferrer">
                  explorer.testnet.arc.io<ExternalLink size={12} strokeWidth={2.4} />
                </a>
              </dd>
            </div>
            <div className="mk-fact">
              <dt>Source</dt>
              <dd>
                <a className="mk-link" href="https://github.com/muazzezwq/CallGuard" target="_blank" rel="noopener noreferrer">
                  GitHub<ExternalLink size={12} strokeWidth={2.4} />
                </a>
              </dd>
            </div>
            <div className="mk-fact">
              <dt>Tests</dt>
              <dd>Foundry suite — run <span className="mk-mono">forge test</span></dd>
            </div>
            <div className="mk-fact">
              <dt>Docs</dt>
              <dd><Link className="mk-link" to="/docs">Protocol documentation</Link></dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ── H · FAQ ── */}
      <section className="mk-section mk-section--tight" id="faq">
        <div className="mk-container mk-faq__wrap">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">Questions, answered.</h2>
          </div>
          <div className="mk-faq mk-reveal">
            {FAQ.map((f, i) => {
              const open = openFaq === i;
              return (
                <div className={`mk-faq__item${open ? " is-open" : ""}`} key={f.q}>
                  <h3 className="mk-faq__h">
                    <button
                      className="mk-faq__q"
                      aria-expanded={open}
                      aria-controls={`faq-panel-${i}`}
                      id={`faq-btn-${i}`}
                      onClick={() => setOpenFaq(open ? null : i)}
                    >
                      <span>{f.q}</span>
                      <ChevronDown className="mk-faq__chev" size={18} strokeWidth={2.2} />
                    </button>
                  </h3>
                  <div
                    className="mk-faq__a"
                    id={`faq-panel-${i}`}
                    role="region"
                    aria-labelledby={`faq-btn-${i}`}
                    hidden={!open}
                  >
                    <p>{f.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── I · CTA ── */}
      <section className="mk-cta">
        <div className="mk-container mk-reveal">
          <h2 className="mk-cta__title">Make reliability part of the protocol.</h2>
          <p className="mk-cta__sub">Connect a wallet to call a service, or stake USDC and earn per answered call.</p>
          <div className="mk-hero__cta mk-hero__cta--center">
            <button className="ui-btn ui-btn--primary ui-btn--lg" onClick={launch}>Launch App</button>
            <Link className="ui-btn ui-btn--outline ui-btn--lg" to="/how-it-works">Explore the Protocol</Link>
          </div>
        </div>
      </section>
    </>
  );
}

import { useMemo } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { useSubgraph } from "../hooks/useSubgraph";
import { useCountUp } from "../hooks/useCountUp";
import { CONFIG } from "../lib/config";
import { AddressPill } from "../ui";
import { useReveal } from "./useReveal";
import { NetworkGraph } from "../components/viz/NetworkGraph";
import { Lock, FileCheck2, ShieldCheck, Zap } from "lucide-react";

const HERO_CHIPS = [
  { label: "On-chain Escrow",  Icon: Lock },
  { label: "EIP-712 Receipts", Icon: FileCheck2 },
  { label: "SLA Enforcement",  Icon: ShieldCheck },
  { label: "x402 Payments",    Icon: Zap },
];

const ECOSYSTEM = [
  { name: "Arc",      glyph: "◠" },
  { name: "Circle",   glyph: "○" },
  { name: "Ethereum", glyph: "◆" },
  { name: "Base",     glyph: "◉" },
  { name: "Polygon",  glyph: "⬡" },
];

type Call = { id: string; status: string; amount: string; createdAt: string; providerId: string; caller: string };
type Prov = { id: string; pricePerCall: string; stake: string; active: boolean; completedCalls: string; slashedCalls: string };
type CGData = { calls: Call[]; providers: Prov[] };

const Q = `{
  calls(first:120,orderBy:createdAt,orderDirection:desc){id status amount createdAt providerId caller}
  providers(first:60,orderBy:completedCalls,orderDirection:desc){id pricePerCall stake active completedCalls slashedCalls}
}`;

const usdc = (raw: string) => (Number(raw) / 1e6);
const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });
const honorPct = (c: number, s: number) => (c + s > 0 ? Math.round(((c + 2) / (c + s + 3)) * 100) : 66);

function Num({ value, className }: { value: number; className?: string }) {
  const n = useCountUp(value || 0, 900);
  return <span className={className}>{n.toLocaleString("en-US")}</span>;
}

function statusOf(s: string) {
  return s === "COMPLETED"
    ? { cls: "mk-status--done", label: "settled" }
    : s === "SLASHED"
    ? { cls: "mk-status--slash", label: "slashed" }
    : s === "REFUNDED"
    ? { cls: "mk-status--slash", label: "refunded" }
    : { cls: "mk-status--open", label: "open" };
}

function Contracts() {
  const list = [
    { name: "ServiceRegistry", role: "stake · SLA terms", addr: CONFIG.registry },
    { name: "PayPerCall", role: "escrow · receipts", addr: CONFIG.payPerCall },
    { name: "ReputationLoan", role: "reputation-backed credit", addr: CONFIG.reputationLoan },
    { name: "SLAFutures", role: "ERC-1155 capacity", addr: CONFIG.slaFutures },
    { name: "AgentWallet", role: "spend-limited agent txns", addr: CONFIG.agentWallet },
    { name: "USDC", role: "settlement + native gas", addr: CONFIG.usdc },
  ];
  return (
    <div className="mk-contracts">
      {list.map((c) => (
        <div className="mk-contract" key={c.name}>
          <div>
            <div className="mk-contract__name">{c.name}</div>
            <div className="mk-contract__role">{c.role}</div>
          </div>
          <AddressPill value={c.addr} href={CONFIG.explorerAddr(c.addr)} />
        </div>
      ))}
    </div>
  );
}

export default function Landing() {
  const { launch } = useOutletContext<{ launch: () => void }>();
  const { data } = useSubgraph<CGData>(Q, { enabled: true });
  useReveal([data]);

  const stats = useMemo(() => {
    const calls = data?.calls ?? [];
    const provs = data?.providers ?? [];
    const completed = provs.reduce((s, p) => s + Number(p.completedCalls || 0), 0);
    const slashed = provs.reduce((s, p) => s + Number(p.slashedCalls || 0), 0);
    const total = completed + slashed;
    return {
      activeProviders: provs.filter((p) => p.active).length || provs.length,
      totalCalls: total || calls.length,
      slashes: slashed,
      honor: Math.round(((completed + 2) / (total + 3)) * 100),
    };
  }, [data]);

  const top = (data?.providers ?? [])
    .map((p) => ({ ...p, c: Number(p.completedCalls || 0), s: Number(p.slashedCalls || 0) }))
    .sort((a, b) => honorPct(b.c, b.s) - honorPct(a.c, a.s) || b.c - a.c)
    .slice(0, 8);

  const recent = (data?.calls ?? []).slice(0, 6);

  const ribbon = [
    { k: "Active providers", v: String(stats.activeProviders) },
    { k: "Calls settled", v: stats.totalCalls.toLocaleString("en-US") },
    { k: "Honor rate", v: `${stats.honor}%` },
    { k: "Slashes", v: String(stats.slashes) },
    { k: "Network", v: "Arc Testnet" },
    { k: "Settlement", v: "USDC-native" },
    { k: "Receipts", v: "EIP-712" },
  ];

  return (
    <>
      {/* ── HERO ─────────────────────────────────────── */}
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
      </section>

      {/* ── TRUSTED BY ───────────────────────────────── */}
      <section className="mk-trust">
        <div className="mk-container">
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

      {/* ── LIVE ACTIVITY ────────────────────────────── */}
      <section className="mk-section mk-section--tight">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">Live on Arc Testnet.</h2>
            <p className="mk-lead">Real calls, settled on-chain right now. This panel reads the public subgraph — no mock numbers.</p>
          </div>
          <div className="mk-panel mk-reveal" aria-label="Live protocol activity">
            <div className="mk-panel__head">
              <span className="mk-panel__headL"><span className="mk-live" /> Protocol activity</span>
              <span className="mk-panel__headL" style={{ color: "var(--text-faint)" }}>Arc Testnet</span>
            </div>
            <div className="mk-panel__stats">
              <div className="mk-panel__stat">
                <div className="mk-panel__statV"><Num value={stats.activeProviders} /></div>
                <div className="mk-panel__statL">Active providers</div>
              </div>
              <div className="mk-panel__stat">
                <div className="mk-panel__statV"><Num value={stats.totalCalls} /></div>
                <div className="mk-panel__statL">Calls settled</div>
              </div>
              <div className="mk-panel__stat">
                <div className="mk-panel__statV" style={{ color: "var(--accent)" }}>{stats.honor}%</div>
                <div className="mk-panel__statL">Honor rate</div>
              </div>
            </div>
            <div className="mk-ledger">
              {recent.length === 0 && (
                <div className="mk-ledger__row" style={{ gridTemplateColumns: "1fr" }}>
                  <span className="mk-ledger__id">Waiting for the first call…</span>
                </div>
              )}
              {recent.map((c) => {
                const r = statusOf(c.status);
                return (
                  <div className="mk-ledger__row" key={c.id}>
                    <span className="mk-ledger__id">{c.id.slice(0, 14)}… · p{c.providerId}</span>
                    <span className={`mk-status ${r.cls}`}><span className="mk-status__dot" />{r.label}</span>
                    <span className="mk-ledger__amt">{usdc(c.amount).toFixed(3)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── RIBBON ───────────────────────────────────── */}
      <div className="mk-ribbon" aria-hidden="true">
        <div className="mk-ribbon__track">
          {[...ribbon, ...ribbon].map((r, i) => (
            <span className="mk-ribbon__item" key={i}><span>{r.k}</span><b>{r.v}</b></span>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────── */}
      <section className="mk-section" id="how">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">One contract. Zero intermediaries.</h2>
            <p className="mk-lead">
              Every call is a small on-chain agreement. Funds are escrowed when the call starts and
              released the moment a signed receipt lands — or refunded and slashed if the deadline passes.
            </p>
          </div>

          <div className="mk-steps">
            <div className="mk-step mk-reveal">
              <div className="mk-step__title"><span className="mk-status mk-status--done"><span className="mk-status__dot" /></span> Honor path</div>
              <div className="mk-flow">
                <div className="mk-flow__item"><span className="mk-flow__n">1</span><span className="mk-flow__t">Caller escrows the fee<small>callService → USDC locked in the contract</small></span></div>
                <div className="mk-flow__item"><span className="mk-flow__n">2</span><span className="mk-flow__t">Provider does the work<small>off-chain, within the SLA window</small></span></div>
                <div className="mk-flow__item"><span className="mk-flow__n">3</span><span className="mk-flow__t">Provider signs a receipt<small>EIP-712 over the response hash + timestamp</small></span></div>
                <div className="mk-flow__item"><span className="mk-flow__n">4</span><span className="mk-flow__t">Escrow released, reputation +1<small>settled atomically in one transaction</small></span></div>
              </div>
              <div className="mk-code">
                <div><span className="dim">$</span> <span className="cmd">callguard call</span> --provider 1 --payload ping</div>
                <div><span className="ok">✓</span> escrow locked · sla 30s</div>
                <div><span className="ok">✓</span> receipt verified — escrow released</div>
              </div>
            </div>

            <div className="mk-step mk-reveal">
              <div className="mk-step__title"><span className="mk-status mk-status--slash"><span className="mk-status__dot" /></span> Slash path</div>
              <div className="mk-flow mk-flow--slash">
                <div className="mk-flow__item"><span className="mk-flow__n">1</span><span className="mk-flow__t">Deadline passes with no receipt<small>the SLA window closes</small></span></div>
                <div className="mk-flow__item"><span className="mk-flow__n">2</span><span className="mk-flow__t">Anyone triggers the timeout<small>claimTimeout(callId) — permissionless</small></span></div>
                <div className="mk-flow__item"><span className="mk-flow__n">3</span><span className="mk-flow__t">Caller refunded<small>the escrowed fee returns</small></span></div>
                <div className="mk-flow__item"><span className="mk-flow__n">4</span><span className="mk-flow__t">Stake slashed, reputation −1<small>the penalty is automatic and immediate</small></span></div>
              </div>
              <div className="mk-code">
                <div><span className="dim">$</span> <span className="cmd">callguard claim-timeout</span> 0x9f3c…</div>
                <div><span className="warn">✗</span> sla missed · stake slashed 20%</div>
                <div><span className="ok">✓</span> caller refunded 0.010 USDC</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MARKETS ──────────────────────────────────── */}
      <section className="mk-section mk-section--field">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">Reputation you can price.</h2>
            <p className="mk-lead">
              Providers are ranked by an on-chain honor rate — a Bayesian score that rewards completed
              calls and penalizes slashes. New providers start honest but unproven, never at a free 100.
            </p>
          </div>
          <div className="mk-tableWrap mk-reveal">
            <table className="mk-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Honor rate</th>
                  <th className="num">Price / call</th>
                  <th className="num">Stake</th>
                  <th className="num">Calls</th>
                </tr>
              </thead>
              <tbody>
                {top.length === 0 && (
                  <tr><td colSpan={5} style={{ color: "var(--text-faint)" }}>Loading live providers…</td></tr>
                )}
                {top.map((p) => {
                  const h = honorPct(p.c, p.s);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/providers`} style={{ fontWeight: 600 }}>Provider #{p.id}</Link>
                        {p.active ? <span className="mk-status mk-status--done" style={{ marginLeft: 10, fontSize: 11 }}><span className="mk-status__dot" />active</span> : <span className="mk-status" style={{ marginLeft: 10, fontSize: 11, color: "var(--text-faint)" }}>inactive</span>}
                      </td>
                      <td>
                        <span className="mk-honor">
                          <span className="mk-honor__bar"><span className="mk-honor__fill" style={{ width: `${h}%`, background: h >= 80 ? "var(--accent)" : h >= 50 ? "var(--warn)" : "var(--danger)" }} /></span>
                          <b style={{ fontVariantNumeric: "tabular-nums" }}>{h}</b>
                        </span>
                      </td>
                      <td className="num">{usdc(p.pricePerCall).toFixed(4)}</td>
                      <td className="num">{fmt(usdc(p.stake))}</td>
                      <td className="num">{p.c}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── STATS BAND ───────────────────────────────── */}
      <section className="mk-section mk-section--tight">
        <div className="mk-container">
          <div className="mk-band mk-reveal">
            <div className="mk-band__cell"><div className="mk-band__v"><Num value={stats.activeProviders} /></div><div className="mk-band__l">Active providers</div></div>
            <div className="mk-band__cell"><div className="mk-band__v"><Num value={stats.totalCalls} /></div><div className="mk-band__l">Calls settled on-chain</div></div>
            <div className="mk-band__cell"><div className="mk-band__v mk-band__v--guard">{stats.honor}%</div><div className="mk-band__l">Network honor rate</div></div>
            <div className="mk-band__cell"><div className="mk-band__v" style={{ color: "var(--danger)" }}>{stats.slashes}</div><div className="mk-band__l">Stake slashes</div></div>
          </div>
        </div>
      </section>

      {/* ── CAPABILITIES ─────────────────────────────── */}
      <section className="mk-section">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">Built for the machine economy.</h2>
            <p className="mk-lead">Beyond a single call: futures, credit, and settlement rails that let agents transact without a human in the loop.</p>
          </div>
          <div className="mk-bento mk-reveal">
            <div className="mk-cell mk-cell--half">
              <span className="mk-cell__k">/ receipt</span>
              <span className="mk-cell__t">Verifiable output</span>
              <span className="mk-cell__d">The response hash is committed on-chain and signed EIP-712, so a disputed result is provable — not a he-said-she-said.</span>
            </div>
            <div className="mk-cell mk-cell--half">
              <span className="mk-cell__k">/ nanopayments</span>
              <span className="mk-cell__t">Gateway & x402 rails</span>
              <span className="mk-cell__d">Dual settlement: per-call escrow, or batched Circle Gateway nanopayments with sub-500ms finality for high-frequency agents.</span>
            </div>
            <div className="mk-cell">
              <span className="mk-cell__k">/ futures</span>
              <span className="mk-cell__t">SLA futures</span>
              <span className="mk-cell__d">Providers pre-sell call capacity as ERC-1155 tokens; buyers lock in a price for guaranteed throughput.</span>
            </div>
            <div className="mk-cell">
              <span className="mk-cell__k">/ credit</span>
              <span className="mk-cell__t">RepFi lending</span>
              <span className="mk-cell__d">Proven providers borrow against their on-chain honor rate, unlocking working capital without collateral.</span>
            </div>
            <div className="mk-cell">
              <span className="mk-cell__k">/ agents</span>
              <span className="mk-cell__t">Agent wallet loop</span>
              <span className="mk-cell__d">A spend-limited agent wallet pays providers autonomously — daily caps and per-call limits enforced on-chain.</span>
            </div>
            <div className="mk-cell">
              <span className="mk-cell__k">/ bridge</span>
              <span className="mk-cell__t">Attestation bridge</span>
              <span className="mk-cell__d">SLA outcomes are attested cross-chain, so reputation earned here can be consumed anywhere.</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMPARE ──────────────────────────────────── */}
      <section className="mk-section mk-section--field">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">vs. the old way.</h2>
            <p className="mk-lead">A classic API gives you a promise. CallGuard gives you a contract.</p>
          </div>
          <div className="mk-compare mk-reveal">
            <table>
              <thead>
                <tr><th></th><th>Classic API</th><th>CallGuard</th></tr>
              </thead>
              <tbody>
                {[
                  ["Payment guarantee", "Invoiced after the fact", "USDC escrowed up front"],
                  ["SLA enforcement", "Vendor goodwill", "Automatic on-chain slash"],
                  ["Dispute resolution", "Support ticket", "Chain-arbitrated"],
                  ["Response proof", "Server logs", "Signed EIP-712 receipt"],
                  ["Reputation", "Trust me bro", "Portable on-chain score"],
                  ["Agent support", "Bolted on", "MCP · x402 · agent wallets"],
                ].map((r) => (
                  <tr key={r[0]}>
                    <td>{r[0]}</td>
                    <td className="no">{r[1]}</td>
                    <td className="yes">{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── CONTRACTS ────────────────────────────────── */}
      <section className="mk-section mk-section--tight">
        <div className="mk-container">
          <div className="mk-head mk-reveal">
            <h2 className="mk-h2">Deployed on Arc.</h2>
            <p className="mk-lead">Verified contracts on Arc Testnet — inspect them before you trust them.</p>
          </div>
          <div className="mk-reveal"><Contracts /></div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────── */}
      <section className="mk-cta">
        <div className="mk-container mk-reveal">
          <h2 className="mk-cta__title">Make reliability something you can buy.</h2>
          <p className="mk-cta__sub">Connect a wallet to call a service, or stake USDC and start earning per answered call.</p>
          <button className="ui-btn ui-btn--primary ui-btn--lg" onClick={launch}>Launch app</button>
        </div>
      </section>
    </>
  );
}

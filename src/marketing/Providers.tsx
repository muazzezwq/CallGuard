import { useOutletContext } from "react-router-dom";
import { useSubgraph } from "../hooks/useSubgraph";
import { useReveal } from "./useReveal";

type Prov = { id: string; pricePerCall: string; stake: string; active: boolean; completedCalls: string; slashedCalls: string; owner: string };
const usdc = (raw: string) => Number(raw) / 1e6;
const scorePct = (c: number, s: number) => (c + s > 0 ? Math.floor(((c + 2) / (c + s + 3)) * 100) : 66);

export default function Providers() {
  const { launch } = useOutletContext<{ launch: () => void }>();
  const { data } = useSubgraph<{ providers: Prov[] }>(
    `{ providers(first:100,orderBy:completedCalls,orderDirection:desc){id owner pricePerCall stake active completedCalls slashedCalls} }`
  );
  useReveal([data]);

  const provs = (data?.providers ?? []).map((p) => ({ ...p, c: Number(p.completedCalls || 0), s: Number(p.slashedCalls || 0) }));
  const active = provs.filter((p) => p.active).length;

  return (
    <div className="mk-container">
      <header className="mk-page-head">
        <h1 className="mk-page-title">Providers</h1>
        <p className="mk-page-sub">
          Every provider registered on Arc Testnet — active and inactive — ordered by completed
          calls. Stake USDC, set your price and SLA window, and get paid per call you answer in time.
        </p>
        <div className="mk-hero__meta" style={{ marginTop: 18 }}>
          <span className="mk-hero__metaItem"><b>{active}</b> active</span>
          <span className="mk-hero__metaItem"><b>{provs.length}</b> registered</span>
          <span className="mk-hero__metaItem"><button className="ui-btn ui-btn--primary ui-btn--sm" onClick={launch}>Become a provider</button></span>
        </div>
      </header>

      <div className="mk-tableWrap mk-reveal" style={{ marginTop: 26 }}>
        <table className="mk-table">
          <thead>
            <tr><th>Provider</th><th>Owner</th><th>Registry score</th><th className="num">Price / call</th><th className="num">Stake</th><th className="num">Calls</th></tr>
          </thead>
          <tbody>
            {provs.length === 0 && <tr><td colSpan={6} style={{ color: "var(--text-faint)" }}>Loading providers…</td></tr>}
            {provs.map((p) => {
              const h = scorePct(p.c, p.s);
              return (
                <tr key={p.id}>
                  <td>
                    <b>#{p.id}</b>
                    {p.active ? <span className="mk-status mk-status--done" style={{ marginLeft: 10, fontSize: 11 }}><span className="mk-status__dot" />active</span> : <span className="mk-status" style={{ marginLeft: 10, fontSize: 11, color: "var(--text-faint)" }}>inactive</span>}
                  </td>
                  <td><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-dim)" }}>{p.owner ? `${p.owner.slice(0, 6)}…${p.owner.slice(-4)}` : "—"}</span></td>
                  <td>
                    <span className="mk-honor">
                      <span className="mk-honor__bar"><span className="mk-honor__fill" style={{ width: `${h}%`, background: h >= 80 ? "var(--accent)" : h >= 50 ? "var(--warn)" : "var(--danger)" }} /></span>
                      <b style={{ fontVariantNumeric: "tabular-nums" }}>{h}</b>
                    </span>
                  </td>
                  <td className="num">{usdc(p.pricePerCall).toFixed(4)}</td>
                  <td className="num">{usdc(p.stake).toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                  <td className="num">{p.c}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

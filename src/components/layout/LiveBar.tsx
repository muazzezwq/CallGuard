import { useState, useEffect } from "react";
import { useSubgraph } from "../../hooks/useSubgraph";
import { CONFIG } from "../../lib/config";

const HONOR_QUERY = `{ calls(first:200,orderBy:createdAt,orderDirection:desc){status} }`;

export default function LiveBar() {
  const [time, setTime] = useState("");
  const [honorRate, setHonorRate] = useState<number | null>(null);
  const [gaugeOffset, setGaugeOffset] = useState(157); // 157 = 0%

  // live clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-GB", { hour12: false }));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // honor rate from subgraph
  const { data } = useSubgraph<{ calls: { status: string }[] }>(
    HONOR_QUERY,
    { pollInterval: 30000 },
  );

  useEffect(() => {
    if (!data?.calls?.length) return;
    const total = data.calls.length;
    const completed = data.calls.filter(c => c.status === "COMPLETED").length;
    const rate = Math.round((completed + 2) / (total + 3) * 100);
    setHonorRate(rate);
    // gauge: 157px arc = 100%; offset = 157 - (rate/100)*157
    setGaugeOffset(Math.round(157 - (rate / 100) * 157));
  }, [data]);

  return (
    <div style={{ maxWidth: "100%", padding: "12px 28px 0" }}>
      <div className="live-bar">
        <div className="live-bar-left">
          <span className="live-dot-pulse" />
          <span className="live-label">LIVE</span>
          <span className="live-clock mono" id="liveClock">{time || "--:--:--"}</span>
          <span className="live-sep" style={{ color: "var(--text-faint)", margin: "0 4px" }}>·</span>
          <span className="live-meta mono" style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "var(--font-mono)" }}>Arc Testnet</span>
        </div>
        <div className="live-bar-right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {honorRate !== null && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
              Honor <span style={{ color: "var(--accent)", fontWeight: 600 }}>{honorRate}%</span>
            </span>
          )}
          {/* SLA Gauge */}
          <div className="sla-gauge">
            <svg viewBox="0 0 120 70" className="gauge-svg" style={{ width: 80, height: 48 }}>
              <path d="M 10 60 A 50 50 0 0 1 110 60" stroke="var(--bg-3)" strokeWidth="8" fill="none" strokeLinecap="round" />
              <path
                d="M 10 60 A 50 50 0 0 1 110 60"
                stroke="url(#gaugeGrad)"
                strokeWidth="8"
                fill="none"
                strokeLinecap="round"
                strokeDasharray="157"
                strokeDashoffset={gaugeOffset}
                id="gaugeArc"
                style={{ transition: "stroke-dashoffset 1s ease" }}
              />
              <defs>
                <linearGradient id="gaugeGrad" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#dc2626" />
                  <stop offset="50%" stopColor="#d97706" />
                  <stop offset="100%" stopColor="#059669" />
                </linearGradient>
              </defs>
              <text x="60" y="66" textAnchor="middle" fontSize="10" fill="var(--text-dim)" fontFamily="var(--font-mono)">
                {honorRate !== null ? `${honorRate}%` : "--"}
              </text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

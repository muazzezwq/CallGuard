import { useState } from "react";
import { CONFIG } from "../../lib/config";

const ARCSCAN = "https://explorer.testnet.arc.io";

const LINK_GROUPS = [
  {
    title: "Arc & Circle",
    links: [
      { icon: "🌐", label: "Arc Network", href: "https://arc.io" },
      { icon: "📖", label: "Arc Documentation", href: "https://docs.arc.io" },
      { icon: "🔵", label: "Circle Developers", href: "https://developers.circle.com" },
      { icon: "🏦", label: "Circle Console", href: "https://console.circle.com" },
      { icon: "💰", label: "Get test USDC", href: "https://faucet.circle.com" },
    ],
  },
  {
    title: "Testnet Tools",
    links: [
      { icon: "🔍", label: "ArcScan Testnet", href: `${ARCSCAN}/address/${CONFIG.ppcAddress}` },
      { icon: "🪙", label: "Arc Testnet Faucet", href: "https://faucet.testnet.arc.io" },
      { icon: "🕸️", label: "Thirdweb Arc Testnet", href: "https://thirdweb.com/arc-testnet" },
      { icon: "📊", label: "Goldsky Subgraph", href: "https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/3.0.0/gn" },
    ],
  },
  {
    title: "Project",
    links: [
      { icon: "⚡", label: "GitHub repo", href: "https://github.com/muazzezwq/CallGuard" },
      { icon: "📋", label: "README", href: "https://github.com/muazzezwq/CallGuard#readme" },
      { icon: "🏗️", label: "Architecture", href: "https://github.com/muazzezwq/CallGuard/blob/main/ARCHITECTURE.md" },
      { icon: "🔒", label: "Security", href: "https://github.com/muazzezwq/CallGuard/blob/main/SECURITY.md" },
      { icon: "🚀", label: "Deploy guide", href: "https://github.com/muazzezwq/CallGuard/blob/main/DEPLOY.md" },
    ],
  },
];

const CONTRACTS: { name: string; addr: string }[] = [
  { name: "Registry",   addr: CONFIG.registryAddress },
  { name: "PayPerCall", addr: CONFIG.ppcAddress },
  { name: "USDC",       addr: CONFIG.usdcAddress },
];

export default function AppFooter() {
  const [copied, setCopied] = useState<string | null>(null);

  function copyAddr(addr: string) {
    navigator.clipboard.writeText(addr).then(() => {
      setCopied(addr);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        {LINK_GROUPS.map(g => (
          <div key={g.title}>
            <div className="app-footer-group-title">{g.title}</div>
            <div className="app-footer-links">
              {g.links.map(l => (
                <a
                  key={l.label}
                  className="app-footer-link"
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="app-footer-link-icon">{l.icon}</span>
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="app-footer-bottom">
        <span className="app-footer-copy">
          CallGuard · Built on Arc Testnet · Chain ID 5042002
        </span>
        <div className="app-footer-contracts">
          {CONTRACTS.map(c => (
            <button
              key={c.name}
              className="app-footer-contract"
              title={`Copy ${c.name} address`}
              onClick={() => copyAddr(c.addr)}
            >
              {copied === c.addr ? "✓ copied" : `${c.name}: ${short(c.addr)}`}
            </button>
          ))}
          <a
            className="app-footer-contract"
            href={`${ARCSCAN}/address/${CONFIG.ppcAddress}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            ArcScan ↗
          </a>
        </div>
      </div>
    </footer>
  );
}

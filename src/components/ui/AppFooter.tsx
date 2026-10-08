import { ExternalLink } from "lucide-react";
import { CONFIG } from "../../lib/config";
import { useAppStore, type PanelId } from "../../store/useAppStore";

const EXPLORER = "https://explorer.testnet.arc.io";

type LinkItem =
  | { label: string; href: string; external?: boolean }
  | { label: string; panel: PanelId }
  | { label: string; soon: true };

interface FooterSection {
  title: string;
  links: LinkItem[];
}

const SECTIONS: FooterSection[] = [
  {
    title: "Resources",
    links: [
      { label: "Docs",                href: "https://docs.arc.io",                external: true },
      { label: "API Documentation",   panel: "apidocs" },
      { label: "Developer Resources", href: "https://developers.circle.com",      external: true },
      { label: "Guides",              soon: true },
      { label: "FAQ",                 soon: true },
    ],
  },
  {
    title: "Product",
    links: [
      { label: "Providers",   panel: "providers"   },
      { label: "SLA",         panel: "attestation" },
      { label: "Marketplace", panel: "marketplace" },
      { label: "Reputation",  panel: "leaderboard" },
      { label: "Analytics",   panel: "analytics"   },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "GitHub",        href: "https://github.com/muazzezwq/CallGuard", external: true },
      { label: "Discord",       soon: true },
      { label: "X / Twitter",   soon: true },
      { label: "Arc Community", href: "https://arc.io",                          external: true },
      { label: "Arc House",     soon: true },
    ],
  },
  {
    title: "Information",
    links: [
      { label: "Terms",    panel: "privacy" },
      { label: "Privacy",  panel: "privacy" },
      { label: "Security", href: "https://github.com/muazzezwq/CallGuard/blob/main/SECURITY.md", external: true },
      { label: "Status",   soon: true },
      { label: "Contact",  soon: true },
    ],
  },
  {
    title: "Network",
    links: [
      { label: "Arc",                href: "https://arc.io",               external: true },
      { label: "Network Status",     href: `${EXPLORER}`,                  external: true },
      { label: "Chain Information",  href: "https://docs.arc.io",          external: true },
      { label: "ServiceRegistry v5", href: `${EXPLORER}/address/${CONFIG.registryAddress}`, external: true },
      { label: "PayPerCall v5",      href: `${EXPLORER}/address/${CONFIG.ppcAddress}`,      external: true },
    ],
  },
];

export default function AppFooter() {
  const { setPanel } = useAppStore();

  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        {/* Brand */}
        <div className="app-footer-brand">
          <div className="app-footer-logo">
            <span className="app-footer-logo-icon">⚡</span>
            <span className="app-footer-logo-name">CallGuard</span>
          </div>
          <p className="app-footer-tagline">
            On-chain SLA marketplace for machine-to-machine API calls on Arc Testnet.
          </p>
          <div className="app-footer-network">
            <span className="app-footer-net-dot" />
            <span>Arc Testnet · Chain 5042002</span>
          </div>
        </div>

        {/* Link columns */}
        <div className="app-footer-cols">
          {SECTIONS.map(sec => (
            <div key={sec.title} className="app-footer-col">
              <div className="app-footer-col-title">{sec.title}</div>
              <ul className="app-footer-links">
                {sec.links.map(link => {
                  if ("soon" in link) {
                    return (
                      <li key={link.label}>
                        <span className="app-footer-link app-footer-link--soon">
                          {link.label}
                          <span className="app-footer-soon-badge">Soon</span>
                        </span>
                      </li>
                    );
                  }
                  if ("panel" in link) {
                    return (
                      <li key={link.label}>
                        <button
                          className="app-footer-link app-footer-link--btn"
                          onClick={() => setPanel(link.panel)}
                        >
                          {link.label}
                        </button>
                      </li>
                    );
                  }
                  return (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noreferrer" : undefined}
                        className="app-footer-link"
                      >
                        {link.label}
                        {link.external && <ExternalLink size={10} className="app-footer-ext-icon" />}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="app-footer-bottom">
        <span>© 2026 CallGuard. Built on Arc Testnet with USDC.</span>
        <div className="app-footer-bottom-links">
          <a href="https://arc.io" target="_blank" rel="noreferrer" className="app-footer-link">Arc</a>
          <a href="https://circle.com" target="_blank" rel="noreferrer" className="app-footer-link">Circle</a>
          <a href="https://github.com/muazzezwq/CallGuard" target="_blank" rel="noreferrer" className="app-footer-link">GitHub</a>
        </div>
      </div>
    </footer>
  );
}

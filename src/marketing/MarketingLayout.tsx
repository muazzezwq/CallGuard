import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";
import { useModal } from "connectkit";
import { Mark } from "../ui";
import { useAppStore } from "../store/useAppStore";
import { CONFIG } from "../lib/config";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/how-it-works", label: "Product" },
  { to: "/docs#api", label: "Developers" },
  { to: "/providers", label: "Ecosystem" },
  { to: "/docs", label: "Docs", end: true },
];

function useLaunch() {
  const { isConnected } = useAccount();
  const { setOpen } = useModal();
  const nav = useNavigate();
  useEffect(() => {
    if (isConnected && sessionStorage.getItem("cg:launch")) {
      sessionStorage.removeItem("cg:launch");
      nav("/app");
    }
  }, [isConnected, nav]);
  return () => {
    if (isConnected) nav("/app");
    else {
      sessionStorage.setItem("cg:launch", "1");
      setOpen(true);
    }
  };
}

export default function MarketingLayout() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const [drawer, setDrawer] = useState(false);
  const launch = useLaunch();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <div className="mk">
      <header className="mk-nav">
        <div className="mk-container mk-nav__inner">
          <Link to="/" className="mk-nav__brand" onClick={() => setDrawer(false)}>
            <Mark size={26} />
            <b>CallGuard</b>
          </Link>
          <nav className="mk-nav__links">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `mk-nav__link${isActive ? " mk-nav__link--active" : ""}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <span className="mk-nav__spacer" />
          <div className="mk-nav__actions">
            <button className="mk-nav__link mk-nav__theme" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <a className="mk-nav__builton" href={CONFIG.explorerBase} target="_blank" rel="noreferrer">
              <span className="mk-nav__builton-dot" />
              Built on Arc
            </a>
            <button className="ui-btn ui-btn--primary ui-btn--md" onClick={launch}>Launch App</button>
            <button className="mk-nav__toggle ui-btn ui-btn--secondary ui-btn--sm" onClick={() => setDrawer((d) => !d)} aria-label="Menu">☰</button>
          </div>
        </div>
        {drawer && (
          <div className="mk-nav__drawer">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="mk-nav__link" onClick={() => setDrawer(false)}>{n.label}</NavLink>
            ))}
          </div>
        )}
      </header>

      <main style={{ flex: 1 }}>
        <Outlet context={{ launch }} />
      </main>

      <footer className="mk-footer">
        <div className="mk-container">
          <div className="mk-footer__grid">
            <div>
              <div className="mk-nav__brand"><Mark size={24} /><b>CallGuard</b></div>
              <p className="mk-footer__tag">Programmable service settlement for autonomous agents. Providers stake USDC and commit to a response-time SLA; missed deadlines are slashed on-chain.</p>
            </div>
            <div className="mk-footer__col">
              <h4>Protocol</h4>
              <Link to="/how-it-works">How it works</Link>
              <Link to="/docs">API docs</Link>
              <Link to="/security">Security</Link>
              <Link to="/providers">Providers</Link>
            </div>
            <div className="mk-footer__col">
              <h4>Network</h4>
              <a href={CONFIG.explorerBase} target="_blank" rel="noreferrer">ArcScan</a>
              <a href={CONFIG.subgraphUrl} target="_blank" rel="noreferrer">Subgraph</a>
              <a href="https://github.com/muazzezwq/CallGuard" target="_blank" rel="noreferrer">GitHub</a>
              <a href="/api-docs" onClick={(e) => { e.preventDefault(); launch(); }}>REST API</a>
            </div>
            <div className="mk-footer__col">
              <h4>Contracts</h4>
              <a href={CONFIG.explorerAddr(CONFIG.registry)} target="_blank" rel="noreferrer">ServiceRegistry</a>
              <a href={CONFIG.explorerAddr(CONFIG.payPerCall)} target="_blank" rel="noreferrer">PayPerCall</a>
              <a href={CONFIG.explorerAddr(CONFIG.usdc)} target="_blank" rel="noreferrer">USDC</a>
              <a href={CONFIG.explorerAddr(CONFIG.agentWallet)} target="_blank" rel="noreferrer">AgentWallet</a>
            </div>
          </div>
          <div className="mk-footer__bottom">
            <span>© {new Date().getFullYear()} CallGuard · MIT License</span>
            <span>Arc Testnet · chain 5042002 · USDC-native gas</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

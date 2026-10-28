import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";
import { useModal } from "connectkit";
import { Moon, Sun, Menu } from "lucide-react";
import { Mark } from "../ui";
import { useAppStore } from "../store/useAppStore";
import { ACTIVE_PPC_ADDRESS, ACTIVE_REGISTRY_ADDRESS, CONFIG } from "../lib/config";

const NAV: { href: string; label: string; anchor?: boolean }[] = [
  { href: "/", label: "Home" },
  { href: "/#product", label: "Product", anchor: true },
  { href: "/#developers", label: "Developers", anchor: true },
  { href: "/#ecosystem", label: "Ecosystem", anchor: true },
  { href: "/#faq", label: "FAQ", anchor: true },
  { href: "/docs", label: "Docs" },
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
  const { pathname } = useLocation();

  const linkCls = (href: string) =>
    `mk-nav__link${href === "/" && pathname === "/" ? " mk-nav__link--active" : ""}`;

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
            {NAV.map((n) =>
              n.href === "/docs" ? (
                <Link key={n.href} to={n.href} className={linkCls(n.href)}>{n.label}</Link>
              ) : (
                <a key={n.href} href={n.href} className={linkCls(n.href)}>{n.label}</a>
              ),
            )}
          </nav>
          <span className="mk-nav__spacer" />
          <div className="mk-nav__actions">
            <button className="mk-nav__link mk-nav__theme" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <a className="mk-nav__builton" href={CONFIG.explorerBase} target="_blank" rel="noreferrer">
              <span className="mk-nav__builton-dot" />
              Built on Arc
            </a>
            <button className="ui-btn ui-btn--primary ui-btn--md" onClick={launch}>Launch App</button>
            <button className="mk-nav__toggle ui-btn ui-btn--secondary ui-btn--sm" onClick={() => setDrawer((d) => !d)} aria-label="Menu"><Menu size={15} /></button>
          </div>
        </div>
        {drawer && (
          <div className="mk-nav__drawer">
            {NAV.map((n) =>
              n.href === "/docs" ? (
                <Link key={n.href} to={n.href} className={linkCls(n.href)} onClick={() => setDrawer(false)}>{n.label}</Link>
              ) : (
                <a key={n.href} href={n.href} className={linkCls(n.href)} onClick={() => setDrawer(false)}>{n.label}</a>
              ),
            )}
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
              <a href={CONFIG.explorerAddr(ACTIVE_REGISTRY_ADDRESS)} target="_blank" rel="noreferrer">ServiceRegistry</a>
              <a href={CONFIG.explorerAddr(ACTIVE_PPC_ADDRESS)} target="_blank" rel="noreferrer">PayPerCall</a>
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

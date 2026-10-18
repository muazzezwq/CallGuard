import { useAccount } from "wagmi";
import { useAppStore, PanelId } from "../../store/useAppStore";
import { Mark } from "../../ui";
import { HOME_NAV, NAV_GROUPS, type NavItem } from "./navConfig";
import ProgressTracker from "./ProgressTracker";

export function SidebarBrand() {
  return (
    <div className="sb-logo">
      <div className="sb-dot"><Mark size={24} /></div>
      <div className="sb-brand-text">
        <div className="sb-name">CallGuard</div>
        <div className="sb-net">Arc Testnet</div>
      </div>
    </div>
  );
}

function NavButton({ item, active, label, onClick, collapsed }: {
  item: NavItem; active: boolean; label: string; onClick: () => void; collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={`sb-item${active ? " on" : ""}`}
      data-nav={item.id}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      onClick={onClick}
    >
      <span className="sb-icon"><Icon size={16} strokeWidth={1.8} /></span>
      <span className="sb-label">{label}</span>
    </button>
  );
}

export default function Sidebar({ onNav, collapsed = false }: { onNav?: () => void; collapsed?: boolean }) {
  const { activePanel, setPanel, mode } = useAppStore();
  const { address, isConnected } = useAccount();

  const label = (i: NavItem) => (mode === "simple" ? i.simple : i.pro);
  const go = (id: PanelId) => { setPanel(id); onNav?.(); };
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  return (
    <nav className="app-sidebar" aria-label="Main navigation" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <SidebarBrand />

      <div className="sb-scroll">
        <NavButton item={HOME_NAV} active={activePanel === HOME_NAV.id} label={label(HOME_NAV)} collapsed={collapsed} onClick={() => go(HOME_NAV.id)} />

        {NAV_GROUPS.map((group, gi) => (
          <div className="sb-group-block" key={group.key}>
            {gi > 0 && <div className="sb-divider" aria-hidden="true" />}
            <div className="sb-section sb-section-label">{group.label}</div>
            {group.items.map((i) => (
              <NavButton key={i.id} item={i} active={activePanel === i.id} label={label(i)} collapsed={collapsed} onClick={() => go(i.id)} />
            ))}
          </div>
        ))}

        <div className="sb-progress"><ProgressTracker /></div>
      </div>

      {/* Wallet chip — reference footer */}
      <div className="sb-foot">
        <span className={`sb-foot-dot${isConnected ? " ok" : ""}`} />
        <div className="sb-foot-text">
          <span className="sb-foot-addr">{isConnected ? short : "Not connected"}</span>
          <span className="sb-foot-state">{isConnected ? "Connected • Arc Testnet" : "Connect a wallet"}</span>
        </div>
      </div>
    </nav>
  );
}

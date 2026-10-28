import {
  LayoutDashboard, Store, Server, Star, BadgeCheck,
  SquareTerminal, Layers, ListChecks, ArrowLeftRight, ReceiptText,
  Gauge, Repeat, Landmark, TrendingUp, Coins, Link2, Wallet,
  Scale, ShieldAlert, ShieldCheck, Send, BarChart3, Briefcase,
  Boxes, FileText, Webhook, Bot, KeyRound,
  ScrollText, Settings, UserPlus, EyeOff, SlidersHorizontal, Activity,
  House, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PanelId } from "../../store/useAppStore";

export type NavItem = {
  id: PanelId;
  simple: string;
  pro: string;
  icon: LucideIcon;
};

export type NavGroup = {
  key: string;
  label: string;
  items: NavItem[];
};

/* ── Sidebar hierarchy ────────────────────────────────────────
   Every panel in the registry stays reachable: 34 ids, grouped by
   what the operator is actually doing. `overview` is the home item
   and renders above the groups.                                    */

export const HOME_NAV: NavItem = {
  id: "overview", simple: "Overview", pro: "Overview", icon: LayoutDashboard,
};

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "discover",
    label: "Discover",
    items: [
      { id: "marketplace", simple: "Marketplace", pro: "Marketplace", icon: Store },
      { id: "providers",   simple: "Providers",   pro: "Providers",   icon: Server },
      { id: "leaderboard", simple: "Rankings",    pro: "Rankings",    icon: Star },
      { id: "provprofile", simple: "Provider details", pro: "Provider details", icon: BadgeCheck },
    ],
  },
  {
    key: "operate",
    label: "Operate",
    items: [
      { id: "calls",     simple: "Call Builder", pro: "Call Builder", icon: SquareTerminal },
      { id: "bulkcall",  simple: "Bulk Call",    pro: "Bulk Call",    icon: Layers },
      { id: "requests",  simple: "My Requests",  pro: "My Requests",  icon: ListChecks },
      { id: "history",   simple: "Transactions", pro: "Transactions", icon: ArrowLeftRight },
      { id: "receipts",  simple: "Receipts",     pro: "Receipts",     icon: ReceiptText },
    ],
  },
  {
    key: "finance",
    label: "Financials",
    items: [
      { id: "balance",       simple: "Unified Balance", pro: "Unified Balance", icon: Wallet },
      { id: "payments",      simple: "Payments",        pro: "Payments",        icon: Gauge },
      { id: "subscriptions", simple: "Subscriptions",   pro: "Subscriptions",   icon: Repeat },
      { id: "lending",       simple: "RepFi Lending",   pro: "RepFi Lending",   icon: Landmark },
      { id: "futures",       simple: "SLA Futures",     pro: "SLA Futures",     icon: TrendingUp },
      { id: "nano",          simple: "Nanopayments",    pro: "Nanopayments",    icon: Coins },
      { id: "bridge",        simple: "Bridge",          pro: "Bridge",          icon: Link2 },
    ],
  },
  {
    key: "trust",
    label: "Trust & Quality",
    items: [
      { id: "disputes",    simple: "Disputes",        pro: "Disputes",        icon: Scale },
      { id: "uptime",      simple: "Availability",    pro: "SLA Availability", icon: Activity },
      { id: "quality",     simple: "Quality",         pro: "Quality Disputes", icon: ShieldAlert },
      { id: "attestation", simple: "SLA Bridge",      pro: "SLA Bridge",      icon: Send },
      { id: "verify",      simple: "Verify Receipt",  pro: "Verify Receipt",  icon: ShieldCheck },
    ],
  },
  {
    key: "intel",
    label: "Intelligence",
    items: [
      { id: "analytics", simple: "Analytics", pro: "Analytics", icon: BarChart3 },
      { id: "jobs",      simple: "Jobs",      pro: "Jobs",      icon: Briefcase },
    ],
  },
  {
    key: "build",
    label: "Build & Integrate",
    items: [
      { id: "mcp",          simple: "API / MCP",     pro: "API / MCP",     icon: Boxes },
      { id: "apidocs",      simple: "API Docs",      pro: "API Docs",      icon: FileText },
      { id: "webhooks",     simple: "Webhooks",      pro: "Webhooks",      icon: Webhook },
    ],
  },
  {
    key: "wallets",
    label: "Wallets & Agents",
    items: [
      { id: "agent",   simple: "Agent Wallet",   pro: "Agent Wallet",   icon: Bot },
      { id: "passkey", simple: "Passkey Wallet", pro: "Passkey Wallet", icon: KeyRound },
    ],
  },
  {
    key: "system",
    label: "System",
    items: [
      { id: "notifications", simple: "Logs",      pro: "Logs",     icon: ScrollText },
      { id: "settings",      simple: "Settings",  pro: "Settings", icon: Settings },
      { id: "register",      simple: "Become a Provider", pro: "Register", icon: UserPlus },
      { id: "admin",         simple: "Admin",     pro: "Admin Panel", icon: SlidersHorizontal },
      { id: "privacy",       simple: "Privacy",   pro: "Privacy",  icon: EyeOff },
    ],
  },
];

/* Flat lookup built once — used by the breadcrumb and the collapsed rail. */
const ITEM_BY_ID = new Map<PanelId, NavItem>(
  [HOME_NAV, ...NAV_GROUPS.flatMap((g) => g.items)].map((i) => [i.id, i]),
);

export function navItem(id: PanelId): NavItem | undefined {
  return ITEM_BY_ID.get(id);
}

/** Group that owns the active panel, or null for the home item. */
export function groupOfPanel(id: PanelId): NavGroup | null {
  return NAV_GROUPS.find((g) => g.items.some((i) => i.id === id)) ?? null;
}

/* Panel titles for the topbar breadcrumb (kept in sync with the registry). */
export const PANEL_LABELS: Record<string, string> = Object.fromEntries(
  [HOME_NAV, ...NAV_GROUPS.flatMap((g) => g.items)].map((i) => [i.id, i.pro]),
);

/* Primary destinations for the mobile navigation / thumb bar. */
export const MOBILE_NAV: { Icon: LucideIcon; label: string; id: PanelId }[] = [
  { Icon: House,  label: "Home",   id: "overview"    },
  { Icon: Store,  label: "Market", id: "marketplace" },
  { Icon: Zap,    label: "Calls",  id: "calls"       },
  { Icon: Wallet, label: "Wallet", id: "balance"     },
];

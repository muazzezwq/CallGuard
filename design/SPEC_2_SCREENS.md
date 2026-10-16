# PART 2 OF 5

Save this text as `design/SPEC_2_SCREENS.md`. Do NOT start any work. Parts 1-5 are one task.

## REFERENCE SCREENS (UI text in English, verbatim; apply to the existing components/panels, keep their data and behavior)

### APP SHELL (desktop)

- Sidebar (Sidebar.tsx): logo (green hexagon with "C" + "CallGuard"); keep the repo's existing groups and items, restyle only: item = icon + label, active item has green translucent fill (#014237) with accent text; group headings small and muted; at the bottom a wallet card "0x3f...a2c1 / Connected • Arc Testnet" (use the real connected address and network).
- Topbar: page title + subtitle on the left; right: "Arc Testnet" pill (green dot) and wallet pill (avatar + shortened address + chevron).

### OVERVIEW

- Title "Overview", subtitle "Live network, real data, on-chain trust."
- 4 stat cards with sparkline, label top-left, large value, green delta chip top-right: Total Calls 1,248 (+12%) | Active Providers 36 (+5%) | Escrowed USDC 24,830.50 (+8%) | SLA Success Rate 98.3% (+0.7%). Values must come from real data; these numbers only show the format.
- Row 2: "Live Network" card (green "Live" badge top-right, existing NetworkGraph, legend: Call Flow, Provider, Caller, SLA Risk) + "Recent Activity" card ("View all" link; rows = round icon, title, subtitle, "x min ago", status chip). Example rows: SLA call completed / OpenAI Provider / Success; Receipt verified / 0x7a...3f9e / Success; SLA timeout / DataAgent Provider / Slashed (red); Payment received / 0x9c...1a2b / Success; New provider registered / Agent-3 / Success.
- Row 3: "Transaction Flow" 4-step stepper with green check circles: Payment (USDC) -> SLA (Set by provider) -> Receipt (EIP-712 verified) -> Settlement (On-chain); next to it a "Service Health" card: rows "PayPerCall" Healthy, "DisputeQuality" Healthy (green chips).

### MOBILE (<768px)

- Topbar: logo + hamburger (opens the sidebar as a drawer). Stat cards in a 2x2 grid, mini network visual, Recent Activity list. Bottom tab bar (MobileNav): reference shows Home (active, green), Market, Calls, Wallet. Keep the repo's existing tab items and behavior; use these labels/icons only where they map 1:1.

### MARKETPLACE

- Title "Marketplace", subtitle "Find and connect with the best providers.", search input "Search providers…", filter chips: All (active, green), Verified, High Reputation, Low Latency.
- Provider card: round icon, name, ★ reputation %, price "0.50 USDC", latency "< 2s", green "Connect" button on the right. Example: OpenAI Provider ★98.8% 0.50 USDC <2s | DataAgent ★99.2% 0.35 USDC <3s | Web3 Tools ★98.7% 0.25 USDC <5s | AI Research ★98.9% 0.40 USDC <4s. Real data from the existing hooks.

### CALL BUILDER

- Title "Call Builder", subtitle "Create your custom SLA call." Tabs: Basic (active, green) / Advanced / Templates. Labeled fields in dark inputs with 1px border: Provider (select, "Select a provider"), Endpoint URL (placeholder https://api.example.com), Price (USDC) 0.50, Max Response Time (30 seconds), Slash Percentage (20%). Full-width green "Create Call" button. Keep the repo's real fields; use this look.

### TRANSACTION DETAIL

- Back arrow + "Transaction Details"; green "Success" chip; "Call #0x7a3f...9e2b" (mono); date "Oct 15, 2026 · 14:32"; 4-step stepper (Payment, SLA, Receipt, Settlement) with green checks; key-value card: Provider (name + address), Caller, Amount "0.50 USDC", Response Time "1.8s", Receipt "Verified (EIP-712)", Transaction Hash (mono + copy icon); full-width outline button "View on Explorer".

### SLA CANVAS

- Back arrow + "SLA Canvas". Existing SLACanvas component: Payment (USDC) node on top, SLA (Waiting) in the center with the C logo, Receipt (Verifying) bottom-left, Settlement (Pending) bottom-right; glowing hex nodes, animated connections. Legend: Success green, Pending blue, Failed red.

END OF PART 2.

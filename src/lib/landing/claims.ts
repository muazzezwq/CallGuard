/**
 * What each integration actually does in this deployment, stated once.
 *
 * The landing page used to keep its own list with hand-typed statuses, which is how
 * a deployed-MCP-server claim survived long after the endpoint stopped existing. The
 * rule these entries encode: the green "working today" tone belongs to `live` alone.
 * Everything else says what it is — self-hosted, outside the SLA, not wired, or a
 * testnet script — and the badge cannot claim otherwise.
 */

export type IntegrationState =
  /** Working in this deployment, on the live v8 path. */
  | "live"
  /** The code exists here, but you run it yourself or it settles outside the SLA. */
  | "partial"
  /** The contracts do not call it at all. */
  | "not-live"
  /** Testnet-only tooling. */
  | "testnet";

export type Integration = {
  name: string;
  state: IntegrationState;
  /** Short status next to the name. */
  status: string;
  /** One line on what the piece does here. */
  detail: string;
};

export type BadgeTone = "impl" | "opt" | "test";

export function badgeTone(state: IntegrationState): BadgeTone {
  switch (state) {
    case "live":
      return "impl";
    case "partial":
      return "opt";
    case "not-live":
      return "opt";
    case "testnet":
      return "test";
  }
}

export const INTEGRATIONS: Integration[] = [
  {
    name: "x402 / X402Middleware",
    state: "live",
    status: "Live",
    detail:
      "POST /callService answers 402 with terms, then executes callServiceWithAuthorization with the signed EIP-3009 authorization.",
  },
  {
    name: "REST + auto-receipt",
    state: "live",
    status: "Live",
    detail:
      "POST /api/auto-receipt signs the EIP-712 receipt with domain ArcSLA/2 and submits it before the deadline.",
  },
  {
    name: "MCP server",
    state: "partial",
    status: "Self-hosted only",
    detail:
      "Two MCP servers live in x402-facilitator/ (plus an importable factory). Only mcp-server.js reads SUBGRAPH_URL; mcp-server-remote.js hardcodes the retired v7 Goldsky endpoint. Neither is deployed on arcsla.vercel.app, so you run one yourself against the subgraph.",
  },
  {
    name: "ERC-8004 reputation",
    state: "not-live",
    status: "Not wired",
    detail:
      "The v7 PayPerCall had a best-effort writer and its registry address is zero; PayPerCallV8 has no setter, so no reputation is ever written.",
  },
  {
    name: "ERC-8183 hook",
    state: "not-live",
    status: "Not wired",
    detail:
      "No before/after hook exists in PayPerCallV8. The ERC-8183 reference contract is reachable as a separate, standalone job flow.",
  },
  {
    name: "Circle Gateway",
    state: "partial",
    status: "Outside the SLA",
    detail:
      "api/nano-call.js moves a fixed 0.001 USDC to SELLER_ADDRESS through Gateway or a plain transfer. It does not open a call, so no SLA covers it.",
  },
  {
    name: "CCTP bridging",
    state: "testnet",
    status: "Testnet script",
    detail:
      "scripts/bridge-and-call.ts burns USDC on Sepolia, Base Sepolia or Polygon Amoy and mints it on Arc before calling. It is tooling, not a deployed product surface.",
  },
];

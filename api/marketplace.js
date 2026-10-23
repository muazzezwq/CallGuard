/**
 * GET  /api/marketplace        — x402 discovery schema with dynamic provider pricing
 * GET  /api/marketplace/health — live provider endpoint health check
 *
 * This is a CallGuard discovery document. The payment amount is dynamic, so
 * `pricing.amountSource` points at the endpoint's 402 challenge rather than a
 * fixed `accepts` amount; the legacy JSON request shape is documented there.
 *
 * References:
 *   https://developers.circle.com/agent-stack/agent-marketplace
 *   https://developers.circle.com/agent-stack/agent-marketplace/discovery-api
 */

import { ACTIVE } from "./_contracts.js";

const {
  PAY_PER_CALL,
  SERVICE_REGISTRY: SERVICE_REG,
  USDC: USDC_ARC,
  NETWORK: ARC_TESTNET_CHAIN_ID,
} = ACTIVE;

// Resolve the public base URL for this deployment.
function baseUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

// Input JSON Schema for callService requests.
const INPUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["providerId", "requestHash", "authorization", "signature"],
  properties: {
    providerId: {
      type: "integer",
      description: "Numeric provider ID from ServiceRegistry",
    },
    requestHash: {
      type: "string",
      pattern: "^0x[0-9a-fA-F]{64}$",
      description: "keccak256 hash of the request payload",
    },
    authorization: {
      type: "object",
      description: "EIP-3009 TransferWithAuthorization parameters",
      required: ["from", "to", "value", "validAfter", "validBefore", "nonce"],
      properties: {
        from:        { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
        to:          { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
        value:       { type: "string", description: "USDC amount in 6-decimal units" },
        validAfter:  { type: "string" },
        validBefore: { type: "string" },
        nonce:       { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" },
      },
    },
    signature: {
      type: "string",
      pattern: "^0x[0-9a-fA-F]{130}$",
      description: "EIP-712 signature (65 bytes, compact hex)",
    },
  },
};

// Output JSON Schema for a successful callService response.
const OUTPUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["success", "callId"],
  properties: {
    success:     { type: "boolean" },
    callId:      { type: "string", pattern: "^0x[0-9a-fA-F]{64}$", description: "On-chain call identifier" },
    txHash:      { type: ["string", "null"] },
    blockNumber: { type: ["integer", "null"] },
    demo:        { type: "boolean" },
  },
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET")     return res.status(405).json({ error: "GET only" });

  const path = req.url?.split("?")[0];
  const base = baseUrl(req);

  // ── /api/marketplace/health ──────────────────────────────────────────────
  if (path === "/api/marketplace/health" || path?.endsWith("/health") || req.query?.health === "1") {
    return handleHealth(req, res);
  }

  // ── /api/marketplace ─────────────────────────────────────────────────────

  // PayPerCall pulls the caller's USDC into escrow. It is the only address a
  // call-service authorization can target, so it is also the discovery payTo.
  const amountSource = `${base}/api/call-service`;
  const paymentRequirement = {
    scheme: "exact",
    network: ARC_TESTNET_CHAIN_ID,
    asset: USDC_ARC,
    description: "USDC on Arc Testnet (native gas asset)",
    pricing: "provider-specific",
    amountSource,
    // Verified against @x402/evm 2.14.0: the exact scheme reads the USDC
    // EIP-712 domain from these fields before asking the client to sign.
    extra: { name: "USDC", version: "2" },
    ...(PAY_PER_CALL ? { payTo: PAY_PER_CALL } : {}),
  };

  const listing = {
    x402Version: 1,
    updatedAt: new Date().toISOString(),
    services: [
      {
        // Unique identifier for this service listing.
        id: "callguard-arc-testnet-v4",

        // Human-readable metadata.
        name: "CallGuard SLA Marketplace",
        description:
          "Stake-backed onchain SLA enforcement on Arc Testnet. " +
          "Providers stake USDC as a performance bond. " +
          "Callers pay per request; escrow is auto-slashed if the provider misses the deadline. " +
          "No arbiter, no governance — fully automated by EIP-712 receipt verification.",

        // Canonical endpoint agents call to open a service call.
        url: `${base}/api/call-service`,

        // Circle Agent Marketplace category.
        category: "INFRASTRUCTURE",

        // Protocol metadata.
        protocol: "x402",
        version: "1.0.0",

        // Payment rails this listing supports. call-service settles with
        // PayPerCall's EIP-3009 entry point, not Circle Gateway batching.
        supportsVanillax402: true,
        supportsCircleGateway: false,

        // Payment target is stable; the amount is not. Each provider sets its
        // own on-chain pricePerCall, so a fixed amount here would be false.
        // A buyer must request the endpoint's 402 challenge for its providerId.
        pricing: {
          model: "provider-price",
          amountSource,
          note: "POST providerId to amountSource; its 402 terms contain the selected provider's exact pricePerCall.",
        },
        accepts: [paymentRequirement],

        // Machine-readable schemas for agent auto-integration.
        inputSchema: INPUT_SCHEMA,
        outputSchema: OUTPUT_SCHEMA,

        // On-chain contract references for verification.
        contracts: {
          payPerCall:      PAY_PER_CALL  || null,
          serviceRegistry: SERVICE_REG  || null,
          chain: ARC_TESTNET_CHAIN_ID,
        },

        // SLA characteristics.
        sla: {
          model: "per-call-escrow",
          slashOnTimeout: true,
          receiptType: "EIP-712",
          identityStandard: "ERC-8004",
        },

        // Discovery endpoints.
        links: {
          health:    `${base}/api/marketplace/health`,
          providers: `${base}/api/marketplace`,
          ping:      `${base}/api/ping-provider`,
          docs:      "https://github.com/muazzezwq/CallGuard#readme",
        },
      },
    ],
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=60");
  return res.status(200).json(listing);
}

// ── Health check ──────────────────────────────────────────────────────────────

async function handleHealth(req, res) {
  const PING_TIMEOUT_MS = 4000;

  // Fetch provider list from /api/energy-data (which lists active providers)
  // and ping each endpoint. We do this best-effort — a ping failure does not
  // mean the SLA contract is down.
  const results = {
    status: "ok",
    timestamp: new Date().toISOString(),
    contracts: {
      payPerCall:      PAY_PER_CALL      ? "configured" : "missing",
      serviceRegistry: SERVICE_REG       ? "configured" : "missing",
    },
    providers: [],
  };

  // Try to load provider data from the sibling API via same-origin URL.
  // (Never localhost — that fails on Vercel serverless where each function
  // is isolated. baseUrl() resolves the public deployment host instead.)
  try {
    const energyRes = await Promise.race([
      fetch(`${baseUrl(req)}/api/energy-data`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), PING_TIMEOUT_MS)
      ),
    ]);
    if (energyRes.ok) {
      const data = await energyRes.json();
      const providers = data?.providers || [];

      // Ping each provider endpoint in parallel.
      const pings = providers.slice(0, 5).map(async (p) => {
        if (!p.endpoint) return { id: p.id, status: "no-endpoint" };
        try {
          const start = Date.now();
          const r = await Promise.race([
            fetch(`${p.endpoint}/health`),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("timeout")), PING_TIMEOUT_MS)
            ),
          ]);
          return { id: p.id, endpoint: p.endpoint, status: r.ok ? "ok" : "degraded", latencyMs: Date.now() - start };
        } catch {
          return { id: p.id, endpoint: p.endpoint, status: "unreachable" };
        }
      });

      results.providers = await Promise.all(pings);
    }
  } catch {
    // Provider ping is best-effort.
  }

  const allOk = results.providers.every((p) => p.status === "ok" || p.status === "no-endpoint");
  results.status = allOk ? "ok" : "degraded";

  res.setHeader("Content-Type", "application/json");
  return res.status(200).json(results);
}

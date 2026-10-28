import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { INTEGRATIONS, badgeTone } from "../../src/lib/landing/claims";

// The marketing site is the only place this repository makes claims to strangers.
// Four of them were false at once: a deployed MCP server that is not deployed, an
// ERC-8183 hook and an ERC-8004 registry write that the v8 contracts never make, an
// ERC-8183 reader calling a function the contract does not have, and a success rate
// that is a Bayesian score. These assertions are the regression guard: the exact
// sentences that were wrong must not come back, and the status labels must come from
// one list that cannot label a non-live thing "Implemented".

/**
 * Comments explain why a claim was removed, so they are allowed to name it. The
 * guard is about what ships, so every scan runs on the code with comments removed:
 * full-line `//` comments and block comments.
 */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Failure prints the needle, not the whole file. */
const has = (source: string, needle: string) => expect(source.includes(needle), `missing: ${needle}`).toBe(true);
const misses = (source: string, needle: string) => expect(source.includes(needle), `should be gone: ${needle}`).toBe(false);

const LANDING = "src/marketing/Landing.tsx";
const SECURITY = "src/marketing/Security.tsx";
const HOW_IT_WORKS = "src/marketing/HowItWorks.tsx";
const MCP = "src/components/panels/Mcp.tsx";
const JOBS = "src/components/panels/Jobs.tsx";

describe("integration badges", () => {
  test("only a live integration wears the working-today tone", () => {
    for (const item of INTEGRATIONS) {
      if (item.state === "live") continue;
      expect(badgeTone(item.state), `${item.name} is ${item.state}`).not.toBe("impl");
    }
  });

  test("a non-live integration never reads as Implemented", () => {
    for (const item of INTEGRATIONS) {
      if (item.state === "live") continue;
      expect(item.status, `${item.name} is ${item.state}`).not.toBe("Implemented");
    }
  });

  test("every integration states what it does in this deployment", () => {
    for (const item of INTEGRATIONS) {
      expect(item.detail.length, `${item.name} has no detail`).toBeGreaterThan(20);
    }
  });
});

describe("landing copy", () => {
  const landing = code(LANDING);

  test("does not advertise a deployed MCP endpoint", () => {
    misses(landing, "/api/mcp-server");
    has(landing, "self-hosted");
  });

  test("does not claim an ERC-8183 hook runs around every call", () => {
    misses(landing, "fires before and after each call");
    has(landing, "not wired");
  });

  test("does not claim a reputation event is written on settlement", () => {
    misses(landing, "A reputation event is written, best-effort");
  });

  test("does not call the Bayesian score a success rate", () => {
    misses(landing, "SLA success rate");
    has(landing, "Bayesian");
  });

  test("does not promise unrounded numbers", () => {
    misses(landing, "no rounding");
  });

  test("names the function the REST path actually calls", () => {
    has(landing, "callServiceWithAuthorization");
  });

  test("keeps the escrow list to contracts in the live v8 flow", () => {
    misses(landing, "CONFIG.agentWallet");
    misses(landing, "CONFIG.subscriptionAddress");
  });

  test("describes the dispute and evidence layer", () => {
    has(landing, "DisputeV4");
    has(landing, "0x64872c29A19dF8E471103d0708397BAb96A311FC");
  });

  test("the request sample uses the real price of the live provider", () => {
    // Provider 1 charges 1 USDC = 1000000 in 6-decimal units. "1000" is 0.001.
    has(landing, '"value": "1000000"');
    misses(landing, '"value": "1000"');
  });
});

describe("security page", () => {
  const security = code(SECURITY);

  test("does not describe ERC-8004 and ERC-8183 writes that never happen", () => {
    misses(security, "a revert there does not fail a");
    has(security, "is ever written");
  });

  test("names the explorer the links actually use", () => {
    misses(security, "links to ArcScan");
  });
});

describe("how it works", () => {
  const how = code(HOW_IT_WORKS);

  test("documents the real callService signature", () => {
    has(how, "callService(uint256 providerId, bytes32 requestHash)");
    misses(how, "callService(providerId, amount, requestHash, deadline)");
  });

  test("does not claim settlement increments a reputation registry", () => {
    misses(how, "increments their reputation");
  });
});

describe("mcp panel", () => {
  const mcp = code(MCP);

  test("points at the server that exists in this repository", () => {
    has(mcp, "x402-facilitator/mcp-server.js");
    misses(mcp, "@callguard/mcp-server");
  });

  test("does not advertise an unserved endpoint", () => {
    misses(mcp, "/api/mcp-server");
  });

  test("does not claim the providers come from Goldsky", () => {
    misses(mcp, "Goldsky");
  });
});

describe("jobs panel", () => {
  const jobs = code(JOBS);

  test("reads the job with a function the contract actually has", () => {
    // `cast call <AgenticCommerce> "doCheckJob(uint256)" 0` reverts on Arc Testnet;
    // `getJob(uint256)` answers. The panel was calling the first one.
    has(jobs, 'functionName: "getJob"');
    misses(jobs, "doCheckJob");
  });
});

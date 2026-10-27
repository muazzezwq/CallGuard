import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { keccak256, toBytes } from "viem";

import { assumptionHash, statementHash } from "../src/lib/verification/claimHashes";
import { envelopeDigest, type EvidenceEnvelope } from "../src/lib/verification/schema";

// The committed zk-execution fixture is the only bundled envelope.
const fixture = JSON.parse(
  readFileSync("src/lib/verification/fixtures/zk-execution.json", "utf8"),
) as {
  callId: `0x${string}`;
  providerId: number;
  termsHash: `0x${string}`;
  responseHash: `0x${string}`;
  claimHash: `0x${string}`;
  statement: string;
  assumptions: string[];
  issuedAt: number;
};

const LIVE_CALL = fixture.callId;
const LIVE_CLAIM_HASH = fixture.claimHash;
const KIND32 = keccak256(toBytes("zk-execution"));

/**
 * A `getEvidence` row the way the V2 registry stores it. The statement/assumption
 * hashes are the ones `claimHashes.ts` computes for the fixture's own words, which
 * is exactly what an attestor that verified this fixture would have stored.
 */
function anchoredRow(overrides: Record<string, string> = {}) {
  return {
    kind: KIND32,
    claimHash: LIVE_CLAIM_HASH,
    responseHash: fixture.responseHash,
    statementHash: statementHash(fixture.statement),
    assumptionHash: assumptionHash(fixture.assumptions),
    verifier: "0xC64341aBd4dfC62aCd11E35245D06FCF2B094846",
    anchoredAt: fixture.issuedAt,
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.SLA_EVIDENCE_V2;
  delete process.env.VITE_SLA_EVIDENCE_V2;
});

describe("GET /api/evidence (handle)", () => {
  test("returns the fixture envelope and says the hash matches", async () => {
    const { handle } = await import("../api/evidence.js");
    const res = await handle(
      { callId: LIVE_CALL, kind: "zk-execution" },
      { readAnchored: async () => anchoredRow() },
    );
    expect(res.match).toBe(true);
    expect(res.digest).toBe(LIVE_CLAIM_HASH);
    expect(res.anchored).toBe(true);
    expect(res.claimHash).toBe(LIVE_CLAIM_HASH);
    expect(res.anchoredStatementHash).toBe(statementHash(fixture.statement));
    expect(res.anchoredAssumptionHash).toBe(assumptionHash(fixture.assumptions));
    expect(res.source).toBe("fixture");
    expect(res.note).toBeNull();
    const envelope = res.envelope as EvidenceEnvelope;
    expect(envelope.subject.callId).toBe(LIVE_CALL);
    expect(envelope.claim.statement).toBe(fixture.statement);
    expect(res.statementHash).toBe(statementHash(fixture.statement));
    expect(res.assumptionHash).toBe(assumptionHash(fixture.assumptions));
  });

  test("unknown call is a 404-shaped answer, not an empty 200", async () => {
    const { handle } = await import("../api/evidence.js");
    const res = await handle(
      { callId: "0x" + "11".repeat(32), kind: "zk-execution" },
      { readAnchored: async () => anchoredRow() },
    );
    expect(res.envelope).toBeNull();
    expect(res.match).toBe(false);
    expect(res.source).toBeNull();
  });

  test("a mismatched on-chain claim is carried, not turned into a match", async () => {
    const { handle } = await import("../api/evidence.js");
    const res = await handle(
      { callId: LIVE_CALL, kind: "zk-execution" },
      { readAnchored: async () => anchoredRow({ claimHash: "0x" + "22".repeat(32) }) },
    );
    expect(res.claimHash).toBe("0x" + "22".repeat(32));
    expect(res.digest).toBe(LIVE_CLAIM_HASH);
    expect(res.match).toBe(false);
  });

  test("a reordered statement the chain never anchored is not a match", async () => {
    const { handle } = await import("../api/evidence.js");
    const res = await handle(
      { callId: LIVE_CALL, kind: "zk-execution" },
      {
        readAnchored: async () =>
          anchoredRow({ statementHash: statementHash(fixture.statement.replace("published", "other")) }),
      },
    );
    expect(res.match).toBe(false);
    expect(res.statementHash).not.toBe(res.anchoredStatementHash);
  });

  test("a reordered assumption list is not a match", async () => {
    const { handle } = await import("../api/evidence.js");
    const res = await handle(
      { callId: LIVE_CALL, kind: "zk-execution" },
      {
        readAnchored: async () =>
          anchoredRow({ assumptionHash: assumptionHash([fixture.assumptions[1], fixture.assumptions[0], fixture.assumptions[2]]) }),
      },
    );
    expect(res.match).toBe(false);
    expect(res.assumptionHash).not.toBe(res.anchoredAssumptionHash);
  });

  test("with no registry configured nothing on chain is claimed, and the fixture still answers", async () => {
    const { handle } = await import("../api/evidence.js");
    let fetchCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("network must not be touched");
    }) as typeof fetch;
    try {
      const res = await handle({ callId: LIVE_CALL, kind: "zk-execution" });
      expect(fetchCalls).toBe(0);
      expect(res.anchored).toBe(false);
      expect(res.claimHash).toBeNull();
      expect(res.anchoredStatementHash).toBeNull();
      expect(res.anchoredAssumptionHash).toBeNull();
      expect(res.match).toBe(false);
      expect(res.note).toBe("no-registry");
      expect(res.envelope ? envelopeDigest(res.envelope as EvidenceEnvelope) : null).toBe(LIVE_CLAIM_HASH);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("an injected read that throws reports a failed look, not an absence", async () => {
    const { handle } = await import("../api/evidence.js");
    const res = await handle(
      { callId: LIVE_CALL, kind: "zk-execution" },
      { readAnchored: async () => { throw new Error("rpc failed"); } },
    );
    expect(res.anchored).toBe(false);
    expect(res.note).toBe("rpc-error");
    expect(res.match).toBe(false);
  });

  test("the fixture is withheld for a call it does not describe, even with an anchored row", async () => {
    const { handle } = await import("../api/evidence.js");
    const res = await handle(
      { callId: "0x" + "aa".repeat(32), kind: "zk-execution" },
      { readAnchored: async () => anchoredRow() },
    );
    expect(res.envelope).toBeNull();
    expect(res.digest).toBeNull();
    expect(res.match).toBe(false);
    if (res.source === "fixture") throw new Error("fixture served for a call it does not describe");
  });
});

describe("GET /api/evidence wrapper", () => {
  test("answers 200 with JSON content type and CORS for the live call", async () => {
    const { default: handler } = await import("../api/evidence.js");
    const rows = { headers: {} as Record<string, string>, statusCode: 0, body: undefined as unknown };
    const res = {
      setHeader(key: string, value: string) {
        rows.headers[key] = value;
        return this;
      },
      status(code: number) {
        rows.statusCode = code;
        return this;
      },
      json(body: unknown) {
        rows.headers["Content-Type"] = rows.headers["Content-Type"] || "application/json";
        rows.body = body;
        return this;
      },
      end() {
        return this;
      },
    };
    await handler(
      { method: "GET", query: { callId: LIVE_CALL, kind: "zk-execution" }, headers: {}, url: "/api/evidence" },
      res,
    );
    expect(rows.statusCode).toBe(200);
    expect(rows.headers["Content-Type"]).toBe("application/json");
    expect(rows.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  test("answers 404 for the unknown call", async () => {
    const { default: handler } = await import("../api/evidence.js");
    const rows = { statusCode: 0, body: undefined as unknown };
    const res = {
      setHeader() {
        return this;
      },
      status(code: number) {
        rows.statusCode = code;
        return this;
      },
      json(body: unknown) {
        rows.body = body;
        return this;
      },
      end() {
        return this;
      },
    };
    await handler(
      { method: "GET", query: { callId: "0x" + "11".repeat(32), kind: "zk-execution" }, headers: {}, url: "/api/evidence" },
      res,
    );
    expect(rows.statusCode).toBe(404);
    expect((rows.body as { envelope: unknown }).envelope).toBeNull();
  });
});

describe("api/evidence.js source discipline", () => {
  test("imports no specifier ending in .ts", () => {
    // Vercel's Node builder compiles the TypeScript it reaches but does not rewrite
    // import specifiers: the emitter sits next to the handler as schema.js, while the
    // handler keeps asking for schema.ts — which resolves to nothing on the deploy
    // runtime. A green bun test hides that failure (bun happily resolves .ts), so the
    // guard is on the source text: no specifier in api/evidence.js may end in ".ts".
    const source = readFileSync("api/evidence.js", "utf8");
    const tsSpecifier = /(?:from|import)\s+["'][^"']+\.ts["']/;
    expect(tsSpecifier.test(source)).toBe(false);
  });
});

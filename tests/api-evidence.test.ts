import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { keccak256, toBytes } from "viem";

import { assumptionHash, statementHash } from "../src/lib/verification/claimHashes";
import { envelopeDigest, type EvidenceEnvelope } from "../src/lib/verification/schema";

// The committed zk-execution fixture is one of two bundled envelopes.
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
    const { handle } = await import("../api/_evidence.js");
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
    const { handle } = await import("../api/_evidence.js");
    const res = await handle(
      { callId: "0x" + "11".repeat(32), kind: "zk-execution" },
      { readAnchored: async () => anchoredRow() },
    );
    expect(res.envelope).toBeNull();
    expect(res.match).toBe(false);
    expect(res.source).toBeNull();
  });

  test("a mismatched on-chain claim is carried, not turned into a match", async () => {
    const { handle } = await import("../api/_evidence.js");
    const res = await handle(
      { callId: LIVE_CALL, kind: "zk-execution" },
      { readAnchored: async () => anchoredRow({ claimHash: "0x" + "22".repeat(32) }) },
    );
    expect(res.claimHash).toBe("0x" + "22".repeat(32));
    expect(res.digest).toBe(LIVE_CLAIM_HASH);
    expect(res.match).toBe(false);
  });

  test("a reordered statement the chain never anchored is not a match", async () => {
    const { handle } = await import("../api/_evidence.js");
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
    const { handle } = await import("../api/_evidence.js");
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
    const { handle } = await import("../api/_evidence.js");
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
    const { handle } = await import("../api/_evidence.js");
    const res = await handle(
      { callId: LIVE_CALL, kind: "zk-execution" },
      { readAnchored: async () => { throw new Error("rpc failed"); } },
    );
    expect(res.anchored).toBe(false);
    expect(res.note).toBe("rpc-error");
    expect(res.match).toBe(false);
  });

  test("the fixture is withheld for a call it does not describe, even with an anchored row", async () => {
    const { handle } = await import("../api/_evidence.js");
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

// The witness fixture describes the same live call as the zk-execution one: the
// payload was both witnessed by an attestor and executed inside a guest. Two kinds,
// one call, two claims — which is why the bundle lookup has to be keyed by kind and
// not by callId.
const witnessFixture = JSON.parse(
  readFileSync("src/lib/verification/fixtures/witness.json", "utf8"),
) as {
  callId: `0x${string}`;
  responseHash: `0x${string}`;
  claimHash: `0x${string}`;
  statement: string;
  assumptions: string[];
};

function witnessRow(overrides: Record<string, string> = {}) {
  return {
    kind: keccak256(toBytes("witness")),
    claimHash: witnessFixture.claimHash,
    responseHash: witnessFixture.responseHash,
    statementHash: statementHash(witnessFixture.statement),
    assumptionHash: assumptionHash(witnessFixture.assumptions),
    verifier: "0x046d715D28143e45E38f1a1114A0462898630498",
    anchoredAt: 1793020800,
    ...overrides,
  };
}

describe("GET /api/evidence: the witness bundle", () => {
  test("serves the witness envelope for kind=witness, not the zk one", async () => {
    const { handle } = await import("../api/_evidence.js");
    const res = await handle(
      { callId: witnessFixture.callId, kind: "witness" },
      { readAnchored: async () => witnessRow() },
    );
    const envelope = res.envelope as EvidenceEnvelope;
    expect(envelope.claim.kind).toBe("witness");
    expect(envelope.proof.type).toBe("sla-provenance-record");
    expect(res.match).toBe(true);
    expect(res.digest).toBe(witnessFixture.claimHash);
    expect(res.source).toBe("fixture");
    // Same callId as the zk-execution fixture, different claim: a bundle lookup that
    // matched on callId alone would hand a reader the wrong statement.
    expect(res.digest).not.toBe(LIVE_CLAIM_HASH);
  });

  test("serving it does not disturb the zk-execution bundle", async () => {
    const { handle } = await import("../api/_evidence.js");
    const res = await handle(
      { callId: LIVE_CALL, kind: "zk-execution" },
      { readAnchored: async () => anchoredRow() },
    );
    expect((res.envelope as EvidenceEnvelope).claim.kind).toBe("zk-execution");
    expect(res.digest).toBe(LIVE_CLAIM_HASH);
    expect(res.match).toBe(true);
  });

  test("no fixture exists for zk-constraint, so nothing is invented for it", async () => {
    const { handle } = await import("../api/_evidence.js");
    const res = await handle(
      { callId: LIVE_CALL, kind: "zk-constraint" },
      { readAnchored: async () => null },
    );
    expect(res.envelope).toBeNull();
    expect(res.source).toBeNull();
    expect(res.digest).toBeNull();
  });

  test("a witness row that disagrees with the fixture is carried, not matched", async () => {
    const { handle } = await import("../api/_evidence.js");
    const res = await handle(
      { callId: witnessFixture.callId, kind: "witness" },
      { readAnchored: async () => witnessRow({ claimHash: "0x" + "33".repeat(32) }) },
    );
    expect(res.claimHash).toBe("0x" + "33".repeat(32));
    expect(res.digest).toBe(witnessFixture.claimHash);
    expect(res.match).toBe(false);
  });

  test("answers 200 for the witness bundle", async () => {
    const { sendEvidence: handler } = await import("../api/_evidence.js");
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
    // Both a registry and an RPC URL, so the answer is a read that succeeded rather
    // than `no-registry`/`rpc-error` — those two turn the status into 502 by design.
    process.env.SLA_EVIDENCE_V2 = "0x64872c29A19dF8E471103d0708397BAb96A311FC";
    process.env.ARC_RPC_URL = "https://rpc.testnet.arc.io";
    const savedFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string | URL | Request, _init?: RequestInit) => {
      // Answer with the witness row encoded exactly as the registry returns it.
      const { encodeAbiParameters } = await import("viem");
      const row = witnessRow();
      const data = encodeAbiParameters(
        [
          {
            type: "tuple",
            components: [
              { name: "kind", type: "bytes32" },
              { name: "claimHash", type: "bytes32" },
              { name: "responseHash", type: "bytes32" },
              { name: "statementHash", type: "bytes32" },
              { name: "assumptionHash", type: "bytes32" },
              { name: "verifier", type: "address" },
              { name: "anchoredAt", type: "uint64" },
            ],
          },
        ],
        [row as never],
      );
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: data }), {
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    try {
      await handler(
        {
          method: "GET",
          query: { callId: witnessFixture.callId, kind: "witness" },
          headers: {},
          url: "/api/evidence",
        },
        res,
      );
    } finally {
      globalThis.fetch = savedFetch;
      delete process.env.SLA_EVIDENCE_V2;
      delete process.env.ARC_RPC_URL;
    }
    expect(rows.statusCode).toBe(200);
    const body = rows.body as { match: boolean; source: string; kind: string };
    expect(body.kind).toBe("witness");
    expect(body.source).toBe("fixture");
    expect(body.match).toBe(true);
  });
});

describe("GET /api/evidence wrapper", () => {
  test("answers 200 with JSON content type and CORS for the live call", async () => {
    const { sendEvidence: handler } = await import("../api/_evidence.js");
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

  test("answers 502, not 404, when the chain read failed", async () => {
    // A status-only caller cannot see `note`. The status code itself has to carry
    // "the look failed" — 404 would say "nothing is anchored", which is a claim
    // the endpoint could not make.
    const { sendEvidence: handler } = await import("../api/_evidence.js");
    const saved = {
      registry: process.env.SLA_EVIDENCE_V2,
      vregistry: process.env.VITE_SLA_EVIDENCE_V2,
      arc: process.env.ARC_RPC_URL,
      arcTestnet: process.env.ARC_TESTNET_RPC_URL,
      rpc: process.env.RPC_URL,
    };
    process.env.SLA_EVIDENCE_V2 = "0x8bD4fB9F364F9aAd80E4dB275B08a49B88e3664E";
    delete process.env.VITE_SLA_EVIDENCE_V2;
    delete process.env.ARC_RPC_URL;
    delete process.env.ARC_TESTNET_RPC_URL;
    delete process.env.RPC_URL;
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
    try {
      await handler(
        { method: "GET", query: { callId: LIVE_CALL, kind: "zk-execution" }, headers: {}, url: "/api/evidence" },
        res,
      );
    } finally {
      const restore = (key: string, value: string | undefined) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      };
      restore("SLA_EVIDENCE_V2", saved.registry);
      restore("VITE_SLA_EVIDENCE_V2", saved.vregistry);
      restore("ARC_RPC_URL", saved.arc);
      restore("ARC_TESTNET_RPC_URL", saved.arcTestnet);
      restore("RPC_URL", saved.rpc);
    }
    expect((rows.body as { note: string | null }).note).toBe("rpc-error");
    expect(rows.statusCode).toBe(502);
  });

  test("answers 404 for the unknown call", async () => {
    const { sendEvidence: handler } = await import("../api/_evidence.js");
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

describe("getEvidence decode", () => {
  test("decodes the recorded chain result into a named row", async () => {
    // Proof, not a guess: this is the real `eth_call` result for the live fixture
    // on SLAEvidenceRegistryV2 (block 69469682). viem returns one tuple output as
    // an object, so `const [row] = decode…` throws and the route answers 502 —
    // which is exactly what production did before this test existed.
    const recorded =
      "0x1543345ab2c7d9f20f0ca458172e62bb9c41a1746258195a37a403fef58c9031" +
      "e3baff68e7c0299a4275cc3e7553fb27da16d1929fa47a5fe04ab7b58b9f419c" +
      "188fcd5cf9ef16dcca9118fafa7971df7a86f5b5762c15c204d6a3d29f4e6e8d" +
      "f638c765d435690aa9da23cf4ab8d3e58f5b29ea8f7ee90d85829f583cd510f9" +
      "a007194563d9649410719f9f3ba3daf8a8ccefb11c70a25d51be40753d91fef9" +
      "000000000000000000000000d804f2e0efb3d8c470d60942643b71ea5b271a21" +
      "000000000000000000000000000000000000000000000000000000006ae1ad5f";
    const { decodeEvidenceRow } = await import("../api/_evidence.js");
    const row = decodeEvidenceRow(recorded);
    expect(row.claimHash).toBe(LIVE_CLAIM_HASH);
    expect(row.statementHash).toBe("0xf638c765d435690aa9da23cf4ab8d3e58f5b29ea8f7ee90d85829f583cd510f9");
    expect(row.verifier).toBe("0xD804F2E0EfB3D8c470d60942643B71Ea5b271a21");
    expect(Number(row.anchoredAt)).toBe(1793174879);
  });
});

describe("/api/evidence rewrite target", () => {
  test("attestation?evidence=1 serves the evidence payload", async () => {
    // The Hobby plan caps a deployment at 12 Serverless Functions, so the public
    // `/api/evidence` path is a rewrite onto `/api/attestation?evidence=1`. If that
    // dispatch is lost, the UI's statement mirror silently answers with a verdict
    // body instead of an evidence body.
    const { default: attestation } = await import("../api/attestation.js");
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
    await attestation(
      {
        method: "GET",
        query: { evidence: "1", callId: "0x" + "11".repeat(32), kind: "zk-execution" },
        headers: {},
        url: "/api/attestation?evidence=1",
      },
      res,
    );
    const body = rows.body as { kind?: string; anchored?: boolean; match?: boolean };
    expect(body.kind).toBe("zk-execution");
    expect(body.anchored).toBe(false);
    expect(body.match).toBe(false);
    expect(rows.statusCode).toBe(404);
  });
});

describe("api/_evidence.js source discipline", () => {
  test("imports no specifier ending in .ts", () => {
    // Vercel's Node builder compiles the TypeScript it reaches but does not rewrite
    // import specifiers: the emitter sits next to the handler as schema.js, while the
    // handler keeps asking for schema.ts — which resolves to nothing on the deploy
    // runtime. A green bun test hides that failure (bun happily resolves .ts), so the
    // guard is on the source text: no specifier in api/_evidence.js may end in ".ts".
    const source = readFileSync("api/_evidence.js", "utf8");
    const tsSpecifier = /(?:from|import)\s+["'][^"']+\.ts["']/;
    expect(tsSpecifier.test(source)).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  checkTdxBinding,
  composeHash,
  expectedReportData,
  replayRtmr3,
  verifyTdxQuote,
  type TdxEvent,
  type TdxOptions,
  type TdxResult,
} from "../../src/lib/verification/tdx";
import { CG_CLAIM_VERSION, subjectUserData, type EvidenceEnvelope } from "../../src/lib/verification/schema";
import { verifyEvidence } from "../../src/lib/verification/verify";

const HEX = (bytes: number, fill: number) => `0x${fill.toString(16).padStart(2, "0").repeat(bytes)}`;

const subject = {
  callId: HEX(32, 0x11) as `0x${string}`,
  providerId: 1,
  termsHash: HEX(32, 0x22) as `0x${string}`,
  responseHash: HEX(32, 0x33) as `0x${string}`,
};

const nonce = new Uint8Array(32).fill(0x44);

const APP_COMPOSE = JSON.stringify({ docker_compose_file: "services:\n  app:\n    image: app@sha256:abc" });

function event(imr: number, name: string, digest: string, payload = ""): TdxEvent {
  return { imr, event_type: 1, digest, event: name, event_payload: payload };
}

function composeEvent(): TdxEvent {
  return event(3, "compose-hash", `0x${"a".repeat(96)}`, composeHash(APP_COMPOSE).slice(2));
}

function options(): TdxOptions {
  return {
    collateral: {
      pck_crl_issuer_chain: "",
      root_ca_crl: [],
      pck_crl: [],
      tcb_info_issuer_chain: "",
      tcb_info: "",
      tcb_info_signature: [],
      qe_identity_issuer_chain: "",
      qe_identity: "",
      qe_identity_signature: [],
    },
    allowedComposeHashes: [composeHash(APP_COMPOSE)],
    now: 1_792_000_000,
  };
}

/** A hardware-verified result, as it would look before binding checks run. */
function hardwareResult(events: TdxEvent[]): TdxResult {
  return {
    ok: true,
    reasons: [],
    platform: "tdx",
    tcbStatus: "UpToDate",
    advisoryIds: [],
    reportData: Buffer.from(expectedReportData(subject, nonce)).toString("hex"),
    measurements: {
      mrSeam: HEX(48, 0),
      mrTd: HEX(48, 1),
      rtMr0: HEX(48, 2),
      rtMr1: HEX(48, 3),
      rtMr2: HEX(48, 4),
      rtMr3: replayRtmr3(events),
      teeTcbSvn: HEX(16, 6),
      tdAttributes: `0x${"00".repeat(8)}`,
    },
  };
}

describe("report_data layout", () => {
  test("carries the shared call binding first and the nonce second", () => {
    const bytes = expectedReportData(subject, nonce);
    expect(bytes.length).toBe(64);
    expect(Buffer.from(bytes.slice(0, 32)).toString("hex")).toBe(subjectUserData(subject).slice(2));
    expect(Buffer.from(bytes.slice(32)).toString("hex")).toBe("44".repeat(32));
  });

  test("refuses a nonce that is not 32 bytes instead of padding it", () => {
    expect(() => expectedReportData(subject, new Uint8Array(31))).toThrow(/32 bytes/);
  });
});

describe("RTMR3 replay", () => {
  test("starts from 48 zero bytes and chains every imr=3 event", () => {
    const first = event(3, "compose-hash", HEX(48, 0xaa));
    const second = event(3, "instance-id", HEX(48, 0xbb));
    const manual = createHash("sha384")
      .update(Buffer.from(createHash("sha384").update(Buffer.alloc(48)).update(Buffer.from("aa".repeat(48), "hex")).digest()))
      .update(Buffer.from("bb".repeat(48), "hex"))
      .digest("hex");
    expect(replayRtmr3([first, second])).toBe(`0x${manual}`);
  });

  test("ignores events measured into other registers", () => {
    const kept = event(3, "compose-hash", HEX(48, 0xaa));
    const ignored = event(1, "kernel", HEX(48, 0xcc));
    expect(replayRtmr3([kept, ignored])).toBe(replayRtmr3([kept]));
  });

  test("order matters: the same events swapped replay differently", () => {
    const a = event(3, "compose-hash", HEX(48, 0xaa));
    const b = event(3, "instance-id", HEX(48, 0xbb));
    expect(replayRtmr3([a, b])).not.toBe(replayRtmr3([b, a]));
  });

  test("pads a short digest to 48 bytes rather than rejecting the log", () => {
    const short = event(3, "key-provider", `0x${"dd".repeat(32)}`);
    expect(replayRtmr3([short])).toMatch(/^0x[0-9a-f]{96}$/);
  });
});

describe("compose-hash", () => {
  test("is sha256 of the exact app_compose bytes the CVM served", () => {
    expect(composeHash(APP_COMPOSE)).toBe(`0x${createHash("sha256").update(APP_COMPOSE).digest("hex")}`);
  });

  test("changes when a single byte of the configuration changes", () => {
    expect(composeHash(`${APP_COMPOSE} `)).not.toBe(composeHash(APP_COMPOSE));
  });
});

describe("verifyTdxQuote refusals", () => {
  test("refuses bytes that are not a quote, and says so", () => {
    const result = verifyTdxQuote(Uint8Array.from([1, 2, 3]), options());
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("unparseable");
  });

  test("never reports success without a signature chain check", () => {
    const result = verifyTdxQuote(new Uint8Array(1200), options());
    expect(result.ok).toBe(false);
  });
});

describe("checkTdxBinding", () => {
  test("accepts a quote that binds this call, this nonce and an allowlisted image", () => {
    const events = [composeEvent()];
    const result = checkTdxBinding(hardwareResult(events), subject, nonce, events, APP_COMPOSE, options());
    expect(result.reasons).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.composeHash).toBe(composeHash(APP_COMPOSE));
  });

  test("rejects a quote issued for another call, even on the same image", () => {
    const events = [composeEvent()];
    const other = { ...subject, callId: HEX(32, 0x99) as `0x${string}` };
    const result = checkTdxBinding(hardwareResult(events), other, nonce, events, APP_COMPOSE, options());
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("report_data");
  });

  test("rejects a replayed quote whose nonce is not the caller's", () => {
    const events = [composeEvent()];
    const result = checkTdxBinding(
      hardwareResult(events),
      subject,
      new Uint8Array(32).fill(0x55),
      events,
      APP_COMPOSE,
      options(),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("report_data");
  });

  test("rejects an event log that does not replay to the quoted RTMR3", () => {
    const events = [composeEvent()];
    const tampered = hardwareResult(events);
    tampered.measurements = { ...tampered.measurements!, rtMr3: HEX(48, 0x77) };
    const result = checkTdxBinding(tampered, subject, nonce, events, APP_COMPOSE, options());
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("replays to RTMR3");
  });

  test("rejects a log with no compose-hash, because the image is unnamed", () => {
    const events = [event(3, "instance-id", HEX(48, 0xbb))];
    const result = checkTdxBinding(hardwareResult(events), subject, nonce, events, APP_COMPOSE, options());
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("no compose-hash");
  });

  test("rejects a served app_compose that is not the measured one", () => {
    const events = [composeEvent()];
    const result = checkTdxBinding(
      hardwareResult(events),
      subject,
      nonce,
      events,
      `${APP_COMPOSE}\n# edited after boot`,
      options(),
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("not sha256");
  });

  test("rejects a measured image the caller did not allowlist", () => {
    const events = [composeEvent()];
    const rejected = { ...options(), allowedComposeHashes: [composeHash("something else")] };
    const result = checkTdxBinding(hardwareResult(events), subject, nonce, events, APP_COMPOSE, rejected);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("allowlist");
  });

  test("stays failed when the hardware check already failed", () => {
    const events = [composeEvent()];
    const broken: TdxResult = { ok: false, reasons: ["TCB status Revoked"], platform: "tdx", advisoryIds: [] };
    expect(checkTdxBinding(broken, subject, nonce, events, APP_COMPOSE, options()).ok).toBe(false);
  });
});

describe("verifyEvidence with a TDX proof", () => {
  function envelope(): EvidenceEnvelope {
    return {
      version: CG_CLAIM_VERSION,
      subject,
      claim: {
        kind: "tee-attestation",
        statement: "The body was produced inside the measured TDX trust domain for this call",
        assumptions: ["Intel TDX root of trust", "the compose-hash allowlist is current"],
      },
      proof: { type: "intel-tdx-quote", payload: Buffer.from("not a quote").toString("base64") },
      issuedAt: 1_792_000_000,
    };
  }

  test("refuses to guess when the verifier inputs are missing", () => {
    const report = verifyEvidence(envelope(), { nitro: { rootCertsPem: [], now: 0, maxAgeSec: 0 }, allowedPcr0: [] });
    expect(report.ok).toBe(false);
    expect(report.reasons.join(" ")).toContain("no TDX verifier inputs");
    expect(report.detail).toMatchObject({ kind: "tee-attestation", platform: "tdx" });
  });

  test("fails an unusable payload before reaching the chain check", () => {
    const broken = { ...envelope(), proof: { type: "intel-tdx-quote", payload: "" } };
    const report = verifyEvidence(broken, { nitro: { rootCertsPem: [], now: 0, maxAgeSec: 0 }, allowedPcr0: [] });
    expect(report.ok).toBe(false);
    expect(report.reasons.join(" ")).toContain("proof.payload is required");
  });
});

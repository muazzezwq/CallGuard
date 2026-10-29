import { createHash } from "node:crypto";
import {
  Quote,
  QuoteVerifier,
  constants,
  type Collateral,
  type TDReport10,
  type TcbStatus,
} from "@phala/dcap-qvl";
import { subjectUserData, type ClaimSubject, type ValidationResult } from "./schema.js";

/**
 * Intel TDX attestation verification, off chain.
 *
 * What a passing quote proves: a trust domain measured by `MRTD`/`RTMR*` and bound
 * to `MRSEAM` signed `report_data`, and the signing chain resolves to Intel's root
 * through collateral that has not expired. What it does not prove: that the body
 * handed back is a correct answer, or that the container image those measurements
 * name contains the source anyone reviewed.
 *
 * `report_data` is 64 bytes and carries the binding: the first 32 are the same
 * `subjectUserData` an SGX/Nitro enclave would put in `userData`, the last 32 are
 * the caller's nonce. The nonce is what makes a quote fresh — TDX quotes carry no
 * timestamp, so replay is excluded by the caller choosing a random nonce and
 * refusing a quote that does not echo it.
 *
 * Chain verification is delegated to `@phala/dcap-qvl`, a pure-JS DCAP verifier
 * that pins Intel's production root CA. Collateral is passed in, never fetched
 * here: a verifier that silently fetches its own evidence is not reproducible.
 */

/** TCB states this layer accepts. A revoked or out-of-date platform is a refusal. */
const ACCEPTED_TCB: TcbStatus[] = ["UpToDate", "SWHardeningNeeded"];

/** `TUD.DEBUG` is bit 0 of `td_attributes`; a debug TD is not a TEE. */
const TD_ATTRIBUTES_DEBUG_BIT = 0n;

export interface TdxEvent {
  imr: number;
  event_type: number;
  /** Hex digest the boot chain extended, normally SHA-384 for RTMRs. */
  digest: string;
  event: string;
  event_payload: string;
}

export interface TdxOptions {
  /** Pinned DCAP collateral for this FMSPC. Never fetched by the verifier itself. */
  collateral: Collateral;
  /** `sha256(app_compose)` values this caller accepts as "the code I reviewed". */
  allowedComposeHashes: string[];
  /** Unix seconds, injected so a result does not depend on the machine clock. */
  now: number;
}

export interface TdxMeasurements {
  mrSeam: string;
  mrTd: string;
  rtMr0: string;
  rtMr1: string;
  rtMr2: string;
  rtMr3: string;
  /** TDX module security version, for the TCB status discussion in the report. */
  teeTcbSvn: string;
  tdAttributes: string;
}

export interface TdxResult extends ValidationResult {
  platform: "tdx";
  tcbStatus?: TcbStatus;
  advisoryIds: string[];
  measurements?: TdxMeasurements;
  /** Hex of the quote's 64-byte `report_data`. */
  reportData?: string;
  /** `compose-hash` replayed out of RTMR3, when an event log was supplied. */
  composeHash?: string;
}

function fail(reason: string, extra: Partial<TdxResult> = {}): TdxResult {
  return { ok: false, reasons: [reason], platform: "tdx", advisoryIds: [], ...extra };
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function sha384(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const hash = createHash("sha384");
  for (const part of parts) hash.update(part);
  return new Uint8Array(hash.digest());
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * The 64 bytes an enclave must put in `report_data` for this call and nonce.
 *
 * First half: the call binding every platform in this layer shares, so a quote for
 * one call cannot be presented for another. Second half: the caller's nonce, which
 * is the only freshness a TDX quote can carry.
 */
export function expectedReportData(subject: ClaimSubject, nonce: Uint8Array): Uint8Array<ArrayBuffer> {
  if (nonce.length !== 32) throw new Error("nonce must be 32 bytes");
  const binding = Buffer.from(subjectUserData(subject).slice(2), "hex");
  return new Uint8Array(Buffer.concat([binding, Buffer.from(nonce)]));
}

/**
 * Replay the RTMR3 hash chain from an event log.
 *
 * `RTMR3_new = SHA384(RTMR3_old || digest)`, starting from 48 zero bytes. The quote
 * carries the final value, so a tampered log cannot survive this comparison.
 */
export function replayRtmr3(events: TdxEvent[]): string {
  let rtmr = new Uint8Array(48);
  for (const event of events) {
    if (event.imr !== 3) continue;
    let digest = Buffer.from(event.digest.replace(/^0x/, ""), "hex");
    if (digest.length > 48) throw new Error(`RTMR3 event digest is longer than 48 bytes: ${event.event}`);
    if (digest.length < 48) digest = Buffer.concat([digest, Buffer.alloc(48 - digest.length)]);
    rtmr = sha384(rtmr, new Uint8Array(digest));
  }
  return `0x${hex(rtmr)}`;
}

/** `sha256` of the exact `app_compose` bytes the CVM served, as dstack measures it. */
export function composeHash(appCompose: string): string {
  return `0x${sha256(appCompose)}`;
}

function isDebug(tdAttributes: Uint8Array): boolean {
  if (tdAttributes.length !== 8) return false;
  let value = 0n;
  for (let index = 7; index >= 0; index -= 1) value = (value << 8n) | BigInt(tdAttributes[index]);
  return (value & TD_ATTRIBUTES_DEBUG_BIT) !== 0n;
}

function tdReport(quote: Quote): TDReport10 | null {
  const report = quote.report;
  if (report.type === "td10") return report.asTd10();
  if (report.type === "td15") return report.asTd15()?.base ?? null;
  if (report.type === "td15ex") return report.asTd15Ex()?.base.base ?? null;
  return null;
}

/**
 * Verify a TDX quote: parse, check the platform and debug bit, resolve the signing
 * chain to Intel's root, and report the measurements a caller can compare.
 */
export function verifyTdxQuote(quoteBytes: Uint8Array, options: TdxOptions): TdxResult {
  let quote: Quote;
  try {
    quote = Quote.parse(Buffer.from(quoteBytes));
  } catch (error) {
    return fail(`quote is unparseable: ${(error as Error).message}`);
  }

  if (quote.header.teeType !== constants.TEE_TYPE_TDX) {
    return fail(`quote is not TDX: tee_type ${quote.header.teeType}`);
  }

  if (quote.header.attestationKeyType !== constants.ATTESTATION_KEY_TYPE_ECDSA256_WITH_P256_CURVE) {
    return fail(`unsupported attestation key type ${quote.header.attestationKeyType}`);
  }

  const report = tdReport(quote);
  if (!report) return fail(`quote carries no TD report: body type ${quote.report.type}`);
  if (isDebug(report.tdAttributes)) return fail("TD is in debug mode: that is not a TEE");

  let verified;
  try {
    verified = QuoteVerifier.newProd().verify(Buffer.from(quoteBytes), options.collateral, options.now);
  } catch (error) {
    return fail(`quote signature chain rejected: ${(error as Error).message}`);
  }

  const measurements: TdxMeasurements = {
    mrSeam: `0x${hex(report.mrSeam)}`,
    mrTd: `0x${hex(report.mrTd)}`,
    rtMr0: `0x${hex(report.rtMr0)}`,
    rtMr1: `0x${hex(report.rtMr1)}`,
    rtMr2: `0x${hex(report.rtMr2)}`,
    rtMr3: `0x${hex(report.rtMr3)}`,
    teeTcbSvn: `0x${hex(report.teeTcbSvn)}`,
    tdAttributes: `0x${hex(report.tdAttributes)}`,
  };

  const base: TdxResult = {
    ok: true,
    reasons: [],
    platform: "tdx",
    tcbStatus: verified.status,
    advisoryIds: verified.advisory_ids,
    measurements,
    reportData: hex(report.reportData),
  };

  if (!ACCEPTED_TCB.includes(verified.status)) {
    return {
      ...base,
      ok: false,
      reasons: [`TCB status ${verified.status} is not accepted (allowed: ${ACCEPTED_TCB.join(", ")})`],
    };
  }

  return base;
}

/**
 * Check that the quote is about this call and this nonce, that the event log
 * replays to the quoted RTMR3, and that the measured compose-hash is one the
 * caller accepts.
 *
 * Deliberately separate from `verifyTdxQuote`: hardware validity and claim binding
 * fail for different reasons, and the report should say which one broke.
 */
export function checkTdxBinding(
  result: TdxResult,
  subject: ClaimSubject,
  nonce: Uint8Array,
  events: TdxEvent[],
  appCompose: string,
  options: TdxOptions,
): TdxResult {
  if (!result.ok) return result;

  const reasons: string[] = [];
  const expected = expectedReportData(subject, nonce);
  if (!result.reportData) {
    reasons.push("quote carries no report_data");
  } else if (result.reportData !== hex(expected)) {
    reasons.push(
      `report_data ${result.reportData} is not the binding for call ${subject.callId} and this nonce`,
    );
  }

  const replayed = replayRtmr3(events);
  if (!result.measurements || replayed !== result.measurements.rtMr3) {
    reasons.push(
      `event log replays to RTMR3 ${replayed}, quote says ${result.measurements?.rtMr3 ?? "nothing"}`,
    );
  }

  const composeEvent = events.find(event => event.imr === 3 && event.event === "compose-hash");
  if (!composeEvent) {
    reasons.push("event log carries no compose-hash: the running image is unnamed");
  } else {
    const measured = `0x${composeEvent.event_payload.replace(/^0x/, "").toLowerCase()}`;
    const served = composeHash(appCompose);
    if (measured !== served) {
      reasons.push(`compose-hash ${measured} is not sha256 of the served app_compose (${served})`);
    }
    if (!options.allowedComposeHashes.map(value => value.toLowerCase()).includes(measured)) {
      reasons.push(`compose-hash ${measured} is not in the allowlist`);
    }
  }

  return { ...result, ok: reasons.length === 0, reasons: [...result.reasons, ...reasons], composeHash: composeEvent ? `0x${composeEvent.event_payload.replace(/^0x/, "").toLowerCase()}` : undefined };
}

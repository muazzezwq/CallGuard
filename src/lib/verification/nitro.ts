import { verify as verifySignature, X509Certificate } from "node:crypto";
import { decodeCbor, encodeCbor, type CborValue } from "./cbor";
import { subjectUserData, type ClaimSubject, type ValidationResult } from "./schema";

/**
 * AWS Nitro Enclave attestation verification, off chain.
 *
 * What a passing document proves: an enclave whose image measures to PCR0 signed a
 * statement that includes `userData`, and the signing certificate chains to a root
 * the caller configured. What it does not prove: that the API data inside is true,
 * that the enclave hardware is free of side channels, or that the image on the
 * allowlist is the image the code was reviewed in.
 *
 * This runs off chain on purpose. Nitro signs with P-384, and the EVM has no
 * P-384 precompile, so on chain the result is anchored as an EIP-712 signature by
 * an allowlisted verifier key — the same trust shape as `SLAProvenance`.
 */

const ES384 = -35;
const CLOCK_SKEW_SEC = 300;
const MAX_CHAIN_DEPTH = 6;

export interface NitroOptions {
  /** PEM roots to trust. Production passes the AWS Nitro root; tests pass a fixture. */
  rootCertsPem: string[];
  /** Unix seconds. Injected so the result does not depend on the machine clock. */
  now: number;
  /** How old an attestation may be before it is refused. */
  maxAgeSec: number;
}

export interface NitroResult extends ValidationResult {
  moduleId?: string;
  timestamp?: number;
  /** PCR index → lowercase hex, `0x`-prefixed. */
  pcrs?: Record<number, string>;
  userData?: Uint8Array;
  nonce?: Uint8Array;
  leafFingerprint?: string;
}

function fail(reason: string): NitroResult {
  return { ok: false, reasons: [reason] };
}

export function verifyNitroDoc(doc: Uint8Array, options: NitroOptions): NitroResult {
  if (options.rootCertsPem.length === 0) {
    return fail("no trust root configured: refusing to trust an arbitrary certificate");
  }

  let parsed: CborValue;
  try {
    parsed = decodeCbor(doc);
  } catch (error) {
    return fail(`document is not valid CBOR: ${(error as Error).message}`);
  }
  if (!Array.isArray(parsed) || parsed.length !== 4) {
    return fail("document is not a COSE_Sign1 array of four items");
  }
  const [protectedHeader, , payloadBytes, signature] = parsed;
  if (!(protectedHeader instanceof Uint8Array) || !(payloadBytes instanceof Uint8Array) || !(signature instanceof Uint8Array)) {
    return fail("document is not a COSE_Sign1 array of four items");
  }

  let protectedMap: CborValue;
  let payloadMap: CborValue;
  try {
    protectedMap = decodeCbor(protectedHeader);
    payloadMap = decodeCbor(payloadBytes);
  } catch (error) {
    return fail(`attestation payload is not valid CBOR: ${(error as Error).message}`);
  }
  if (!(protectedMap instanceof Map)) return fail("protected header is not a CBOR map");
  if (!(payloadMap instanceof Map)) return fail("attestation payload is not a CBOR map");

  if (protectedMap.get(1) !== ES384) {
    return fail("protected header must name ES384 (alg -35)");
  }

  const leafDer = payloadMap.get("certificate");
  const cabundle = payloadMap.get("cabundle");
  if (!(leafDer instanceof Uint8Array)) return fail("attestation carries no signing certificate");
  if (!Array.isArray(cabundle)) return fail("attestation carries no caBundle");

  let leaf: X509Certificate;
  let intermediates: X509Certificate[];
  try {
    leaf = new X509Certificate(Buffer.from(leafDer));
    intermediates = cabundle.map(item => {
      if (!(item instanceof Uint8Array)) throw new Error("caBundle entry is not a certificate");
      return new X509Certificate(Buffer.from(item));
    });
  } catch (error) {
    return fail(`attestation certificate is not parseable: ${(error as Error).message}`);
  }

  // Signature before trust: a document that does not verify is not worth chaining.
  const sigStructure = encodeCbor(["Signature1", protectedHeader, new Uint8Array(0), payloadBytes]);
  let signed: boolean;
  try {
    signed = verifySignature(
      "sha384",
      sigStructure,
      { key: leaf.publicKey, dsaEncoding: "ieee-p1363" },
      signature,
    );
  } catch (error) {
    return fail(`COSE signature check failed: ${(error as Error).message}`);
  }
  if (!signed) return fail("COSE signature does not verify against the leaf certificate");

  const chain = verifyChain(leaf, intermediates, options.rootCertsPem, options.now);
  if (!chain.ok) return chain;

  const timestamp = payloadMap.get("timestamp");
  if (typeof timestamp !== "number") return fail("attestation carries no timestamp");
  if (timestamp > options.now + CLOCK_SKEW_SEC) return fail("attestation timestamp is in the future");
  if (options.now - timestamp > options.maxAgeSec) {
    return fail(`attestation is stale: ${options.now - timestamp}s old, limit ${options.maxAgeSec}s`);
  }

  const pcrsRaw = payloadMap.get("pcrs");
  if (!(pcrsRaw instanceof Map)) return fail("attestation carries no PCRs");
  const pcrs: Record<number, string> = {};
  for (const [index, value] of pcrsRaw) {
    if (typeof index !== "number" || !(value instanceof Uint8Array)) return fail("attestation PCR map is malformed");
    pcrs[index] = `0x${Buffer.from(value).toString("hex")}`;
  }
  if (!pcrs[0]) return fail("attestation carries no PCR0, so the image is unknown");

  const moduleId = payloadMap.get("module_id");
  const userData = payloadMap.get("user_data");
  const nonce = payloadMap.get("nonce");

  return {
    ok: true,
    reasons: [],
    moduleId: typeof moduleId === "string" ? moduleId : undefined,
    timestamp,
    pcrs,
    userData: userData instanceof Uint8Array ? userData : undefined,
    nonce: nonce instanceof Uint8Array ? nonce : undefined,
    leafFingerprint: leaf.fingerprint256,
  };
}

function verifyChain(
  leaf: X509Certificate,
  intermediates: X509Certificate[],
  rootCertsPem: string[],
  now: number,
): ValidationResult {
  const roots = rootCertsPem.map(pem => new X509Certificate(pem));
  const seen = new Set<string>();
  let current = leaf;

  for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth += 1) {
    const expiry = certificateExpiry(current, now);
    if (expiry) return { ok: false, reasons: [expiry] };

    const root = roots.find(candidate =>
      candidate.fingerprint256 === current.fingerprint256 ||
      (current.checkIssued(candidate) && current.verify(candidate.publicKey)),
    );
    if (root) return { ok: true, reasons: [] };

    const parent = intermediates.find(candidate => current.checkIssued(candidate) && current.verify(candidate.publicKey));
    if (!parent || seen.has(parent.fingerprint256)) {
      return { ok: false, reasons: ["certificate chain does not reach a trusted root"] };
    }
    seen.add(parent.fingerprint256);
    current = parent;
  }

  return { ok: false, reasons: ["certificate chain is longer than expected"] };
}

function certificateExpiry(cert: X509Certificate, now: number): string | null {
  const from = Date.parse(cert.validFrom);
  const to = Date.parse(cert.validTo);
  const nowMs = now * 1000;
  if (Number.isFinite(from) && nowMs < from) return `certificate "${cert.subject}" is not valid yet`;
  if (Number.isFinite(to) && nowMs > to) return `certificate "${cert.subject}" has expired`;
  return null;
}

/**
 * Does this attestation belong to this call, under these terms, for this response,
 * and did an allowlisted image produce it? A document that failed verification
 * binds nothing, so the failure is carried through instead of being retried here.
 */
export function checkNitroBinding(
  result: NitroResult,
  subject: ClaimSubject,
  options: { allowedPcr0: string[] },
): ValidationResult {
  if (!result.ok) {
    return { ok: false, reasons: [`attestation is not verified: ${result.reasons.join("; ")}`] };
  }

  const reasons: string[] = [];
  const expected = subjectUserData(subject).toLowerCase();
  const actual = result.userData ? `0x${Buffer.from(result.userData).toString("hex")}` : "";
  if (actual !== expected) {
    reasons.push(`userData ${actual || "(missing)"} does not bind this call (expected ${expected})`);
  }

  const pcr0 = result.pcrs?.[0]?.toLowerCase();
  if (!pcr0) {
    reasons.push("PCR0 is missing, so the image cannot be checked");
  } else if (!options.allowedPcr0.map(value => value.toLowerCase()).includes(pcr0)) {
    reasons.push(`PCR0 ${pcr0} is not on the allowlist`);
  }

  return { ok: reasons.length === 0, reasons };
}

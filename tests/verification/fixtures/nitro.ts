import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrivateKey, sign } from "node:crypto";
import { encodeCbor, type CborValue } from "../../../src/lib/verification/cbor";
import { subjectUserData, type ClaimSubject } from "../../../src/lib/verification/schema";

/**
 * Builds a real-shaped Nitro attestation document with a local certificate chain.
 *
 * The point is that the verifier is exercised against actual COSE_Sign1 bytes and
 * an actual X.509 chain, with the trust root injected. It does not prove anything
 * about AWS; the production call passes the AWS Nitro root instead.
 */

export interface NitroFixture {
  doc: Uint8Array;
  rootPem: string;
  /** A root the document does NOT chain to. */
  unrelatedRootPem: string;
  subject: ClaimSubject;
  pcr0: string;
  moduleId: string;
  timestamp: number;
  /** Re-signs the document with a different payload, keeping the chain. */
  build(overrides: Partial<FixturePayload>): Uint8Array;
}

export interface FixturePayload {
  moduleId: string;
  timestamp: number;
  pcrs: Record<number, Uint8Array>;
  userData: Uint8Array;
  nonce?: Uint8Array;
  alg: number;
}

let cached: Omit<NitroFixture, "build"> & { chain: Chain } | null = null;

interface Chain {
  rootPem: string;
  unrelatedRootPem: string;
  leafPem: string;
  leafKeyPem: string;
  leafDer: Uint8Array;
  interDer: Uint8Array;
}

function openssl(args: string[]): void {
  execFileSync("openssl", args, { stdio: "pipe" });
}

function makeChain(dir: string, name: string, ca?: { cert: string; key: string }): { cert: string; key: string } {
  const key = join(dir, `${name}.key`);
  const csr = join(dir, `${name}.csr`);
  const cert = join(dir, `${name}.pem`);
  openssl(["ecparam", "-name", "secp384r1", "-genkey", "-noout", "-out", key]);
  openssl(["req", "-new", "-key", key, "-out", csr, "-subj", `/CN=${name}`]);
  if (!ca) {
    openssl(["req", "-new", "-x509", "-key", key, "-out", cert, "-days", "3650", "-sha384", "-subj", `/CN=${name}`]);
  } else {
    openssl([
      "x509", "-req", "-in", csr, "-CA", ca.cert, "-CAkey", ca.key, "-CAcreateserial",
      "-out", cert, "-days", "3650", "-sha384",
    ]);
  }
  return { cert, key };
}

function toDer(pemPath: string): Uint8Array {
  const der = execFileSync("openssl", ["x509", "-in", pemPath, "-outform", "der"], { stdio: "pipe" });
  return new Uint8Array(der);
}

function buildChain(): Chain {
  const dir = mkdtempSync(join(tmpdir(), "nitro-fixture-"));
  const root = makeChain(dir, "test-root");
  const unrelated = makeChain(dir, "unrelated-root");
  const intermediate = makeChain(dir, "test-intermediate", root);
  const leaf = makeChain(dir, "test-leaf", intermediate);

  return {
    rootPem: readFileSync(root.cert, "utf8"),
    unrelatedRootPem: readFileSync(unrelated.cert, "utf8"),
    leafPem: readFileSync(leaf.cert, "utf8"),
    leafKeyPem: readFileSync(leaf.key, "utf8"),
    leafDer: toDer(leaf.cert),
    interDer: toDer(intermediate.cert),
  };
}

function assemble(chain: Chain, payload: FixturePayload): Uint8Array {
  const protectedHeader = encodeCbor(new Map<CborValue, CborValue>([[1, payload.alg]]));

  const payloadMap = new Map<CborValue, CborValue>([
    ["module_id", payload.moduleId],
    ["timestamp", payload.timestamp],
    ["digest", "SHA384"],
    ["pcrs", new Map<CborValue, CborValue>(Object.entries(payload.pcrs).map(([k, v]) => [Number(k), v]))],
    ["certificate", chain.leafDer],
    ["cabundle", [chain.interDer]],
    ["user_data", payload.userData],
  ]);
  if (payload.nonce) payloadMap.set("nonce", payload.nonce);

  const payloadBytes = encodeCbor(payloadMap);
  const sigStructure = encodeCbor(["Signature1", protectedHeader, new Uint8Array(0), payloadBytes]);
  const signature = new Uint8Array(
    sign("sha384", sigStructure, { key: createPrivateKey(chain.leafKeyPem), dsaEncoding: "ieee-p1363" }),
  );

  return encodeCbor([protectedHeader, new Map<CborValue, CborValue>(), payloadBytes, signature]);
}

export function nitroFixture(): NitroFixture {
  if (!cached) {
    const chain = buildChain();
    const subject: ClaimSubject = {
      callId: `0x${"a1".repeat(32)}`,
      providerId: 1,
      termsHash: `0x${"b2".repeat(32)}`,
      responseHash: `0x${"c3".repeat(32)}`,
    };
    const payload: FixturePayload = {
      moduleId: "i-test-enclave-0001",
      timestamp: 1_800_000_000,
      pcrs: {
        0: Uint8Array.from({ length: 48 }, (_, i) => i),
        1: Uint8Array.from({ length: 48 }, () => 1),
        2: Uint8Array.from({ length: 48 }, () => 2),
      },
      userData: Uint8Array.from(subjectUserData(subject).slice(2).match(/../g)!.map(b => parseInt(b, 16))),
      alg: -35,
    };
    const pcr0 = Buffer.from(payload.pcrs[0]).toString("hex");
    cached = {
      doc: assemble(chain, payload),
      rootPem: chain.rootPem,
      unrelatedRootPem: chain.unrelatedRootPem,
      subject,
      pcr0: `0x${pcr0}`,
      moduleId: payload.moduleId,
      timestamp: payload.timestamp,
      chain,
    };
  }

  const { chain, ...rest } = cached;
  return {
    ...rest,
    build: overrides => assemble(chain, {
      moduleId: rest.moduleId,
      timestamp: rest.timestamp,
      pcrs: { 0: Uint8Array.from({ length: 48 }, (_, i) => i) },
      userData: Uint8Array.from(subjectUserData(rest.subject).slice(2).match(/../g)!.map(b => parseInt(b, 16))),
      alg: -35,
      ...overrides,
    }),
  };
}

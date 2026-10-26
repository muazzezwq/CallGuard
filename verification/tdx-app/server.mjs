import http from "node:http";
import { DstackClient } from "@phala/dstack-sdk";
import { keccak_256 } from "@noble/hashes/sha3";

/**
 * Answer endpoint that runs inside a Phala Cloud CVM (Intel TDX).
 *
 * The point of this process is not the answer. It is that the answer comes back
 * with a TDX quote whose `report_data` is bound to the call and to a nonce the
 * caller chose, so a verifier outside the TEE can check three things without
 * trusting the operator: the hardware is genuine, the running compose file is the
 * one they reviewed, and this body was produced for this call.
 *
 * `report_data` layout (64 bytes): keccak256(callId ‖ termsHash ‖ responseHash)
 * followed by the caller's 32-byte nonce. The first half is the same binding the
 * Nitro path puts in `userData`; the second half is the only freshness a TDX quote
 * can carry, because a quote has no timestamp.
 */

const PORT = Number(process.env.PORT ?? 8080);
const client = new DstackClient();

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function hexToBytes(value) {
  return Buffer.from(value.replace(/^0x/, ""), "hex");
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

/** Packed encoding, matching `viem`'s `encodePacked(["bytes32","bytes32","bytes32"])`. */
function subjectUserData(callId, termsHash, responseHash) {
  const packed = Buffer.concat([hexToBytes(callId), hexToBytes(termsHash), hexToBytes(responseHash)]);
  return Buffer.from(keccak_256(packed));
}

function answerFor(callId, termsHash) {
  return JSON.stringify({
    answer: "pong",
    callId: callId.toLowerCase(),
    termsHash: termsHash.toLowerCase(),
    servedBy: "callguard-tdx/1",
  });
}

function parseEvents(eventLog) {
  if (Array.isArray(eventLog)) return eventLog;
  if (typeof eventLog !== "string") return [];
  try {
    const parsed = JSON.parse(eventLog);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": "*",
  });
  res.end(body);
}

async function handleAnswer(url, res) {
  const callId = url.searchParams.get("callId") ?? "";
  const termsHash = url.searchParams.get("termsHash") ?? "";
  const nonce = (url.searchParams.get("nonce") ?? "").replace(/^0x/, "");

  if (!HASH_RE.test(callId)) return json(res, 400, { error: "callId must be a 32-byte hash" });
  if (!HASH_RE.test(termsHash)) return json(res, 400, { error: "termsHash must be a 32-byte hash" });
  if (!/^[0-9a-fA-F]{64}$/.test(nonce)) return json(res, 400, { error: "nonce must be 32 bytes of hex" });

  const body = answerFor(callId, termsHash);
  const responseHash = Buffer.from(keccak_256(Buffer.from(body, "utf8")));
  const binding = subjectUserData(callId, termsHash, `0x${bytesToHex(responseHash)}`);
  const reportData = Buffer.concat([binding, Buffer.from(nonce, "hex")]);

  let quote;
  try {
    quote = await client.getQuote(new Uint8Array(reportData));
  } catch (error) {
    return json(res, 502, { error: `dstack quote failed: ${error.message}` });
  }

  json(res, 200, {
    body,
    bodyEncoding: "utf8",
    callId: callId.toLowerCase(),
    termsHash: termsHash.toLowerCase(),
    responseHash: `0x${bytesToHex(responseHash)}`,
    nonce: `0x${nonce.toLowerCase()}`,
    reportData: `0x${bytesToHex(reportData)}`,
    quote: quote.quote,
    event_log: parseEvents(quote.event_log),
    vm_config: quote.vm_config ?? null,
  });
}

async function handleAttestation(res) {
  try {
    const quote = await client.getQuote(new Uint8Array(64));
    json(res, 200, {
      quote: quote.quote,
      event_log: parseEvents(quote.event_log),
      vm_config: quote.vm_config ?? null,
    });
  } catch (error) {
    json(res, 502, { error: `dstack quote failed: ${error.message}` });
  }
}

async function handleInfo(res) {
  try {
    const info = await client.info();
    json(res, 200, info);
  } catch (error) {
    json(res, 502, { error: `dstack info failed: ${error.message}` });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    return res.end();
  }
  if (req.method !== "GET") return json(res, 405, { error: "GET only" });

  try {
    if (url.pathname === "/answer") return await handleAnswer(url, res);
    if (url.pathname === "/attestation") return await handleAttestation(res);
    if (url.pathname === "/info") return await handleInfo(res);
    if (url.pathname === "/healthz") return json(res, 200, { ok: true });
    return json(res, 404, { error: `no route ${url.pathname}` });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`callguard-tdx app listening on ${PORT}`);
});

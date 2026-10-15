// api/ping-provider.js — serverless endpoint to ping a provider's webhook/API URL
// GET /api/ping-provider?url=https://...
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function ipToLong(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0;
}

function isPrivateIp(ip) {
  const v = isIP(ip);
  if (v === 4) {
    const n = ipToLong(ip);
    if (n === null) return true;
    const inRange = (base, bits) => (n >>> (32 - bits)) === (ipToLong(base) >>> (32 - bits));
    return (
      inRange("0.0.0.0", 8) ||        // "this" network
      inRange("10.0.0.0", 8) ||       // private
      inRange("100.64.0.0", 10) ||    // CGNAT
      inRange("127.0.0.0", 8) ||      // loopback
      inRange("169.254.0.0", 16) ||   // link-local / cloud metadata
      inRange("172.16.0.0", 12) ||    // private
      inRange("192.0.0.0", 24) ||     // IETF protocol assignments
      inRange("192.168.0.0", 16) ||   // private
      inRange("198.18.0.0", 15) ||    // benchmarking
      inRange("224.0.0.0", 4) ||      // multicast
      inRange("240.0.0.0", 4)         // reserved
    );
  }
  if (v === 6) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::") return true;
    if (low.startsWith("fe80") || low.startsWith("fc") || low.startsWith("fd")) return true;
    if (low.startsWith("::ffff:")) {
      const mapped = low.slice(7);
      if (isIP(mapped) === 4) return isPrivateIp(mapped);
    }
    return false;
  }
  return true; // not a parseable IP → treat as unsafe
}

// Resolve the hostname and reject any private/loopback/link-local/metadata
// address. Also rejects decimal/hex/octal IP obfuscations and blocks DNS
// rebinding by validating every returned address.
async function isPublicHost(hostnameRaw) {
  let hostname = (hostnameRaw || "").toLowerCase();
  if (hostname.endsWith(".")) hostname = hostname.slice(0, -1);
  if (hostname.startsWith("[") && hostname.endsWith("]")) hostname = hostname.slice(1, -1);
  if (!hostname) return false;
  if (isIP(hostname)) return !isPrivateIp(hostname);
  if (/^\d+$/.test(hostname) || /^0x[0-9a-f.]+$/i.test(hostname) || /^(0\d+\.)+\d+$/.test(hostname)) {
    return false; // obfuscated IP literals
  }
  try {
    const addrs = await lookup(hostname, { all: true });
    if (!addrs.length) return false;
    return addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { url } = req.query;
  if (!url) return res.status(400).json({ ok: false, error: "url required" });

  let targetUrl;
  try {
    targetUrl = new URL(url);
  } catch {
    return res.status(400).json({ ok: false, error: "invalid url" });
  }

  // SSRF guard: only http/https, and only hosts that resolve to public IPs.
  // Redirects are NOT followed (redirect: manual) to stop DNS-rebinding /
  // redirect-to-internal attacks.
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return res.status(400).json({ ok: false, error: "only http/https allowed" });
  }
  if (!(await isPublicHost(targetUrl.hostname))) {
    return res.status(400).json({ ok: false, error: "private addresses not allowed" });
  }

  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(targetUrl.toString(), {
      method: "HEAD",
      signal: ctrl.signal,
      redirect: "manual", // never follow redirects (rebinding protection)
    }).catch(() =>
      fetch(targetUrl.toString(), { method: "GET", signal: ctrl.signal, redirect: "manual" })
    );
    clearTimeout(timer);
    const latency = Date.now() - start;
    return res.json({
      ok: resp.ok || resp.status < 500,
      status: resp.status,
      latency,
      timestamp: Date.now(),
    });
  } catch (e) {
    const latency = Date.now() - start;
    return res.json({
      ok: false,
      error: e.name === "AbortError" ? "timeout" : e.message,
      latency,
      timestamp: Date.now(),
    });
  }
}

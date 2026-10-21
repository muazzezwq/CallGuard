// api/ping-provider.js — serverless endpoint to ping a provider's webhook/API URL
// GET /api/ping-provider?url=https://...
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { errorSummary } from "./_redact.js";

function ipToLong(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0;
}

// Expand an IPv6 literal to eight 16-bit groups so embedded IPv4 addresses
// cannot hide behind a compressed or expanded representation.
function ipv6Groups(ip) {
  const clean = ip.split("%")[0].toLowerCase();
  const halves = clean.split("::");
  if (halves.length > 2) return null;

  const parseHalf = (part) => {
    if (!part) return [];
    const groups = part.split(":");
    const last = groups[groups.length - 1];
    if (last && last.includes(".")) {
      const octets = last.split(".").map(Number);
      if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        return null;
      }
      groups.splice(
        groups.length - 1,
        1,
        ((octets[0] << 8) | octets[1]).toString(16),
        ((octets[2] << 8) | octets[3]).toString(16),
      );
    }
    return groups;
  };

  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] || "");
  if (!left || !right) return null;

  const fill = 8 - left.length - right.length;
  if (fill < 0) return null;

  const groups = [...left, ...Array(fill).fill("0"), ...right].map((group) => {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return NaN;
    return parseInt(group, 16);
  });
  if (groups.length !== 8 || groups.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) {
    return null;
  }
  return groups;
}

function embeddedIpv4(groups, highIndex) {
  const high = groups[highIndex];
  const low = groups[highIndex + 1];
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
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
    const groups = ipv6Groups(ip.toLowerCase());
    if (!groups) return true;

    // IPv4-compatible ::/96, which includes :: and ::1.
    if (groups.slice(0, 6).every((g) => g === 0)) {
      return isPrivateIp(embeddedIpv4(groups, 6));
    }

    // IPv4-mapped ::ffff:0:0/96, including the expanded form and hex groups.
    if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
      return isPrivateIp(embeddedIpv4(groups, 6));
    }

    // NAT64 well-known prefix 64:ff9b::/96.
    if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
      return isPrivateIp(embeddedIpv4(groups, 6));
    }

    // 6to4 2002::/16 embeds an IPv4 address in the next two groups.
    if (groups[0] === 0x2002) {
      return isPrivateIp(embeddedIpv4(groups, 1));
    }

    if (groups.every((g) => g === 0)) return true; // ::
    if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
    if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((groups[0] & 0xff00) === 0xff00) return true; // ff00::/8
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
    console.warn("[ping-provider] request failed:", errorSummary(e));
    return res.json({
      ok: false,
      error: e.name === "AbortError" ? "timeout" : "request failed",
      latency,
      timestamp: Date.now(),
    });
  }
}

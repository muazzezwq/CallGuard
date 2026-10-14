// api/ping-provider.js — serverless endpoint to ping a provider's webhook/API URL
// GET /api/ping-provider?url=https://...
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

  // Block internal IPs for security (including IPv6 localhost).
  // Also block: cloud metadata (169.254.169.254), decimal/hex/octal IP
  // spellings (2130706433, 0x7f.0.0.1), and trailing-dot bypass (127.0.0.1.).
  // Redirects are NOT followed (redirect: manual) to stop DNS-rebinding /
  // redirect-to-internal attacks.
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return res.status(400).json({ ok: false, error: "only http/https allowed" });
  }
  const rawHost = targetUrl.hostname.toLowerCase();
  const hostname = rawHost.endsWith(".") ? rawHost.slice(0, -1) : rawHost;
  const isDecimalIp = /^\d+$/.test(hostname);
  const looksLikeIp = isDecimalIp
    || /^0x[0-9a-f.]+$/i.test(hostname)
    || /^[0-9a-f:]+$/i.test(hostname) && hostname.includes(":")
    || /^(0\d+\.)+\d+$/.test(hostname)
    || /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "2130706433" || // 127.0.0.1 as decimal
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.startsWith("169.254.") || // cloud metadata
    hostname === "169.254.169.254" ||
    isDecimalIp || // any all-digit host = obfuscated IP
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.16.") ||
    hostname.startsWith("172.17.") ||
    hostname.startsWith("172.18.") ||
    hostname.startsWith("172.19.") ||
    hostname.startsWith("172.20.") ||
    hostname.startsWith("172.21.") ||
    hostname.startsWith("172.22.") ||
    hostname.startsWith("172.23.") ||
    hostname.startsWith("172.24.") ||
    hostname.startsWith("172.25.") ||
    hostname.startsWith("172.26.") ||
    hostname.startsWith("172.27.") ||
    hostname.startsWith("172.28.") ||
    hostname.startsWith("172.29.") ||
    hostname.startsWith("172.30.") ||
    hostname.startsWith("172.31.") ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80") ||
    hostname === "0.0.0.0"
  ) {
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

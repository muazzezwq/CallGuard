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

  // Block internal IPs for security (including IPv6 localhost)
  const hostname = targetUrl.hostname;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
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
    }).catch(() =>
      fetch(targetUrl.toString(), { method: "GET", signal: ctrl.signal })
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

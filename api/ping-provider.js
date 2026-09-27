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

  // Block internal IPs for security
  const hostname = targetUrl.hostname;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.")
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

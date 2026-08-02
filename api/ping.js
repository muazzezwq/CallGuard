export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = req.query.url;
  if (!url) return res.status(400).json({ ok: false, error: "url required" });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const start = Date.now();
    const r = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timeout);
    res.json({ ok: r.ok || r.status < 500, status: r.status, ms: Date.now() - start });
  } catch (e) {
    res.json({ ok: false, error: e.message, ms: null });
  }
}

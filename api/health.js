module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ ok: true, facilitator: "Vercel Functions", version: "1.0.0", ts: Date.now() });
}

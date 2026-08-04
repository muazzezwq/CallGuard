module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ ok: true, facilitator: "Vercel Functions", version: "1.0.0" });
}

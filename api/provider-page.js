// /api/provider-page.js — SSR provider profile + sitemap for SEO
const SG_URL = 'https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/3.0.0/gn';

async function handleSitemap(req, res) {
  const base = 'https://arcsla.vercel.app';
  let providerIds = [];
  try {
    const r = await fetch(SG_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({query:'{ providers(first:50,where:{active:true}){id} }'}) });
    const d = await r.json();
    providerIds = (d?.data?.providers||[]).map(p=>p.id);
  } catch(e) { providerIds = ['1','2','3','4','5','6','7','8']; }
  const today = new Date().toISOString().split('T')[0];
  const urls = [
    `<url><loc>${base}/app/</loc><changefreq>daily</changefreq><priority>1.0</priority><lastmod>${today}</lastmod></url>`,
    ...providerIds.map(id=>`<url><loc>${base}/providers/${id}</loc><changefreq>hourly</changefreq><priority>0.8</priority><lastmod>${today}</lastmod></url>`)
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
  res.setHeader('Content-Type','application/xml;charset=utf-8');
  res.setHeader('Cache-Control','s-maxage=3600,stale-while-revalidate=7200');
  return res.status(200).send(xml);
}

export default async function handler(req, res) {
  if (req.url?.includes('sitemap') || req.query?.sitemap) return handleSitemap(req, res);
  const id = (req.query.id || '1').toString().replace(/\D/g, '') || '1';

  // RPC: prefer provisioned proxy, fall back to env var
  const proxyBase = process.env.RPC_PROXY_BASE_URL;
  const proxyToken = process.env.RPC_PROXY_TOKEN;
  const proxyChains = (process.env.RPC_PROXY_CHAINS || '').split(',');
  const rpcUrl = proxyBase && proxyChains.includes('Arc_Testnet')
    ? `${proxyBase}/api/rpc/Arc_Testnet?_rpc_token=${proxyToken}`
    : process.env.ARC_RPC_URL;

  const registryAddr = process.env.VITE_SERVICE_REGISTRY;
  const sgUrl = 'https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/3.0.0/gn';

  if (!rpcUrl) {
    res.status(503).json({ error: 'ARC_RPC_URL not configured' });
    return;
  }
  if (!registryAddr) {
    res.status(503).json({ error: 'VITE_SERVICE_REGISTRY not configured' });
    return;
  }

  async function rpcCall(method, params) {
    const r = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
    });
    return (await r.json()).result;
  }

  function encodeGetProvider(id) {
    const hex = Number(id).toString(16).padStart(64, '0');
    return '0x9a86139b' + hex;
  }

  function encodeGetScore(id) {
    const hex = Number(id).toString(16).padStart(64, '0');
    return '0x5a3b7e42' + hex;
  }

  let provider = { stake: '0', price: '1.00', active: true, score: 50 };

  try {
    const [raw, scoreRaw] = await Promise.all([
      rpcCall('eth_call', [{ to: registryAddr, data: encodeGetProvider(id) }, 'latest']),
      rpcCall('eth_call', [{ to: registryAddr, data: encodeGetScore(id) }, 'latest'])
    ]);
    if (raw && raw !== '0x') {
      const stake = BigInt('0x' + raw.slice(66, 130));
      const price = BigInt('0x' + raw.slice(130, 194));
      const active = raw.slice(194, 258) !== '0'.repeat(64);
      provider.stake = (Number(stake) / 1e6).toFixed(2);
      provider.price = (Number(price) / 1e6).toFixed(2);
      provider.active = active;
    }
    if (scoreRaw && scoreRaw !== '0x') {
      provider.score = Number(BigInt(scoreRaw));
    }
  } catch (e) { /* fallback */ }

  let completedCalls = 0, slashedCalls = 0;
  try {
    const sg = await fetch(sgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ providers(where:{id:"${id}"}) { completedCalls slashedCalls } }` })
    });
    const sgData = await sg.json();
    const p = sgData?.data?.providers?.[0];
    if (p) { completedCalls = Number(p.completedCalls); slashedCalls = Number(p.slashedCalls); }
  } catch (e) { /* ignore */ }

  const total = completedCalls + slashedCalls;
  const honorRate = total > 0 ? Math.round(completedCalls / total * 100) : 50;
  const statusLabel = provider.active ? 'Active' : 'Inactive';
  const scoreColor = provider.score >= 70 ? '#10b981' : provider.score >= 40 ? '#f59e0b' : '#ef4444';
  const arcScanBase = process.env.VITE_ARCSCAN_URL || 'https://explorer.testnet.arc.io';
  const arcScanUrl = `${arcScanBase}/address/${registryAddr}`;
  const appUrl = `https://arcsla.vercel.app/app/?provider=${id}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Provider #${id} — CallGuard SLA Registry</title>
  <meta name="description" content="Provider #${id} on CallGuard: ${honorRate}% honor rate, ${provider.price} USDC/call, ${provider.stake} USDC stake. On-chain SLA enforcement on Arc Testnet.">
  <meta property="og:type" content="profile">
  <meta property="og:title" content="Provider #${id} — CallGuard">
  <meta property="og:description" content="${honorRate}% honor rate · ${provider.price} USDC/call · ${completedCalls} completed · ${slashedCalls} slashed">
  <meta property="og:url" content="https://arcsla.vercel.app/providers/${id}">
  <meta property="og:site_name" content="CallGuard">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Provider #${id} — CallGuard SLA">
  <meta name="twitter:description" content="${honorRate}% honor rate · ${provider.price} USDC/call on Arc Testnet">
  <link rel="canonical" href="https://arcsla.vercel.app/providers/${id}">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Service","name":"CallGuard Provider #${id}","description":"On-chain API service with SLA enforcement. ${honorRate}% honor rate, ${provider.price} USDC per call.","provider":{"@type":"Organization","name":"CallGuard","url":"https://arcsla.vercel.app"},"offers":{"@type":"Offer","price":"${provider.price}","priceCurrency":"USDC"},"serviceType":"API Service with SLA Guarantee"}
  </script>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#070b12;color:#e8edf5;min-height:100vh}
    .nav{background:rgba(10,16,26,.9);border-bottom:1px solid #1f2d42;padding:14px 24px;display:flex;align-items:center;gap:12px}
    .nav-brand{display:flex;align-items:center;gap:8px;font-weight:700;font-size:16px;color:#fff;text-decoration:none}
    .nav-logo{width:28px;height:28px;background:linear-gradient(135deg,#10b981,#0ea5e9);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px}
    .nav-sub{color:#8899b4;font-size:13px}
    .container{max-width:760px;margin:0 auto;padding:40px 24px}
    .badge-row{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
    .badge{padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase}
    .badge-green{background:rgba(16,185,129,.15);color:#10b981;border:1px solid rgba(16,185,129,.3)}
    .badge-red{background:rgba(239,68,68,.15);color:#ef4444;border:1px solid rgba(239,68,68,.3)}
    .badge-blue{background:rgba(14,165,233,.15);color:#0ea5e9;border:1px solid rgba(14,165,233,.3)}
    h1{font-size:32px;font-weight:800;letter-spacing:-.02em;margin-bottom:8px}
    .subtitle{color:#8899b4;font-size:15px;margin-bottom:32px}
    .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px}
    .stat-card{background:#0f1623;border:1px solid #1f2d42;border-radius:12px;padding:20px 16px}
    .stat-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#4a5f7a;margin-bottom:8px}
    .stat-value{font-size:28px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
    .stat-sub{font-size:12px;color:#8899b4;margin-top:4px}
    .section{background:#0f1623;border:1px solid #1f2d42;border-radius:12px;padding:24px;margin-bottom:16px}
    .section h2{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#4a5f7a;margin-bottom:16px}
    .info-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #131c2e}
    .info-row:last-child{border-bottom:none}
    .info-key{font-size:13px;color:#8899b4}
    .info-val{font-size:13px;font-weight:600;font-family:monospace}
    .cta-row{display:flex;gap:12px;margin-top:32px;flex-wrap:wrap}
    .btn-primary{background:linear-gradient(135deg,#10b981,#0ea5e9);color:#fff;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;display:inline-block}
    .btn-secondary{background:transparent;color:#e8edf5;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;text-decoration:none;border:1px solid #2d4060;display:inline-block}
    .footer{text-align:center;padding:40px 24px 24px;color:#4a5f7a;font-size:13px}
    @media(max-width:600px){.stats-grid{grid-template-columns:repeat(2,1fr)}h1{font-size:24px}}
  </style>
</head>
<body>
<nav class="nav">
  <a href="https://arcsla.vercel.app/app/" class="nav-brand">
    <div class="nav-logo">⚡</div>CallGuard
  </a>
  <span class="nav-sub">/ Provider #${id}</span>
</nav>
<div class="container">
  <div class="badge-row">
    <span class="badge ${provider.active ? 'badge-green' : 'badge-red'}">${statusLabel}</span>
    <span class="badge badge-blue">Arc Testnet</span>
    <span class="badge badge-green">SLA Enforced</span>
  </div>
  <h1>Provider #${id}</h1>
  <p class="subtitle">On-chain API service with automatic SLA enforcement on Arc Network</p>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Honor Rate</div>
      <div class="stat-value" style="color:${scoreColor}">${honorRate}%</div>
      <div class="stat-sub">${completedCalls} honored</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Price / Call</div>
      <div class="stat-value" style="color:#10b981">${provider.price}</div>
      <div class="stat-sub">USDC</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Stake</div>
      <div class="stat-value">${provider.stake}</div>
      <div class="stat-sub">USDC locked</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Reputation</div>
      <div class="stat-value" style="color:${scoreColor}">${provider.score}</div>
      <div class="stat-sub">/ 100 Bayesian</div>
    </div>
  </div>
  <div class="section">
    <h2>Call Stats</h2>
    <div class="info-row"><span class="info-key">Total calls</span><span class="info-val">${total}</span></div>
    <div class="info-row"><span class="info-key">Completed</span><span class="info-val" style="color:#10b981">${completedCalls}</span></div>
    <div class="info-row"><span class="info-key">Slashed</span><span class="info-val" style="color:#ef4444">${slashedCalls}</span></div>
    <div class="info-row"><span class="info-key">Honor rate</span><span class="info-val">${honorRate}%</span></div>
  </div>
  <div class="section">
    <h2>On-chain Info</h2>
    <div class="info-row"><span class="info-key">Network</span><span class="info-val">Arc Testnet (5042002)</span></div>
    <div class="info-row"><span class="info-key">Payment token</span><span class="info-val">USDC (native gas)</span></div>
    <div class="info-row"><span class="info-key">SLA enforcement</span><span class="info-val">Automatic slash on timeout</span></div>
  </div>
  <div class="cta-row">
    <a href="${appUrl}" class="btn-primary">Call this provider →</a>
    <a href="${arcScanUrl}" class="btn-secondary" target="_blank" rel="noopener">View on ArcScan</a>
    <a href="https://arcsla.vercel.app/app/" class="btn-secondary">Browse all providers</a>
  </div>
</div>
<footer class="footer">
  <p>CallGuard · Built on Arc Testnet · <a href="https://github.com/muazzezwq/CallGuard" style="color:#10b981">GitHub</a></p>
</footer>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  res.status(200).send(html);
}

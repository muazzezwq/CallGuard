// /api/provider-page.js — SSR provider profile + sitemap for SEO
import { ACTIVE, V8_ACTIVE } from './_contracts.js';
import { getRpcUrl } from './_rpc.js';

// getProvider(uint256) keeps the same selector on the v7 and v8 registries.
const SELECTOR_GET_PROVIDER = '0x5c42d079';
// nextProviderId() exists on v8 only.
const SELECTOR_NEXT_PROVIDER_ID = '0x51a8dbcf';
const SITEMAP_LIMIT = 50;
const ZERO_WORD = '0'.repeat(64);

function encodeUintArg(value) {
  return Number(value).toString(16).padStart(64, '0');
}

async function rpcCall(rpcUrl, method, params) {
  const r = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  if (!r.ok) throw new Error(`rpc http ${r.status}`);
  return (await r.json()).result;
}

function wordAt(raw, index) {
  return raw.slice(2 + index * 64, 2 + (index + 1) * 64);
}

function isActiveWord(raw) {
  // v8 ProviderView puts active at 5, v7 at 6; both are a single bool word.
  return wordAt(raw, V8_ACTIVE ? 5 : 6) !== ZERO_WORD;
}

// The sitemap used to be built from the retired Goldsky v7 subgraph, so it
// listed the wrong marketplace. v8 exposes nextProviderId(), so the list comes
// straight from the registry that enforces the SLA, with no indexer dependency.
async function listActiveProviderIds(rpcUrl, limit) {
  async function readActive(id) {
    const raw = await rpcCall(rpcUrl, 'eth_call', [
      { to: ACTIVE.SERVICE_REGISTRY, data: SELECTOR_GET_PROVIDER + encodeUintArg(id) },
      'latest'
    ]);
    return raw && raw !== '0x' ? isActiveWord(raw) : false;
  }

  const ids = [];
  if (V8_ACTIVE) {
    const raw = await rpcCall(rpcUrl, 'eth_call', [
      { to: ACTIVE.SERVICE_REGISTRY, data: SELECTOR_NEXT_PROVIDER_ID },
      'latest'
    ]);
    const next = Number(BigInt(raw));
    // Chunked so a long registry does not serialize into one huge round trip.
    for (let start = 1; start < next; start += 10) {
      const chunk = [];
      for (let id = start; id < Math.min(start + 10, next); id += 1) chunk.push(id);
      const flags = await Promise.all(chunk.map((id) => readActive(id).catch(() => false)));
      chunk.forEach((id, i) => { if (flags[i]) ids.push(String(id)); });
      if (ids.length >= limit) break;
    }
    return ids.slice(0, limit);
  }
  // v7 has no enumerator: ids are dense from 1, so probe up to the limit.
  for (let id = 1; id <= limit; id += 1) {
    try {
      if (await readActive(id)) ids.push(String(id));
    } catch { /* keep probing */ }
  }
  return ids;
}

async function handleSitemap(req, res, rpcUrl) {
  const base = 'https://arcsla.vercel.app';
  let providerIds = [];
  if (rpcUrl) {
    try {
      providerIds = await listActiveProviderIds(rpcUrl, SITEMAP_LIMIT);
    } catch (e) {
      providerIds = [];
    }
  }
  const today = new Date().toISOString().split('T')[0];
  const urls = [
    `<url><loc>${base}/</loc><changefreq>daily</changefreq><priority>1.0</priority><lastmod>${today}</lastmod></url>`,
    ...providerIds.map(id=>`<url><loc>${base}/providers/${id}</loc><changefreq>hourly</changefreq><priority>0.8</priority><lastmod>${today}</lastmod></url>`)
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
  res.setHeader('Content-Type','application/xml;charset=utf-8');
  res.setHeader('Cache-Control','s-maxage=3600,stale-while-revalidate=7200');
  return res.status(200).send(xml);
}

export default async function handler(req, res) {
  // One resolver for every documented public RPC alias and the optional proxy.
  const rpcUrl = getRpcUrl();
  if (req.url?.includes('sitemap') || req.query?.sitemap) return handleSitemap(req, res, rpcUrl);
  const id = (req.query.id || '1').toString().replace(/\D/g, '') || '1';

  const registryAddr = ACTIVE.SERVICE_REGISTRY;

  if (!rpcUrl) {
    res.status(503).json({ error: 'RPC URL not configured' });
    return;
  }
  if (!registryAddr) {
    res.status(503).json({ error: 'SERVICE_REGISTRY not configured' });
    return;
  }

  let provider = { stake: '0', price: '1.00', active: true, termsVersion: 0 };
  let completedCalls = 0, slashedCalls = 0;

  try {
    const raw = await rpcCall(rpcUrl, 'eth_call', [
      { to: registryAddr, data: SELECTOR_GET_PROVIDER + encodeUintArg(id) },
      'latest'
    ]);
    if (raw && raw !== '0x') {
      const stake = BigInt('0x' + wordAt(raw, 2));
      const price = BigInt('0x' + wordAt(raw, 3));
      provider.stake = (Number(stake) / 1e6).toFixed(2);
      provider.price = (Number(price) / 1e6).toFixed(2);
      provider.active = isActiveWord(raw);
      if (V8_ACTIVE) {
        // v8 ProviderView: 0 owner, 1 signer, 2 stake, 3 pricePerCall,
        // 4 latestTermsVersion, 5 active, 6 pendingCalls, 7 completedCalls,
        // 8 slashedCalls, 9 maxConcurrentCalls, 10 zkTier. Counters live on the
        // registry now, so the page no longer depends on an indexer.
        provider.termsVersion = Number(BigInt('0x' + wordAt(raw, 4)));
        completedCalls = Number(BigInt('0x' + wordAt(raw, 7)));
        slashedCalls = Number(BigInt('0x' + wordAt(raw, 8)));
      }
    }
  } catch (e) { /* fallback */ }

  const total = completedCalls + slashedCalls;
  const honorRate = total > 0 ? Math.round(completedCalls / total * 100) : 50;
  const statusLabel = provider.active ? 'Active' : 'Inactive';
  const scoreColor = honorRate >= 70 ? '#10b981' : honorRate >= 40 ? '#f59e0b' : '#ef4444';
  const arcScanBase = process.env.VITE_ARCSCAN_URL || 'https://explorer.testnet.arc.io';
  const arcScanUrl = `${arcScanBase}/address/${registryAddr}`;
  const appUrl = `https://arcsla.vercel.app/?provider=${id}`;

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
  <a href="https://arcsla.vercel.app/" class="nav-brand">
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
      <div class="stat-label">Terms</div>
      <div class="stat-value">${provider.termsVersion > 0 ? `v${provider.termsVersion}` : "—"}</div>
      <div class="stat-sub">versioned SLA</div>
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
    <a href="https://arcsla.vercel.app/" class="btn-secondary">Browse all providers</a>
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

import { readFileSync, writeFileSync } from "fs";

const f = "demo/app/index.html";
let s = readFileSync(f, "utf8");

console.log("🚀 TÜM ÖZELLİKLER EKLENİYOR...\n");

// ============================================
// 1. SIDEBAR MENÜLERİ
// ============================================
if (!s.includes('data-nav="nano"')) {
  s = s.replace(
    /(<div class="sb-item" data-nav="x402">⚡ x402<\/div>)/,
    `$1\n          <div class="sb-item" data-nav="nano"> Nanopayment</div>`
  );
  console.log("✅ Sidebar: Nanopayment eklendi");
}

if (!s.includes('data-nav="premium"')) {
  s = s.replace(
    /(<div class="sb-item" data-nav="nano">💰 Nanopayment<\/div>)/,
    `$1\n          <div class="sb-item" data-nav="premium">📊 Premium API</div>`
  );
  console.log("✅ Sidebar: Premium API eklendi");
}

// ============================================
// 2. NANOPAYMENT PANELİ (ZENGİN İÇERİK)
// ============================================
if (!s.includes('id="nanoPanel"')) {
  const nanoPanel = `
        <section class="panel full-width" id="nanoPanel" data-category="nano">
          <div class="panel-head">
            <h2>💰 Nanopayment — Circle Gateway</h2>
            <span class="mono" style="font-size:11px;color:var(--text-faint)">0.001 USDC per API call · gasless</span>
          </div>
          <div class="panel-body">
            <div style="background:linear-gradient(135deg,#1a2e1a 0%,#0f1e2e 100%);border:1px solid rgba(34,197,94,0.4);border-radius:12px;padding:20px;margin-bottom:20px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
                <span style="font-size:22px">💡</span>
                <div style="font-size:16px;font-weight:700;color:#4ade80">What is Nanopayment?</div>
              </div>
              <div style="font-size:14px;color:#e2e8f0;line-height:1.7;margin-bottom:18px">
                Pay for individual API calls with <strong style="color:#ffffff">micro-amounts of USDC</strong> — no subscription, no credit card, no registration required. Just connect your wallet and pay per use.
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:18px">
                <div style="background:rgba(255,255,255,0.06);padding:14px;border-radius:10px;border-left:3px solid #4ade80">                  <div style="color:#4ade80;font-weight:700;margin-bottom:6px;font-size:14px"> Perfect For</div>
                  <div style="color:#e2e8f0;font-size:13px;line-height:1.6">· One-time API usage<br>· AI agents & automation<br>· Testing services<br>· Pay-as-you-go model</div>
                </div>
                <div style="background:rgba(255,255,255,0.06);padding:14px;border-radius:10px;border-left:3px solid #fbbf24">
                  <div style="color:#fbbf24;font-weight:700;margin-bottom:6px;font-size:14px">💰 Cost</div>
                  <div style="color:#e2e8f0;font-size:13px;line-height:1.6"><strong style="color:#ffffff">0.001 USDC</strong> per call<br><span style="color:#94a3b8">(~$0.001 USD)</span><br>No hidden fees</div>
                </div>
                <div style="background:rgba(255,255,255,0.06);padding:14px;border-radius:10px;border-left:3px solid #60a5fa">
                  <div style="color:#60a5fa;font-weight:700;margin-bottom:6px;font-size:14px"> Speed</div>
                  <div style="color:#e2e8f0;font-size:13px;line-height:1.6">2-3 seconds<br>Gasless for you<br>Instant confirmation</div>
                </div>
                <div style="background:rgba(255,255,255,0.06);padding:14px;border-radius:10px;border-left:3px solid #c084fc">
                  <div style="color:#c084fc;font-weight:700;margin-bottom:6px;font-size:14px">🔒 Security</div>
                  <div style="color:#e2e8f0;font-size:13px;line-height:1.6">EIP-712 signatures<br>On-chain settlement<br>Circle Gateway batching</div>
                </div>
              </div>
              <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(34,197,94,0.3);border-radius:10px;padding:14px">
                <div style="font-size:14px;color:#ffffff;margin-bottom:10px;font-weight:600">💸 Traditional vs Nanopayment:</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:13px">
                  <div>
                    <div style="color:#f87171;font-weight:700;margin-bottom:6px"> Traditional API</div>
                    <div style="color:#cbd5e1;line-height:1.6">· Monthly subscription ($20-500)<br>· Credit card required<br>· Pay for unused quota<br>· Long-term commitment</div>
                  </div>
                  <div>
                    <div style="color:#4ade80;font-weight:700;margin-bottom:6px">✅ Nanopayment</div>
                    <div style="color:#cbd5e1;line-height:1.6">· Pay per call (0.001 USDC)<br>· Crypto wallet only<br>· Pay only what you use<br>· No commitment</div>
                  </div>
                </div>
              </div>
            </div>
            <p style="font-size:13px;color:var(--text-dim);margin:0 0 16px">
              Test the nanopayment flow: 402 Payment Required → Sign → Pay → 200 OK. Powered by Circle Gateway batching on Arc Testnet.
            </p>
            <button class="btn btn-primary" id="btnNanoPay">⚡ Pay 0.001 USDC & Call /nano/service</button>
            <div id="nanoOutput" style="font-size:13px;color:var(--text-dim);min-height:40px;background:var(--bg-2);border-radius:6px;padding:10px 12px;font-family:var(--font-mono);margin-top:12px;white-space:pre-wrap">
              Payment results will appear here.
            </div>
          </div>
        </section>
`;
  s = s.replace(/(<section class="panel full-width" id="bridgePanel")/, nanoPanel + `\n        $1`);
  console.log("✅ Nano panel (zengin içerikli)");
}

// ============================================
// 3. PREMIUM API PANELİ (ZENGİN İÇERİK)
// ============================================
if (!s.includes('id="premiumPanel"')) {
  const premiumPanel = `
        <section class="panel full-width" id="premiumPanel" data-category="premium">          <div class="panel-head">
            <h2>📊 Premium Analytics API</h2>
            <span class="mono" style="font-size:11px;color:var(--text-faint)">0.001 USDC per report · real-time data</span>
          </div>
          <div class="panel-body">
            <div style="background:linear-gradient(135deg,#1e1a2e 0%,#0f1e2e 100%);border:1px solid rgba(168,85,247,0.4);border-radius:12px;padding:20px;margin-bottom:20px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
                <span style="font-size:22px">📈</span>
                <div style="font-size:16px;font-weight:700;color:#c084fc">What is Premium Analytics?</div>
              </div>
              <div style="font-size:14px;color:#e2e8f0;line-height:1.7;margin-bottom:18px">
                Get <strong style="color:#ffffff">real-time cryptocurrency market data</strong> powered by CoinGecko API. Each report includes live prices, market caps, 24h volumes, price changes, and Bitcoin all-time-high — delivered on-demand via nanopayment. No API keys, no subscriptions.
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:18px">
                <div style="background:rgba(255,255,255,0.06);padding:14px;border-radius:10px;border-left:3px solid #c084fc">
                  <div style="color:#c084fc;font-weight:700;margin-bottom:6px;font-size:14px">📡 Data Sources</div>
                  <div style="color:#e2e8f0;font-size:13px;line-height:1.6">· Bitcoin (BTC)<br>· Ethereum (ETH)<br>· Solana (SOL)<br>· USDC stablecoin</div>
                </div>
                <div style="background:rgba(255,255,255,0.06);padding:14px;border-radius:10px;border-left:3px solid #fbbf24">
                  <div style="color:#fbbf24;font-weight:700;margin-bottom:6px;font-size:14px"> Cost</div>
                  <div style="color:#e2e8f0;font-size:13px;line-height:1.6"><strong style="color:#ffffff">0.001 USDC</strong> per report<br><span style="color:#94a3b8">(~$0.001 USD)</span><br>No monthly fees</div>
                </div>
                <div style="background:rgba(255,255,255,0.06);padding:14px;border-radius:10px;border-left:3px solid #22d3ee">
                  <div style="color:#22d3ee;font-weight:700;margin-bottom:6px;font-size:14px">📊 Data Included</div>
                  <div style="color:#e2e8f0;font-size:13px;line-height:1.6">· Live prices<br>· Market cap & volume<br>· 24h price change<br>· Bitcoin ATH info</div>
                </div>
                <div style="background:rgba(255,255,255,0.06);padding:14px;border-radius:10px;border-left:3px solid #4ade80">
                  <div style="color:#4ade80;font-weight:700;margin-bottom:6px;font-size:14px">🎯 Use Cases</div>
                  <div style="color:#e2e8f0;font-size:13px;line-height:1.6">· Portfolio tracking<br>· AI trading bots<br>· Market research<br>· Price alerts</div>
                </div>
              </div>
              <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(168,85,247,0.3);border-radius:10px;padding:14px">
                <div style="font-size:14px;color:#ffffff;margin-bottom:10px;font-weight:600"> Sample Report Contents:</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;font-size:13px">
                  <div>
                    <div style="color:#c084fc;font-weight:700;margin-bottom:6px">🟠 Bitcoin (BTC)</div>
                    <div style="color:#cbd5e1;line-height:1.6">· Current price (USD)<br>· Market capitalization<br>· 24h trading volume<br>· 24h price change %<br>· All-time high + date</div>
                  </div>
                  <div>
                    <div style="color:#c084fc;font-weight:700;margin-bottom:6px"> Ethereum (ETH) · 🟣 Solana (SOL)</div>
                    <div style="color:#cbd5e1;line-height:1.6">· Current price (USD)<br>· Market capitalization<br>· 24h trading volume<br>· 24h price change %<br>· Data from CoinGecko API</div>
                  </div>
                </div>
              </div>
              <div style="background:rgba(0,0,0,0.3);border:1px solid rgba(34,211,238,0.3);border-radius:10px;padding:14px;margin-top:12px">
                <div style="font-size:14px;color:#ffffff;margin-bottom:10px;font-weight:600">⚡ How It Works:</div>
                <div style="font-size:13px;color:#cbd5e1;line-height:1.6">
                  <strong style="color:#22d3ee">1.</strong> Click "Get Premium Report"<br>
                  <strong style="color:#22d3ee">2.</strong> Sign 0.001 USDC authorization<br>
                  <strong style="color:#22d3ee">3.</strong> Backend fetches live CoinGecko data<br>                  <strong style="color:#22d3ee">4.</strong> Report + TX hash returned instantly
                </div>
              </div>
            </div>
            <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#fca5a5;display:flex;align-items:center;gap:10px">
              <span style="font-size:18px">️</span>
              <div><strong style="color:#fca5a5">Testnet only:</strong> This uses Arc Testnet USDC. No real value is transferred. Data comes from live CoinGecko API and reflects current market prices.</div>
            </div>
            <p style="font-size:13px;color:var(--text-dim);margin:0 0 16px">
              Request a premium analytics report. Each report costs 0.001 USDC via nanopayment. Data is generated on-demand and includes real-time crypto market data.
            </p>
            <div style="display:flex;gap:12px;margin-bottom:16px">
              <button class="btn btn-primary" id="btnGetReport">📊 Get Premium Report (0.001 USDC)</button>
              <button class="btn" id="btnGetReportMulti"> Get 3 Reports</button>
            </div>
            <div id="premiumOutput" style="font-size:13px;color:var(--text-dim);min-height:60px;background:var(--bg-2);border-radius:6px;padding:10px 12px;font-family:var(--font-mono);white-space:pre-wrap">
              Premium reports will appear here.
            </div>
          </div>
        </section>
`;
  s = s.replace(/(<section class="panel full-width" id="nanoPanel")/, premiumPanel + `\n        $1`);
  console.log("✅ Premium panel (zengin içerikli)");
}

// ============================================
// 4. CONFIG GÜNCELLEME
// ============================================
if (!s.includes('nanoFacilitatorUrl')) {
  s = s.replace(
    /facilitatorUrl: "https:\/\/arcsla-eu\.onrender\.com",/,
    `facilitatorUrl: "https://arcsla-eu.onrender.com",\n        nanoFacilitatorUrl: "https://arcsla-eu.onrender.com",`
  );
  console.log("✅ CONFIG: nanoFacilitatorUrl");
}

// ============================================
// 5. FONKSİYONLAR
// ============================================

// doNanoPayment
if (!s.includes('async function doNanoPayment')) {
  const nanoFunc = `
      async function doNanoPayment() {
        const btn = $("btnNanoPay");
        const out = $("nanoOutput");
        if (!state.address) return toast({ kind: "err", title: "Connect wallet first" });
        if (btn.disabled) return;
        btn.disabled = true;
        const origText = btn.textContent;        btn.textContent = "Processing…";
        out.textContent = "Step 1: GET /nano/service (expecting 402)…";

        try {
          const nanoUrl = CONFIG.nanoFacilitatorUrl || CONFIG.facilitatorUrl;
          const res1 = await fetch(nanoUrl + "/nano/service");
          if (res1.status !== 402) throw new Error("Expected 402, got " + res1.status);
          const data = await res1.json();
          const requirements = data.accepts[0];
          out.textContent = "Step 2: Got 402 · Signing…";

          const now = Math.floor(Date.now() / 1000);
          const authNonce = ethers.hexlify(ethers.randomBytes(32));
          const domain = { name: "USDC", version: "2", chainId: CONFIG.chainId, verifyingContract: CONFIG.usdc };
          const types = { TransferWithAuthorization: [
            { name: "from", type: "address" }, { name: "to", type: "address" },
            { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
          ]};
          const value = { from: state.address, to: requirements.payTo, value: requirements.maxAmountRequired,
            validAfter: 0, validBefore: now + 345600, nonce: authNonce };

          const rawSig = await state.signer.signTypedData(domain, types, value);
          const paymentPayload = { authorization: value, signature: rawSig };
          const paymentSigBase64 = btoa(JSON.stringify(paymentPayload));

          out.textContent = "Step 3: Sending payment…";
          const res2 = await fetch(nanoUrl + "/nano/service", { headers: { "payment-signature": paymentSigBase64 } });
          const resData = await res2.json();

          if (res2.status === 200) {
            out.innerHTML = '<span style="color:var(--accent)">✅ Success!</span>\\nTX: <a href="https://testnet.arcscan.app/tx/' + resData.tx + '" target="_blank" style="color:#22d3ee;text-decoration:underline">' + resData.tx + '</a>';
            toast({ kind: "ok", title: "💰 Nanopayment successful!", detail: "TX: " + short(resData.tx, 6), timeout: 5000 });
          } else {
            throw new Error(resData.error || "HTTP " + res2.status);
          }
        } catch (e) {
          out.innerHTML = '<span style="color:var(--danger)">❌ ' + e.message + '</span>';
          toast({ kind: "err", title: "Failed", detail: e.message, timeout: 5000 });
        } finally {
          btn.disabled = false;
          btn.textContent = origText;
        }
      }
`;
  s = s.replace(/(async function doX402Call\(\) \{)/, nanoFunc + `\n      $1`);
  console.log("✅ doNanoPayment()");
}

// doGetPremiumReportif (!s.includes('async function doGetPremiumReport')) {
  const premiumFunc = `
      async function doGetPremiumReport(count = 1) {
        const btn = count === 1 ? $("btnGetReport") : $("btnGetReportMulti");
        const out = $("premiumOutput");
        if (!state.address) return toast({ kind: "err", title: "Connect wallet first" });
        if (btn.disabled) return;
        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = "Processing…";

        const results = [];
        for (let i = 0; i < count; i++) {
          try {
            const nanoUrl = CONFIG.nanoFacilitatorUrl || CONFIG.facilitatorUrl;
            const res1 = await fetch(nanoUrl + "/api/premium/report");
            if (res1.status !== 402) throw new Error("Expected 402");
            const data = await res1.json();
            const requirements = data.accepts[0];

            const now = Math.floor(Date.now() / 1000);
            const authNonce = ethers.hexlify(ethers.randomBytes(32));
            const domain = { name: "USDC", version: "2", chainId: CONFIG.chainId, verifyingContract: CONFIG.usdc };
            const types = { TransferWithAuthorization: [
              { name: "from", type: "address" }, { name: "to", type: "address" },
              { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
              { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
            ]};
            const value = { from: state.address, to: requirements.payTo, value: requirements.maxAmountRequired,
              validAfter: 0, validBefore: now + 345600, nonce: authNonce };

            const rawSig = await state.signer.signTypedData(domain, types, value);
            const paymentPayload = { authorization: value, signature: rawSig };
            const paymentSigBase64 = btoa(JSON.stringify(paymentPayload));

            const res2 = await fetch(nanoUrl + "/api/premium/report", { headers: { "payment-signature": paymentSigBase64 } });
            const report = await res2.json();

            if (res2.status === 200) {
              results.push(report);
              toast({ kind: "ok", title: "📊 Report #" + (i+1) + " received!", detail: "TX: " + report.txHash, timeout: 8000 });
            } else {
              throw new Error(report.error || "HTTP " + res2.status);
            }
          } catch (e) {
            results.push({ error: e.message });
            toast({ kind: "err", title: "Report #" + (i+1) + " failed", detail: e.message, timeout: 4000 });
          }
          if (count > 1) await new Promise(r => setTimeout(r, 500));
        }
        out.innerHTML = results.map((r, i) => {
          if (r.error) return "<span style='color:var(--danger)'>❌ Report #" + (i+1) + ": " + r.error + "</span>";
          const m = r.marketOverview || {};
          let html = "<span style='color:var(--accent)'>✅ Report #" + (i+1) + "</span>\\n";
          html += "Generated: " + r.generatedAt + "\\n\\n";
          if (m.bitcoin && m.bitcoin.price) html += " Bitcoin: $" + m.bitcoin.price.toLocaleString() + "\\n";
          if (m.ethereum && m.ethereum.price) html += "🔷 Ethereum: $" + m.ethereum.price.toLocaleString() + "\\n";
          if (m.solana && m.solana.price) html += "🟣 Solana: $" + m.solana.price.toLocaleString() + "\\n";
          html += "\\nTX: " + r.txHash;
          return html;
        }).join("\\n\\n---\\n\\n");

        btn.disabled = false;
        btn.textContent = origText;
      }
`;
  s = s.replace(/(async function doNanoPayment\(\) \{)/, premiumFunc + `\n\n      $1`);
  console.log("✅ doGetPremiumReport()");
}

// ============================================
// 6. EVENT LISTENER'LAR
// ============================================
if (!s.includes('btnNanoPay").addEventListener')) {
  s = s.replace(
    /(\$\("btnX402Call"\)\.addEventListener\("click", doX402Call\);)/,
    `$1\n      $("btnNanoPay").addEventListener("click", doNanoPayment);`
  );
  console.log("✅ Event: btnNanoPay");
}

if (!s.includes('btnGetReport").addEventListener')) {
  s = s.replace(
    /(\$\("btnNanoPay"\)\.addEventListener\("click", doNanoPayment\);)/,
    `$1\n      $("btnGetReport").addEventListener("click", () => doGetPremiumReport(1));\n      $("btnGetReportMulti").addEventListener("click", () => doGetPremiumReport(3));`
  );
  console.log("✅ Event: btnGetReport");
}

// ============================================
// 7. BAŞLIK OKUNAKLI
// ============================================
s = s.replace(
  /<h1>Pay-per-call, enforced on-chain\.<\/h1>/,
  '<h1 style="color: #ffffff;">Pay-per-call, enforced on-chain.</h1>'
);
console.log("✅ Başlık: Beyaz");

writeFileSync(f, s);console.log("\n✅✅✅ TÜM ÖZELLİKLER EKLENDİ! ✅✅✅");

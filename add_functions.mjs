import { readFileSync, writeFileSync } from "fs";
let s = readFileSync("demo/app/index.html", "utf8");

// doNanoPayment fonksiyonu
if (!s.includes('async function doNanoPayment')) {
  const nanoFunc = `
      async function doNanoPayment() {
        const btn = $("btnNanoPay");
        const out = $("nanoOutput");
        if (!state.address) return toast({ kind: "err", title: "Connect wallet first" });
        if (btn.disabled) return;
        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = "Processing…";
        out.textContent = "Step 1: GET /nano/service (expecting 402)…";

        try {
          const res1 = await fetch("https://arcsla-eu.onrender.com/nano/service");
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
          const res2 = await fetch("https://arcsla-eu.onrender.com/nano/service", { headers: { "payment-signature": paymentSigBase64 } });
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
  console.log("✅ doNanoPayment() eklendi");
}

// doGetPremiumReport fonksiyonu
if (!s.includes('async function doGetPremiumReport')) {
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
            const res1 = await fetch("https://arcsla-eu.onrender.com/api/premium/report");
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

            const res2 = await fetch("https://arcsla-eu.onrender.com/api/premium/report", { headers: { "payment-signature": paymentSigBase64 } });
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
          if (m.bitcoin && m.bitcoin.price) html += "🟠 Bitcoin: $" + m.bitcoin.price.toLocaleString() + "\\n";
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
  console.log("✅ doGetPremiumReport() eklendi");
}

writeFileSync("demo/app/index.html", s);
console.log("✅ Fonksiyonlar eklendi!");

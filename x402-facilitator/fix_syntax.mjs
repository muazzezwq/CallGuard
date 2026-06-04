import { readFileSync, writeFileSync } from "fs";
let s = readFileSync("server.js", "utf8");

// Bozuk try-catch bloğunu düzelt
const lines = s.split('\n');
const fixedLines = [];
let inBrokenBlock = false;
let braceCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // 130-170 arası nano POST endpoint'i
  if (i >= 129 && i <= 169) {
    // Bu bloğu yeniden yaz
    if (i === 129) {
      fixedLines.push('app.post("/nano/service", async (req, res) => {');
      fixedLines.push('  try {');
      fixedLines.push('    const paymentSig = req.headers["payment-signature"];');
      fixedLines.push('    if (!paymentSig) {');
      fixedLines.push('      return res.status(402).json({ error: "No payment signature" });');
      fixedLines.push('    }');
      fixedLines.push('');
      fixedLines.push('    let payment;');
      fixedLines.push('    try {');
      fixedLines.push('      payment = JSON.parse(Buffer.from(paymentSig, "base64").toString());');
      fixedLines.push('      console.log("[nano] Payment parsed:", JSON.stringify(payment, null, 2));');
      fixedLines.push('    } catch(parseErr) {');
      fixedLines.push('      console.error("[nano] Parse error:", parseErr.message);');
      fixedLines.push('      return res.status(400).json({ error: "Invalid payment format", details: parseErr.message });');
      fixedLines.push('    }');
      fixedLines.push('');
      fixedLines.push('    const verifyResult = await fac.verify(payment);');
      fixedLines.push('    console.log("[nano] Verify result:", verifyResult);');
      fixedLines.push('');
      fixedLines.push('    if (!verifyResult.isValid) {');
      fixedLines.push('      console.error("[nano] Payment verification failed:", verifyResult.reason);');
      fixedLines.push('      return res.status(402).json({ error: "Invalid payment", reason: verifyResult.reason });');
      fixedLines.push('    }');
      fixedLines.push('');
      fixedLines.push('    const settleResult = await fac.settle(payment);');
      fixedLines.push('    const payer = payment.authorization.from;');
      fixedLines.push('    console.log(`[nano] Payment settled: 0.001 USDC from ${payer}`);');
      fixedLines.push('');
      fixedLines.push('    res.json({');
      fixedLines.push('      ok: true,');
      fixedLines.push('      data: "pong",');
      fixedLines.push('      payer,');
      fixedLines.push('      tx: settleResult.txHash');
      fixedLines.push('    });');
      fixedLines.push('  } catch (e) {');
      fixedLines.push('    console.error("[nano] Error:", e.message);');
      fixedLines.push('    res.status(500).json({ error: e.message });');
      fixedLines.push('  }');
      fixedLines.push('});');
      inBrokenBlock = true;
    }
    // Eski satırları atla
    continue;
  }
  
  fixedLines.push(line);
}

writeFileSync("server.js", fixedLines.join('\n'));
console.log("✅ Syntax hatası düzeltildi");

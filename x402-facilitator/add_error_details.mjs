import { readFileSync, writeFileSync } from "fs";
let s = readFileSync("server.js", "utf8");

// Nano endpoint'inde detaylı hata mesajları
s = s.replace(
  /const verifyResult = await fac\.verify\(payment\);/,
  `try {
      const verifyResult = await fac.verify(payment);
      console.log("[nano] Verify result:", verifyResult);`
);

s = s.replace(
  /if \(!verifyResult\.isValid\) \{/,
  `if (!verifyResult.isValid) {
      console.error("[nano] Payment verification failed:", verifyResult.reason);`
);

// Try-catch ekle
s = s.replace(
  /const payment = JSON\.parse\(Buffer\.from\(paymentSig, "base64"\)\.toString\(\)\);/,
  `let payment;
      try {
        payment = JSON.parse(Buffer.from(paymentSig, "base64").toString());
        console.log("[nano] Payment parsed:", JSON.stringify(payment, null, 2));
      } catch(parseErr) {
        console.error("[nano] Parse error:", parseErr.message);
        return res.status(400).json({ error: "Invalid payment format", details: parseErr.message });
      }`
);

writeFileSync("server.js", s);
console.log("✅ Detaylı hata mesajları eklendi");

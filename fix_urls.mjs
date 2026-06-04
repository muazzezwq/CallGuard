import { readFileSync, writeFileSync } from "fs";
const f = "demo/app/index.html";
let s = readFileSync(f, "utf8");

// Aynı domain kullan (Vercel serverless)
s = s.replace(
  /facilitatorUrl: "[^"]*"/,
  `facilitatorUrl: ""`
);
s = s.replace(
  /nanoFacilitatorUrl: "[^"]*"/,
  `nanoFacilitatorUrl: ""`
);

// URL'leri relative yap
s = s.replace(/nanoUrl \+ "\/nano\/service"/g, '"/api/nano-service"');
s = s.replace(/nanoUrl \+ "\/api\/premium\/report"/g, '"/api/premium-report"');

writeFileSync(f, s);
console.log("✅ URL'ler güncellendi (relative path)");

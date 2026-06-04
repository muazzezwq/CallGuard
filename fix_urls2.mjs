import { readFileSync, writeFileSync } from "fs";
const f = "demo/app/index.html";
let s = readFileSync(f, "utf8");

// CONFIG'i güncelle - aynı origin'i kullan
s = s.replace(
  /facilitatorUrl: "[^"]*",/,
  `facilitatorUrl: window.location.origin,`
);
s = s.replace(
  /nanoFacilitatorUrl: "[^"]*",/,
  `nanoFacilitatorUrl: window.location.origin,`
);

// API path'lerini düzelt
s = s.replace(/"\/api\/nano-service"/g, '"/api/nano-service.js"');
s = s.replace(/"\/api\/premium-report"/g, '"/api/premium-report.js"');

writeFileSync(f, s);
console.log("✅ URL'ler düzeltildi");

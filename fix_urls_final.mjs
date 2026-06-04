import { readFileSync, writeFileSync } from "fs";
let s = readFileSync("demo/app/index.html", "utf8");

// /api/nano-service → https://arcsla-eu.onrender.com/nano/service
s = s.replace(/fetch\("\/api\/nano-service"/g, 'fetch("https://arcsla-eu.onrender.com/nano/service"');

// /api/premium-report → https://arcsla-eu.onrender.com/api/premium/report
s = s.replace(/fetch\("\/api\/premium-report"/g, 'fetch("https://arcsla-eu.onrender.com/api/premium/report"');

writeFileSync("demo/app/index.html", s);
console.log("✅ Frontend URL'leri düzeltildi");

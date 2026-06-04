import { readFileSync, writeFileSync } from "fs";
const f = "demo/app/index.html";
let s = readFileSync(f, "utf8");

// .js uzantılarını kaldır
s = s.replace(/\/api\/nano-service\.js/g, '/api/nano-service');
s = s.replace(/\/api\/premium-report\.js/g, '/api/premium-report');

writeFileSync(f, s);
console.log("✅ API path'leri düzeltildi (.js kaldırıldı)");

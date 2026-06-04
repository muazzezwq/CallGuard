import { readFileSync, writeFileSync } from "fs";
const f = "demo/app/index.html";
let s = readFileSync(f, "utf8");

// Backend URL'yi değiştir
const backendUrl = "https://YOUR_BACKEND_URL.vercel.app"; // Buraya vercel'den çıkan URL'yi yaz

s = s.replace(
  /nanoFacilitatorUrl: "http:\/\/localhost:4021"/,
  `nanoFacilitatorUrl: "${backendUrl}"`
);

s = s.replace(
  /facilitatorUrl: "https:\/\/arcsla-eu\.onrender\.com"/,
  `facilitatorUrl: "${backendUrl}"`
);

writeFileSync(f, s);
console.log("✅ Backend URL güncellendi:", backendUrl);

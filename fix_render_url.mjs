import { readFileSync, writeFileSync } from "fs";
const f = "demo/app/index.html";
let s = readFileSync(f, "utf8");

s = s.replace(
  /facilitatorUrl: window\.location\.origin,/,
  `facilitatorUrl: "https://arcsla-eu.onrender.com",`
);
s = s.replace(
  /nanoFacilitatorUrl: window\.location\.origin,/,
  `nanoFacilitatorUrl: "https://arcsla-eu.onrender.com",`
);

writeFileSync(f, s);
console.log("✅ URL'ler Render.com'a güncellendi");

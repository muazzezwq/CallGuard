import { readFileSync, writeFileSync } from "fs";
let s = readFileSync("server.js", "utf8");

// wallet.address yerine fac.facilitatorAddress kullan
s = s.replace(/wallet\.address/g, 'fac.facilitatorAddress');

writeFileSync("server.js", s);
console.log("✅ wallet.address → fac.facilitatorAddress");

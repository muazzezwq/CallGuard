import { readFileSync, writeFileSync } from "fs";
let s = readFileSync("server.js", "utf8");

// atob() → Buffer.from() ile değiştir
s = s.replace(/JSON\.parse\(atob\(paymentSig\)\)/g, 
  'JSON.parse(Buffer.from(paymentSig, "base64").toString())');

writeFileSync("server.js", s);
console.log("✅ atob() → Buffer.from() ile değiştirildi");

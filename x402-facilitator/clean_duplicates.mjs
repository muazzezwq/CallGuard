import { readFileSync, writeFileSync } from "fs";
let s = readFileSync("server.js", "utf8");

// Duplicate endpoint'leri sil (263. satırdan itibaren)
const lines = s.split('\n');
const cleanLines = [];
let skipUntil = -1;

for (let i = 0; i < lines.length; i++) {
  if (i >= 262 && i <= 320) {
    // Duplicate endpoint'leri atla
    continue;
  }
  cleanLines.push(lines[i]);
}

writeFileSync("server.js", cleanLines.join('\n'));
console.log("✅ Duplicate endpoint'ler silindi");

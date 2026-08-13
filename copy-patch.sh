#!/data/data/com.termux/files/usr/bin/bash

echo "Updating CallGuard copy..."

cp index.html index.copy-backup.html
cp app/index.html app.copy-backup.html

python3 -c '
from pathlib import Path

files=["index.html","app/index.html"]

replacements={
"CallGuard — Service guarantees, enforced on-chain":
"CallGuard — Programmable service settlement for autonomous systems on Arc",

"CallGuard is an on-chain SLA marketplace on Arc Testnet. Providers stake USDC, callers pay per request, and the contract enforces the guarantee — no arbiter, no middleman.":
"CallGuard is a programmable service settlement layer built on Arc. Providers define service commitments, callers pay with USDC, and onchain logic manages verification, settlement, and reputation.",

"An on-chain SLA marketplace on Arc Testnet. Service guarantees, enforced by":
"Programmable service infrastructure built on Arc. Reliable settlement and verification for autonomous services.",

"Built for AI agents":
"Infrastructure for autonomous services",

"trust becomes programmable":
"service reliability becomes programmable",

"no arbiter, no middleman":
"without centralized coordination",

"Everything settles into the same SLA core.":
"Multiple service flows, one programmable settlement layer."
}

for f in files:
    p=Path(f)
    text=p.read_text()
    for old,new in replacements.items():
        text=text.replace(old,new)
    p.write_text(text)

print("Copy update complete")
'

echo "Done."

#!/data/data/com.termux/files/usr/bin/bash

cp index.html index.copy2-backup.html
cp app/index.html app.copy2-backup.html

python3 -c '
from pathlib import Path

files=["index.html","app/index.html"]

replace={
"No arbiter. No middleman.":
"Programmable settlement without centralized coordination.",

"An AI agent has no way to assess or enforce a provider'\''s reliability on its own.":
"Autonomous services need transparent ways to evaluate provider reliability.",

"One agreement. Five steps. Zero arbiters.":
"One agreement. Five steps. Programmable execution.",

"money and enforces the terms — from the moment a call opens to the moment it settles.":
"payments and service conditions — from initiation through settlement.",

"The provider responds within the committed window and gets paid instantly.":
"The provider responds within the committed window and receives settlement after verification.",

"Because it lives on-chain, an auto-router or an AI agent can read it directly and":
"Because it lives onchain, an auto-router or autonomous service can read it directly and",

"Missed deadlines trigger an immediate, contract-computed penalty. No arbiter, no delay.":
"Missed deadlines trigger contract-defined outcomes based on the agreed service terms.",

"stake cannot be pulled instantly to dodge an in-flight obligation.":
"stake cannot be removed while an active service obligation is being processed.",

"Polygon while Arc still enforces the SLA. Both settle into the same contracts.":
"Polygon while Arc provides the settlement environment for the SLA flow."
}

for f in files:
    p=Path(f)
    t=p.read_text()
    for a,b in replace.items():
        t=t.replace(a,b)
    p.write_text(t)

print("copy cleanup complete")
'

#!/data/data/com.termux/files/usr/bin/bash

cp index.html index.final-copy-backup.html
cp app/index.html app.final-copy-backup.html

python3 -c '
from pathlib import Path

files=["index.html","app/index.html"]

replace={
"When a developer — or an autonomous AI agent — pays an API provider, there is":
"When an application or autonomous service pays an API provider, there is",

"Trustless job settlement — client locks USDC, provider delivers, evaluator approves, contract pays. No arbiter needed.":
"Programmable job settlement — client locks USDC, provider delivers, evaluator approves, and contracts manage the settlement flow.",

"Predictable fees and sub-second finality make autonomous, per-call commerce practical.":
"Predictable fees and fast finality support reliable per-call service interactions.",

"Per-call payments only work if settlement is instant.":
"Per-call payments require reliable settlement infrastructure.",

"Arc enforces the SLA":
"Arc provides the settlement environment for SLA execution."
}

for f in files:
    p=Path(f)
    t=p.read_text()
    for a,b in replace.items():
        t=t.replace(a,b)
    p.write_text(t)

print("Final copy patch complete")
'

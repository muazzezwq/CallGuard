#!/data/data/com.termux/files/usr/bin/bash

echo "🚀 CallGuard redesign başlıyor..."

cp README.md README.backup.md
cp index.html index.backup.html
cp app/index.html app/index.backup.html

echo "✅ Backup alındı"

python3 - <<'PY'
from pathlib import Path

p = Path("README.md")
text = p.read_text()

start = text.find("## Built for AI agents")
end = text.find("### Why Arc specifically")

if start != -1 and end != -1:
    new = """## Built for AI agents

As autonomous services become more connected, they need reliable ways to exchange value, verify execution, and coordinate without unnecessary friction.

CallGuard explores programmable infrastructure for machine-to-machine interactions where services can define commitments, settle payments, and build reputation through transparent onchain rules.

Built on Arc, CallGuard combines stablecoin-native settlement with programmable financial infrastructure designed for autonomous services.

"""
    text = text[:start] + new + text[end:]
    p.write_text(text)

print("README updated")
PY

echo "🎯 CallGuard redesign patch completed"

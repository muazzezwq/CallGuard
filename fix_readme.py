from pathlib import Path

p = Path("README.md")
text = p.read_text()

start = text.index("## Built for AI agents")
end = text.index("### Why Arc specifically", start)

new = """## Built for AI agents

As autonomous services become more connected, they need reliable ways to exchange value, verify execution, and coordinate without unnecessary friction.

A research agent may request analysis from another service. An application may require external AI capabilities. An autonomous workflow may need to pay for specialized APIs.

These interactions require more than payments. They require programmable rules, transparent verification, and reliable settlement.

CallGuard provides infrastructure where service providers define commitments, users initiate programmable USDC payments, and onchain logic manages execution conditions and reputation signals.

A typical flow:

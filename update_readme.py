from pathlib import Path

p = Path("README.md")
text = p.read_text()

start = text.index("## Built for AI agents")
end = text.index("## Live on Arc Testnet", start)

new = """## Built for AI agents

Autonomous services require reliable ways to exchange value, verify execution, and coordinate through programmable infrastructure.

CallGuard explores machine-to-machine interactions where services can define commitments, users can initiate USDC payments, and smart contracts manage settlement and verification flows.

Example use cases:

- AI agents accessing specialized APIs
- Applications consuming external services
- Autonomous workflows coordinating payments and execution

A typical flow:

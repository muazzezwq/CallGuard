from pathlib import Path

p = Path("README.md")
text = p.read_text()

replacements = {
    "## Why this matters": "## Why this matters",
    "Autonomous services are becoming an important part of digital infrastructure.": 
    "Autonomous services are becoming an increasingly important part of digital infrastructure.",

    "CallGuard explores how USDC-based payments, service commitments, and verifiable execution flows can work together to support more reliable machine-to-machine interactions.":
    "CallGuard explores how programmable USDC payments, service commitments, and verifiable execution flows can support reliable machine-to-machine interactions.",

    "Designed for the emerging agent economy, CallGuard focuses on AI agents, APIs, and digital services that require programmable payment and verification flows.":
    "Designed for autonomous service interactions, CallGuard focuses on AI agents, APIs, and digital services that require programmable payment and verification flows.",

    "## Built for AI agents":
    "## Built for autonomous services",

    "As autonomous services become more connected, they need reliable ways to exchange value, verify execution, and coordinate without unnecessary friction.":
    "As autonomous services become more connected, they need reliable ways to exchange value, verify execution, and coordinate through transparent infrastructure.",

    "CallGuard explores programmable infrastructure for machine-to-machine interactions where services can define commitments, settle payments, and build reputation through transparent onchain rules.":
    "CallGuard provides programmable infrastructure for machine-to-machine interactions where services can define commitments, settle payments, and build reputation through transparent onchain rules.",

    "Built on Arc, CallGuard combines stablecoin-native settlement with programmable financial infrastructure designed for autonomous services.":
    "Built on Arc, CallGuard combines stablecoin-native settlement with programmable financial infrastructure for autonomous service workflows.",

    "### Why Arc\n\nAI-agent transactions introduce new infrastructure requirements:":
    "### Why Arc\n\nAutonomous service interactions introduce new infrastructure requirements:",

    "Arc provides infrastructure designed around these requirements: USDC-native gas, predictable settlement costs, and fast transaction finality. These properties allow builders to design applications around programmable stablecoin payments and autonomous service interactions.":
    "Arc provides infrastructure designed around these requirements: USDC-native gas, predictable settlement costs, and fast transaction finality. These properties allow builders to create applications around programmable stablecoin payments and service settlement."
}

for old, new in replacements.items():
    text = text.replace(old, new)

p.write_text(text)

print("✅ README Arc standard cleanup completed")

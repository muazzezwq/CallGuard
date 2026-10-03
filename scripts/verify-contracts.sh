#!/bin/bash
# Verify all CallGuard contracts on ArcScan
# Usage: bash scripts/verify-contracts.sh
# Requires: ETHERSCAN_API_KEY in .env (ArcScan uses Etherscan-compatible API)

set -e
source .env 2>/dev/null || true

RPC="${ARC_RPC_URL:-https://rpc.testnet.arc.io}"
VERIFIER_URL="https://explorer.testnet.arc.io/api"
CHAIN_ID="5042002"

echo "🔍 Verifying CallGuard contracts on Arc Testnet..."

contracts=(
  "src/ServiceRegistry.sol:ServiceRegistry:${VITE_SERVICE_REGISTRY}"
  "src/PayPerCall.sol:PayPerCall:${VITE_PAY_PER_CALL}"
  "src/Dispute.sol:Dispute:${VITE_DISPUTE}"
  "src/DisputeQuality.sol:DisputeQuality:${VITE_DISPUTE_QUALITY}"
  "src/SLAFutures.sol:SLAFutures:${VITE_SLA_FUTURES}"
  "src/ReputationLoan.sol:ReputationLoan:${VITE_REPUTATION_LOAN}"
  "src/SLAAttestationBridge.sol:SLAAttestationBridge:${VITE_SLA_ATTESTATION_BRIDGE}"
  "src/AgentWallet.sol:AgentWallet:${VITE_AGENT_WALLET}"
)

passed=0
failed=0

for entry in "${contracts[@]}"; do
  IFS=':' read -r file contract addr <<< "$entry"
  if [ -z "$addr" ]; then
    echo "  ⚠️  $contract — address not set in .env, skipping"
    continue
  fi
  echo "  📝 Verifying $contract at $addr..."
  if forge verify-contract \
    --chain-id "$CHAIN_ID" \
    --verifier etherscan \
    --verifier-url "$VERIFIER_URL" \
    --etherscan-api-key "${ETHERSCAN_API_KEY:-placeholder}" \
    --compiler-version 0.8.24 \
    "$addr" \
    "$file:$contract" 2>&1 | grep -q "Successfully"; then
    echo "  ✅ $contract verified"
    ((passed++))
  else
    echo "  ❌ $contract verification failed (may already be verified)"
    ((failed++))
  fi
done

echo ""
echo "Results: $passed verified, $failed failed/skipped"

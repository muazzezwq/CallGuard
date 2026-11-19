#!/usr/bin/env bash
# Read-only health check for the live 13 Nov v8 deployment.

# Exit 1 if the registry/provider/dispute wiring is not usable.
#
#   ./scripts/live-sla-health.sh
set -euo pipefail

command -v cast >/dev/null || { echo "cast not found; add foundry to PATH" >&2; exit 2; }

RPC="${ARC_RPC_URL:-https://rpc.testnet.arc.io}"
REGISTRY="${SERVICE_REGISTRY_V8:-0x21E073030Bdb226Fb69E2f7ABE233c33A7b0ddC9}"
PPC="${PAY_PER_CALL_V8:-0xA40623c2C8A39ae55AE3fEa47f85cF89Dc7F5491}"
KEEPER="${SLA_KEEPER_V8:-0xc1028E084Fad5Ab08C30BbF2b062683da6f0b280}"
DISPUTE="${DISPUTE_V4:-0x7c04880003361c16Dd1d49205ef5ec187e2D2d39}"
PROVIDER_ID="${PROVIDER_ID:-1}"

fail=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=1; }
note() { printf '  \033[33m!\033[0m %s\n' "$1"; }

call() { cast call "$1" "$2" "${@:3}" --rpc-url "$RPC" 2>/dev/null || true; }

echo "Live v8 health ($RPC)"

[[ "$(call "$REGISTRY" 'payPerCall()(address)')" == "$PPC" ]] \
  && ok "registry.payPerCall is $PPC" || bad "registry.payPerCall does not match $PPC"
[[ "$(call "$PPC" 'registry()(address)')" == "$REGISTRY" ]] \
  && ok "payPerCall.registry is $REGISTRY" || bad "payPerCall.registry does not match"
[[ "$(call "$KEEPER" 'payPerCall()(address)')" == "$PPC" ]] \
  && ok "keeper.payPerCall is $PPC" || bad "keeper.payPerCall does not match"

read -r active <<<"$(call "$REGISTRY" 'getProvider(uint256)((address,address,uint256,uint256,uint32,bool,uint256,uint256,uint256,uint32,uint8))' "$PROVIDER_ID" | awk -F', ' '{print $6}')"
if [[ "$active" == "true" ]]; then
  ok "provider $PROVIDER_ID is active"
else
  bad "provider $PROVIDER_ID is not active"
fi

if [[ "$(call "$REGISTRY" 'authorizedSlashers(address)(bool)' "$DISPUTE")" == "true" ]]; then
  ok "DisputeV4 may slash (openDispute can escrow)"
else
  pending=$(call "$REGISTRY" 'pendingSlasher()(address)')
  ready=$(call "$REGISTRY" 'pendingSlasherAt()(uint256)' | awk '{print $1}')
  bad "DisputeV4 has no slasher authority, so openDispute reverts OnlySlasher"
  note "pendingSlasher=$pending pendingSlasherAt=$ready"
  note "run scripts/grant-dispute-slasher.sh with the registry admin account"
fi

echo
if (( fail )); then
  echo "RESULT: not SLA-ready"
  exit 1
fi
echo "RESULT: SLA-ready"

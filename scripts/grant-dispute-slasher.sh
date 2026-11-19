#!/usr/bin/env bash
# Grant DisputeV4 slasher authority on the live registry (issue #5).

#
# The registry keeps one pending slasher at a time, so the order is:
#   1. confirmSlasher()                  -> grants DisputeV2 (the slot holder)
#   2. authorizeSlasher(DisputeV4)
#   3. wait SLASHER_DELAY (172800 s)
#   4. confirmSlasher()                  -> grants DisputeV4
#
# Run it twice with the same account: the second run starts after the first
# confirm, and a third run after the delay completes the grant. The script only
# sends the step that is currently possible and never prints key material.
#
#   CAST_ACCOUNT=registry-admin ./scripts/grant-dispute-slasher.sh
#   CAST_ACCOUNT=registry-admin YES=1 ./scripts/grant-dispute-slasher.sh   # no prompt
set -euo pipefail

command -v cast >/dev/null || { echo "cast not found; add foundry to PATH" >&2; exit 2; }

RPC="${ARC_RPC_URL:-https://rpc.testnet.arc.io}"
REGISTRY="${SERVICE_REGISTRY_V8:-0x21E073030Bdb226Fb69E2f7ABE233c33A7b0ddC9}"
DISPUTE_V4="${DISPUTE_V4:-0x7c04880003361c16Dd1d49205ef5ec187e2D2d39}"
ACCOUNT="${CAST_ACCOUNT:-}"

if [[ -z "$ACCOUNT" ]]; then
  echo "set CAST_ACCOUNT to a cast keystore account (cast wallet import …) or use --ledger manually" >&2
  exit 2
fi

call() { cast call "$REGISTRY" "$1" "${@:2}" --rpc-url "$RPC"; }

confirm() {
  if [[ "${YES:-0}" != "1" ]]; then
    read -r -p "send confirmSlasher() from $ACCOUNT? [y/N] " answer
    [[ "$answer" == "y" || "$answer" == "Y" ]] || exit 1
  fi
  cast send "$REGISTRY" "confirmSlasher()" --account "$ACCOUNT" --rpc-url "$RPC"
}

nominate() {
  if [[ "${YES:-0}" != "1" ]]; then
    read -r -p "send authorizeSlasher($DISPUTE_V4) from $ACCOUNT? [y/N] " answer
    [[ "$answer" == "y" || "$answer" == "Y" ]] || exit 1
  fi
  cast send "$REGISTRY" "authorizeSlasher(address)" "$DISPUTE_V4" --account "$ACCOUNT" --rpc-url "$RPC"
}

authorized=$(call "authorizedSlashers(address)(bool)" "$DISPUTE_V4")
if [[ "$authorized" == "true" ]]; then
  echo "DisputeV4 is already authorised; nothing to do."
  exit 0
fi

pending=$(call "pendingSlasher()(address)")
ready_at=$(call "pendingSlasherAt()(uint256)" | awk '{print $1}')
now=$(cast block latest --field timestamp --rpc-url "$RPC")

if [[ "$pending" == "0x0000000000000000000000000000000000000000" ]]; then
  echo "No pending nomination; nominating DisputeV4 (2-day delay starts now)."
  nominate
  exit 0
fi

if (( now < ready_at )); then
  echo "Pending slasher $pending is not confirmable yet."
  echo "Ready at $(date -u -d "@$ready_at" '+%Y-%m-%d %H:%M UTC'); re-run then."
  exit 0
fi

echo "Confirming pending slasher $pending."
confirm
if [[ "$pending" == "$DISPUTE_V4" ]]; then
  echo "DisputeV4 granted."
else
  echo "Slot cleared. Re-run to nominate DisputeV4, then re-run once more after the 2-day delay."
fi

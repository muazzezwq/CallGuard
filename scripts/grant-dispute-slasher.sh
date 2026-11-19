#!/usr/bin/env bash
# Grant DisputeV4 slasher authority on the live registry (issue #5).
#
# Two admin calls, two days apart:
#   1. authorizeSlasher(DisputeV4)  -> starts SLASHER_DELAY (172800 s)
#   2. confirmSlasher()             -> grants DisputeV4
#
# The live slot already holds a stale DisputeV2 nomination whose delay elapsed
# on 14 Nov. It does not need to be confirmed: authorizeSlasher overwrites the
# single pending slot, so step 1 replaces V2 with V4 and never hands the
# deprecated contract the authority. Run this script, wait two days, run it
# again.
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

if [[ "$(cast call "$REGISTRY" 'admin()(address)' --rpc-url "$RPC")" != "$(cast wallet address --account "$ACCOUNT")" ]]; then
  echo "$ACCOUNT is not the registry admin; the call would revert NotAdmin." >&2
  exit 2
fi

call() { cast call "$REGISTRY" "$1" "${@:2}" --rpc-url "$RPC"; }

send() {
  local what="$1"; shift
  if [[ "${YES:-0}" != "1" ]]; then
    read -r -p "send $what from $ACCOUNT? [y/N] " answer
    [[ "$answer" == "y" || "$answer" == "Y" ]] || exit 1
  fi
  cast send "$REGISTRY" "$@" --account "$ACCOUNT" --rpc-url "$RPC"
}

authorized=$(call 'authorizedSlashers(address)(bool)' "$DISPUTE_V4")
if [[ "$authorized" == "true" ]]; then
  echo "DisputeV4 is already authorised; nothing to do."
  exit 0
fi

pending=$(call 'pendingSlasher()(address)')
ready_at=$(call 'pendingSlasherAt()(uint256)' | awk '{print $1}')
now=$(cast block latest --field timestamp --rpc-url "$RPC")

if [[ "$pending" != "$DISPUTE_V4" ]]; then
  echo "Pending slot holds ${pending:0:10}…; nominating DisputeV4 (delay restarts now)."
  send "authorizeSlasher($DISPUTE_V4)" "authorizeSlasher(address)" "$DISPUTE_V4"
  echo
  echo "Now wait SLASHER_DELAY ($(call 'SLASHER_DELAY()(uint32)' | awk '{print $1}') s), then re-run this script."
  exit 0
fi

if (( now < ready_at )); then
  echo "DisputeV4 is nominated but not confirmable until $(date -u -d "@$ready_at" '+%Y-%m-%d %H:%M UTC')."
  echo "Re-run this script then; it will send confirmSlasher()."
  exit 0
fi

send "confirmSlasher()" "confirmSlasher()"
[[ "$(call 'authorizedSlashers(address)(bool)' "$DISPUTE_V4")" == "true" ]] \
  && echo "DisputeV4 granted; openDispute can escrow again." \
  || { echo "confirmSlasher returned but the grant is not visible yet; re-check status." >&2; exit 1; }

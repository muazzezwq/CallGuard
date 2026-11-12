/**
 * Global kill switch for the routes that move value.
 *
 * The contracts cannot be paused: they are immutable and the deployed instance
 * has no pause slot. What an operator can stop instantly is this deployment, by
 * setting `MONEY_ROUTES_DISABLED=1` in the host environment. Every money route
 * then answers 503 before it reads an authorization, calls the RPC, or asks the
 * facilitator to settle.
 *
 * This stops new value from entering through this deployment. It does not stop
 * the chain: the keeper keeps claiming timeouts, providers keep their stake, and
 * pending calls keep the behaviour they were opened with. `docs/INCIDENT_RUNBOOK.md`
 * is the procedure that goes with it.
 */

export const MONEY_ROUTES_DISABLED_CODE = "MONEY_ROUTES_DISABLED";

/** True when this deployment must refuse to take or move payment. */
export function moneyRoutesDisabled(env = process.env) {
  const value = String(env.MONEY_ROUTES_DISABLED || "")
    .trim()
    .toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

/** The single 503 body every money route returns while the switch is on. */
export function disabledResponse(res) {
  return res.status(503).json({
    error: "Payments are disabled on this deployment",
    code: MONEY_ROUTES_DISABLED_CODE,
  });
}

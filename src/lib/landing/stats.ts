/**
 * The four numbers on the landing band, computed once so each label can be tested
 * against the number it sits under.
 *
 * Every one of these used to be derived inline in `Landing.tsx`, and three labels
 * claimed more than the arithmetic delivered:
 *   - "Calls settled or slashed" fell back to the raw call count, so calls that were
 *     still open were counted as finished.
 *   - "Active providers" fell back to every provider when none was active.
 *   - "SLA success rate" was the Bayesian reputation score, `(completed + 2) /
 *     (completed + slashed + 3)`, which is deliberately shrunk toward the prior and
 *     is not a success rate.
 *
 * Display precision is the component's business; nothing here rounds.
 */

export type CallRow = {
  id: string;
  status: string;
  amount: string;
  providerId: string;
};

export type ProviderRow = {
  id: string;
  active: boolean;
  completedCalls: string;
  slashedCalls: string;
};

/**
 * `CallStatus` in the v8 subgraph schema is `STARTED | COMPLETED | SLASHED |
 * REFUNDED`. Only `STARTED` means money is still escrowed; `OPEN` and `PENDING` were
 * never emitted by this subgraph and are not states a call can be in.
 */
export const OPEN_STATES: ReadonlySet<string> = new Set(["STARTED"]);

/** `calls(first: CALL_WINDOW)` in the landing query. */
export const CALL_WINDOW = 120;

export type LandingStats = {
  /** Any row at all — tells an empty subgraph apart from a zero result. */
  hasData: boolean;
  /** Completed + slashed across providers: calls that actually finished. */
  settledOrSlashed: number;
  /** Providers the registry still marks active. */
  activeProviders: number;
  /** USDC held for calls in an open state, from the newest `CALL_WINDOW` calls. */
  escrow: number;
  /** True when the query returned a full window, so `escrow` is a lower bound. */
  escrowCapped: boolean;
  /** Bayesian reputation score as a percentage, or null before any call finishes. */
  reputationScore: number | null;
};

export function landingStats(calls: CallRow[], providers: ProviderRow[]): LandingStats {
  const completed = providers.reduce((sum, p) => sum + Number(p.completedCalls || 0), 0);
  const slashed = providers.reduce((sum, p) => sum + Number(p.slashedCalls || 0), 0);
  const finished = completed + slashed;

  const escrowRaw = calls
    .filter((c) => OPEN_STATES.has(c.status))
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);

  return {
    hasData: calls.length > 0 || providers.length > 0,
    settledOrSlashed: finished,
    activeProviders: providers.filter((p) => p.active).length,
    escrow: escrowRaw / 1e6,
    escrowCapped: calls.length >= CALL_WINDOW,
    reputationScore: finished > 0 ? Math.round(((completed + 2) / (finished + 3)) * 100) : null,
  };
}

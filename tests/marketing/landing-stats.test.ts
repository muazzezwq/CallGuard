import { describe, expect, test } from "bun:test";
import { CALL_WINDOW, landingStats, type CallRow, type ProviderRow } from "../../src/lib/landing/stats";

// The landing page states four numbers. Each one used to be computed inline in the
// component, which is why three of them carried a label the number did not deserve:
// "settled or slashed" fell back to the raw call count, "active providers" fell back
// to every provider, and the Bayesian reputation score was printed as a success rate.
// The calculation lives here so the label and the number can be tested together.

const provider = (over: Partial<ProviderRow> = {}): ProviderRow => ({
  id: "1",
  active: true,
  completedCalls: "0",
  slashedCalls: "0",
  ...over,
});

const call = (over: Partial<CallRow> = {}): CallRow => ({
  id: "0x01",
  status: "STARTED",
  amount: "1000000",
  providerId: "1",
  ...over,
});

describe("landing stats", () => {
  test("settled-or-slashed counts finished calls, never open ones", () => {
    // One provider with history and two calls still open: an open call is not
    // "settled or slashed", so the raw call count must not stand in for it.
    const stats = landingStats(
      [call({ id: "0x01" }), call({ id: "0x02" })],
      [provider({ completedCalls: "5", slashedCalls: "3" })],
    );
    expect(stats.settledOrSlashed).toBe(8);
  });

  test("settled-or-slashed is zero when no provider has finished a call", () => {
    const stats = landingStats([call(), call(), call()], [provider()]);
    expect(stats.settledOrSlashed).toBe(0);
  });

  test("active providers counts only providers the registry marks active", () => {
    const stats = landingStats([], [
      provider({ id: "1", active: true }),
      provider({ id: "2", active: false }),
      provider({ id: "3", active: false }),
    ]);
    expect(stats.activeProviders).toBe(1);
  });

  test("open escrow sums started calls in whole USDC units", () => {
    const stats = landingStats(
      [
        call({ id: "0x01", status: "STARTED", amount: "1250000" }),
        call({ id: "0x02", status: "STARTED", amount: "500000" }),
        call({ id: "0x03", status: "COMPLETED", amount: "9000000" }),
        call({ id: "0x04", status: "SLASHED", amount: "4000000" }),
      ],
      [provider()],
    );
    expect(stats.escrow).toBe(1.75);
  });

  test("open escrow does not round the underlying amount", () => {
    // 1.234567 USDC must survive to the formatter; the component decides display
    // precision, the calculation does not lose the fraction first.
    const stats = landingStats([call({ status: "STARTED", amount: "1234567" })], []);
    expect(stats.escrow).toBe(1.234567);
  });

  test("escrow is flagged as a floor when the query window is full", () => {
    // The subgraph query asks for the newest CALL_WINDOW calls, so a full window
    // means older open calls exist that this sum cannot see.
    const full = Array.from({ length: CALL_WINDOW }, (_, i) => call({ id: `0x${i}` }));
    expect(landingStats(full, []).escrowCapped).toBe(true);
    expect(landingStats(full.slice(1), []).escrowCapped).toBe(false);
  });

  test("reputation is the Bayesian score, not a success rate", () => {
    // (completed + 2) / (completed + slashed + 3), as HowItWorks documents it.
    const stats = landingStats([], [provider({ completedCalls: "8", slashedCalls: "2" })]);
    expect(stats.reputationScore).toBe(Math.floor((10 / 13) * 100));
  });

  test("reputation is null when no call has been finished", () => {
    expect(landingStats([], [provider()]).reputationScore).toBeNull();
    expect(landingStats([], []).reputationScore).toBeNull();
  });

  test("hasData distinguishes an empty subgraph from a zero result", () => {
    expect(landingStats([], []).hasData).toBe(false);
    expect(landingStats([call()], []).hasData).toBe(true);
    expect(landingStats([], [provider()]).hasData).toBe(true);
  });
});

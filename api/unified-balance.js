/**
 * GET /api/unified-balance?address=0x...
 *
 * Returns Circle Gateway Unified Balance for a given depositor address.
 * Uses @circle-fin/unified-balance-kit (no Kit Key required).
 *
 * Query params:
 *   address  — EVM address of the depositor (required)
 */

export default async function handler(req, res) {
  const { address } = req.query || {};

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ ok: false, error: "Missing or invalid `address` query param" });
  }

  try {
    // Dynamic import — UnifiedBalanceKit is ESM-only in newer versions.
    const { UnifiedBalanceKit } = await import("@circle-fin/unified-balance-kit");
    const kit = new UnifiedBalanceKit();

    const balances = await kit.getBalances({ depositor: address });

    return res.status(200).json({
      ok: true,
      address,
      balances,
      // Convenience: include Arc Testnet USDC balance explicitly
      arcTestnetUSDC: balances?.chains?.find(
        (c) => c.chain?.id === 5042002 || c.chain?.name?.toLowerCase().includes("arc")
      ) ?? null,
    });
  } catch (err) {
    const msg = err?.message ?? String(err);
    // If the kit is not installed, return a clear error rather than a 500.
    if (msg.includes("Cannot find package") || msg.includes("MODULE_NOT_FOUND")) {
      return res.status(501).json({
        ok: false,
        error: "UnifiedBalanceKit not installed. Run: bun add @circle-fin/unified-balance-kit @circle-fin/adapter-viem-v2",
      });
    }
    console.error("[unified-balance] error:", msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}

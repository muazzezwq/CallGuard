/**
 * useBudgetCap — session budget cap guard (from Settings panel)
 * Returns { checkBudget, spendBudget, remaining }
 */
import { useCallback } from "react";

const KEY_BUDGET = "cg_budget";
const KEY_SPENT = "cg_spent_" + new Date().toDateString(); // resets daily

export function useBudgetCap() {
  const getBudgetLimit = (): number | null => {
    const v = localStorage.getItem(KEY_BUDGET);
    if (!v) return null;
    const n = parseFloat(v);
    return isNaN(n) || n <= 0 ? null : n;
  };

  const getSpent = (): number => {
    const v = localStorage.getItem(KEY_SPENT);
    return v ? parseFloat(v) || 0 : 0;
  };

  const spendBudget = useCallback((amount: number) => {
    const spent = getSpent() + amount;
    localStorage.setItem(KEY_SPENT, String(spent));
  }, []);

  /** Returns true if ok to proceed, false if over budget */
  const checkBudget = useCallback((amount: number): { ok: boolean; message?: string } => {
    const limit = getBudgetLimit();
    if (limit === null) return { ok: true };
    const spent = getSpent();
    const remaining = limit - spent;
    if (amount > remaining) {
      return {
        ok: false,
        message: `Session budget cap exceeded. Limit: ${limit} USDC, spent: ${spent.toFixed(4)}, remaining: ${remaining.toFixed(4)} USDC. Reset in Settings.`,
      };
    }
    return { ok: true };
  }, []);

  const remaining = (() => {
    const limit = getBudgetLimit();
    if (limit === null) return null;
    return Math.max(0, limit - getSpent());
  })();

  return { checkBudget, spendBudget, remaining, limit: getBudgetLimit() };
}

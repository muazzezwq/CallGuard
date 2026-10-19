/* Side-by-side comparison shared by the Marketplace and Rankings panels.

   Every cell is a real value from the registry or the subgraph, and "best" is
   only marked where the direction is unambiguous: highest score, lowest price,
   shortest response window. Money is compared as BigInt so amounts above 2^53
   keep their order. Rows without a value show "—" instead of a zero. */

import { Button, Modal, Table, Td, Th, Tr } from "../../ui";
import {
  countLabel, honorRate, reputationScore, usdcCompact, usdcExact, usdcFromInput,
  type ProviderRow,
} from "./providerMetrics";

type CompareRow = {
  label: string;
  value: (p: ProviderRow) => string;
  best?: (rows: ProviderRow[]) => string | null;
};

const ROWS: CompareRow[] = [
  {
    label: "Registry score",
    value: p => `${reputationScore(p.completedCalls, p.slashedCalls)}/100`,
    best: rows => `${Math.max(...rows.map(p => reputationScore(p.completedCalls, p.slashedCalls)))}/100`,
  },
  {
    label: "Price / call",
    value: p => `${usdcExact(p.pricePerCall) ?? "—"} USDC`,
    best: rows => {
      let min: bigint | null = null;
      for (const p of rows) {
        const v = usdcFromInput(usdcExact(p.pricePerCall) ?? "");
        if (v !== null && (min === null || v < min)) min = v;
      }
      return min === null ? null : `${usdcExact(min)} USDC`;
    },
  },
  {
    label: "Response window",
    value: p => (typeof p.maxResponseTime === "number" ? `${p.maxResponseTime}s` : "not readable"),
    best: rows => {
      const v = rows.map(p => p.maxResponseTime).filter((n): n is number => typeof n === "number");
      return v.length ? `${Math.min(...v)}s` : null;
    },
  },
  {
    label: "Slash on miss",
    value: p => (typeof p.slashBps === "number" ? `${(p.slashBps / 100).toFixed(2)}% of stake` : "not readable"),
    best: rows => {
      const v = rows.map(p => p.slashBps).filter((n): n is number => typeof n === "number");
      return v.length ? `${(Math.min(...v) / 100).toFixed(2)}% of stake` : null;
    },
  },
  {
    label: "Stake",
    value: p => `${usdcCompact(p.stake) ?? "—"} USDC`,
  },
  {
    label: "Completed",
    value: p => countLabel(p.completedCalls),
  },
  {
    label: "Slashed",
    value: p => countLabel(p.slashedCalls),
  },
  {
    label: "Honor rate",
    value: p => {
      const h = honorRate(p.completedCalls, p.slashedCalls);
      return h === null ? "no settled calls" : `${h}% of ${p.completedCalls + p.slashedCalls}`;
    },
  },
  { label: "Status", value: p => (p.active ? "Active" : "Inactive") },
];

export function ProviderCompareModal({ providers, onClose, onCall }: {
  providers: ProviderRow[];
  onClose: () => void;
  onCall: (p: ProviderRow) => void;
}) {
  return (
    <Modal open onClose={onClose} title="Compare providers">
      <p className="cmp-intro">
        {providers.length} providers · registry record and indexed call counts.
        The best value in each comparable row is marked; unavailable values stay
        unavailable.
      </p>
      <Table className="cmp-table">
        <thead>
          <tr>
            <Th scope="col" className="cmp-th-lbl">Metric</Th>
            {providers.map(p => (
              <Th key={p.id} scope="col" className="cmp-th">#{p.id}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map(row => {
            const best = row.best?.(providers) ?? null;
            return (
              <Tr key={row.label}>
                <Td className="cmp-td-lbl">{row.label}</Td>
                {providers.map(p => {
                  const v = row.value(p);
                  const isBest = best !== null && v === best;
                  return (
                    <Td key={p.id} mono className={isBest ? "cmp-td-best" : undefined}>
                      {isBest ? <span className="visually-hidden">Best: </span> : null}
                      {v}
                    </Td>
                  );
                })}
              </Tr>
            );
          })}
        </tbody>
      </Table>
      <div className="cmp-actions">
        {providers.map(p => (
          <Button key={p.id} size="sm" onClick={() => { onCall(p); onClose(); }} disabled={!p.active}>
            Call #{p.id}
          </Button>
        ))}
      </div>
    </Modal>
  );
}

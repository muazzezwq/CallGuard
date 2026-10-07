// Mini reputation bar sparkline — matches original HTML .rep-sparkline / .rep-bar
interface RepBarsProps {
  completed: number;
  slashed: number;
  bars?: number;
}

export default function RepBars({ completed, slashed, bars = 8 }: RepBarsProps) {
  const total = completed + slashed;
  const points = Array.from({ length: bars }, (_, i) => {
    // Simulate historical trend: earlier bars use lower divisor
    const frac = Math.max(0.1, Math.min(1, (completed + 2) / Math.max(1, total + 3 - (bars - 1 - i))));
    return frac;
  });

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 32 }}>
      {points.map((frac, i) => {
        const h = Math.round(frac * 32);
        const color = frac >= 0.8 ? "var(--accent)" : frac >= 0.5 ? "var(--warn)" : "var(--danger)";
        return (
          <div
            key={i}
            title={`rep ~${Math.round(frac * 100)}`}
            style={{
              width: 6,
              height: h,
              borderRadius: 2,
              background: color,
              opacity: 0.5 + frac * 0.5,
              transition: "height 0.3s ease",
            }}
          />
        );
      })}
    </div>
  );
}

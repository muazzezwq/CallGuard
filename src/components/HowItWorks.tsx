import { motion } from "framer-motion";
import { clsx } from "clsx";

const scenarios = [
  {
    badge: "✓ Happy Path",
    badgeClass: "bg-accent/10 text-accent border-accent/20",
    title: "Provider honors the SLA",
    lead: "The common case. Provider responds in time, gets paid, reputation goes up.",
    icon: "✓",
    iconColor: "text-accent/10",
    borderColor: "border-l-accent/30",
    steps: [
      { arrow: "1", text: "Caller opens a call and escrows 1 USDC in the contract." },
      { arrow: "2", text: "Provider delivers the response off-chain within the SLA window." },
      { arrow: "3", text: "Provider signs a receipt and calls submitReceipt()." },
      { arrow: "→", text: "Escrow released to provider. +1 USDC earned. Reputation +1.", highlight: "green" },
    ],
  },
  {
    badge: "✕ Timeout",
    badgeClass: "bg-red-500/10 text-red-400 border-red-500/20",
    title: "Provider misses the deadline",
    lead: "No response in time? The caller gets paid back, and the provider loses stake.",
    icon: "✕",
    iconColor: "text-red-400/10",
    borderColor: "border-l-red-500/30",
    steps: [
      { arrow: "1", text: "Caller opens a call, escrows 1 USDC, waits." },
      { arrow: "2", text: "Provider does not deliver within the SLA window." },
      { arrow: "3", text: "Anyone calls claimTimeout() after the deadline." },
      { arrow: "→", text: "Caller gets 1 USDC refund + 20% of provider's stake. Provider slashed.", highlight: "red" },
    ],
  },
  {
    badge: "★ Reputation",
    badgeClass: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    title: "Track record, on-chain",
    lead: "Every honored call and every slash is counted in the contract. Readable by anyone.",
    icon: "★",
    iconColor: "text-blue-400/10",
    borderColor: "border-l-blue-500/30",
    steps: [
      { arrow: "·", text: "Fresh provider: 66 (neither trusted nor distrusted)" },
      { arrow: "·", text: "After 1 honored call: 75" },
      { arrow: "·", text: "After 10 honored calls: 92" },
      { arrow: "→", text: "Formula: (completed + 2) / (total + 3) × 100 — Bayesian.", highlight: "blue" },
    ],
  },
  {
    badge: "⚡ v4",
    badgeClass: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    title: "Composable payment rails",
    lead: "Five payment paths: x402, CCTP, EIP-3009, NFT identity, Circle Gateway.",
    icon: "⚡",
    iconColor: "text-purple-400/10",
    borderColor: "border-l-purple-500/30",
    steps: [
      { arrow: "·", text: "x402 — agents pay via HTTP 402; callService() fires on payment." },
      { arrow: "·", text: "CCTP — pay from Ethereum, Base or Polygon via Circle Bridge." },
      { arrow: "·", text: "Gateway Nanopayments — gasless 0.001 USDC micro-payments." },
      { arrow: "→", text: "Every path ends the same: staked USDC, signed receipt, slash on timeout.", highlight: "purple" },
    ],
  },
];

const highlightColors: Record<string, string> = {
  green: "text-accent",
  red: "text-red-400",
  blue: "text-blue-400",
  purple: "text-purple-400",
};

export function HowItWorks() {
  return (
    <section className="max-w-6xl mx-auto px-5 mt-20">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-12"
      >
        <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">How it works</h2>
        <p className="text-white/40 max-w-xl mx-auto text-sm leading-relaxed">
          Four scenarios that cover the full lifecycle. Read them before you touch a button.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {scenarios.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className={clsx(
              "relative glass rounded-2xl p-6 border-l-2 border border-white/[0.06] overflow-hidden",
              s.borderColor
            )}
          >
            {/* Background icon */}
            <div className={clsx("absolute top-4 right-5 text-7xl font-black pointer-events-none select-none", s.iconColor)}>
              {s.icon}
            </div>

            <span className={clsx("inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border uppercase tracking-wider mb-4", s.badgeClass)}>
              {s.badge}
            </span>
            <h3 className="text-base font-semibold text-white mb-2">{s.title}</h3>
            <p className="text-sm text-white/40 mb-5 leading-relaxed">{s.lead}</p>

            <div className="space-y-2.5">
              {s.steps.map((step, j) => (
                <div key={j} className="flex gap-3 text-xs">
                  <span className={clsx("mono font-bold flex-shrink-0 w-4",
                    step.highlight ? highlightColors[step.highlight] : "text-white/20")}>
                    {step.arrow}
                  </span>
                  <span className={clsx(
                    step.highlight ? `font-semibold ${highlightColors[step.highlight]}` : "text-white/45",
                    "leading-relaxed"
                  )}>
                    {step.text}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

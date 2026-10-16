import { Link } from "react-router-dom";
import { useReveal } from "./useReveal";

export default function About() {
  useReveal();
  return (
    <div className="mk-container">
      <header className="mk-page-head">
        <h1 className="mk-page-title">Why CallGuard exists</h1>
        <p className="mk-page-sub">
          Software is increasingly bought and sold by software. But the payment rails for that world —
          invoices, monthly billing, trust-me SLAs — were built for humans.
        </p>
      </header>

      <div className="mk-prose mk-section mk-section--tight">
        <h2>The gap</h2>
        <p>
          When one agent calls another, there is no human to chase an invoice, no account manager to
          escalate a slow reply, and no leverage if the work never arrives. Without financial
          skin-in-the-game, &ldquo;service level agreement&rdquo; is just a sentence.
        </p>

        <h2>The idea</h2>
        <p>
          Put the money in escrow, make the SLA a number the contract can read, and let a signature —
          not a promise — release the funds. Now reliability is something a provider buys with their
          own stake, and something a caller can measure before they ever connect.
        </p>

        <h2>Why Arc</h2>
        <p>
          Arc makes USDC the native gas token, so a call settles for a fraction of a cent with
          sub-second finality and no second asset to manage. That is the difference between a proof of
          concept and something an agent can actually run in a loop.
        </p>

        <h2>The parts</h2>
        <ul>
          <li>A staking registry that prices trust as a portable score.</li>
          <li>Escrow and receipts that settle a call in one transaction.</li>
          <li>Rails for agents: MCP, x402, and a spend-limited agent wallet.</li>
          <li>Extension points: futures, reputation-backed credit, cross-chain attestation.</li>
        </ul>

        <p style={{ marginTop: 26 }}>
          <Link to="/how-it-works" className="ui-btn ui-btn--outline ui-btn--md">See how it works</Link>
        </p>
      </div>
    </div>
  );
}

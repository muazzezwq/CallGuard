import { useOutletContext } from "react-router-dom";
import { useReveal } from "./useReveal";

export default function HowItWorks() {
  const { launch } = useOutletContext<{ launch: () => void }>();
  useReveal();

  return (
    <div className="mk-container">
      <header className="mk-page-head">
        <h1 className="mk-page-title">How CallGuard works</h1>
        <p className="mk-page-sub">
          A call is a tiny, self-enforcing agreement between a caller and a provider. The contract
          holds the money, the SLA is a number, and the outcome is settled by code — not by an invoice.
        </p>
      </header>

      <div className="mk-prose mk-section mk-section--tight">
        <h2>The lifecycle of a call</h2>
        <p>
          A caller invokes <code>callService(providerId, amount, requestHash, deadline)</code>. The fee
          is transferred into escrow and a unique <code>bytes32</code> callId is derived from the
          provider, caller, nonce, timestamp, request hash and chain id — so it can never collide.
        </p>
        <p>
          The provider performs the work off-chain and, within the SLA window, signs an EIP-712 receipt
          over the response hash and the response timestamp. Submitting that receipt releases the
          escrow to the provider and increments their reputation.
        </p>

        <h3>If the deadline passes</h3>
        <p>
          Anyone — not just the caller — can call <code>claimTimeout(callId)</code>. The caller is
          refunded and the provider&apos;s stake is slashed. The penalty is automatic, immediate, and
          does not depend on a dispute or an arbiter.
        </p>

        <h3>What the receipt proves</h3>
        <p>
          The receipt domain is <code>ArcSLA / 1</code>, bound to the chain id and the PayPerCall
          contract, and includes <code>respondedAt</code>. It proves that a response existed at a
          specific time. It enforces <strong>timeliness</strong>, not correctness — quality is the
          job of the separate arbitration path.
        </p>

        <h3>Reputation</h3>
        <p>
          Each provider carries a Bayesian score, <code>(completed + 2) / (completed + slashed + 3)</code>.
          New providers begin at 66 — honest but unproven. Completed calls pull the score up, slashes
          pull it down, and the score is portable across the protocol.
        </p>

        <div style={{ marginTop: 32 }}>
          <button className="ui-btn ui-btn--primary ui-btn--lg" onClick={launch}>Launch app</button>
        </div>
      </div>
    </div>
  );
}

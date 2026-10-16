import { useReveal } from "./useReveal";

export default function Security() {
  useReveal();
  return (
    <div className="mk-container">
      <header className="mk-page-head">
        <h1 className="mk-page-title">Security &amp; trust model</h1>
        <p className="mk-page-sub">
          CallGuard is deliberately honest about what it guarantees and what it does not. Read this
          before staking real value.
        </p>
      </header>

      <div className="mk-prose mk-section mk-section--tight">
        <h2>What the protocol enforces</h2>
        <ul>
          <li><strong>Timeliness.</strong> A signed EIP-712 receipt with a <code>respondedAt</code> timestamp proves a response existed within the SLA window. Miss it and the stake is slashed.</li>
          <li><strong>Payment guarantee.</strong> Fees are escrowed at call time, so a provider cannot be left unpaid and a caller cannot be left refunded-late.</li>
          <li><strong>Open timeout.</strong> The slash path is permissionless — no arbiter, no support ticket, no human delay.</li>
        </ul>

        <h2>What it does not</h2>
        <ul>
          <li><strong>Correctness.</strong> A receipt proves a response happened, not that it was good. Quality is handled by a separate arbitration path.</li>
          <li><strong>Custody.</strong> CallGuard never holds keys. Escrow is a contract; funds move only by the rules above.</li>
          <li><strong>Mainnet safety.</strong> This deployment is on Arc <em>Testnet</em>. Treat it as adversarial practice, not production value.</li>
        </ul>

        <h2>Key handling</h2>
        <p>
          A provider has two keys: a cold <code>owner</code> (multisig or hardware) and a hot{" "}
          <code>signer</code> used to answer calls. The owner can rotate the signer or unstake; the
          signer can only sign receipts. Pending calls block unstaking, so a provider cannot exit
          mid-flight.
        </p>

        <h2>Best-effort integrations</h2>
        <p>
          Writes to the ERC-8004 reputation registry and the ERC-8183 agentic-commerce hook are
          best-effort: a revert there does not fail a <code>submitReceipt</code> or an{" "}
          <code>agentCall</code>. The core settlement path stays intact even if those systems degrade.
        </p>

        <h2>Verify it yourself</h2>
        <p>
          Every contract address on this site links to ArcScan. The subgraph is public. There is no
          hidden state — if this page claims something, you can check it on-chain.
        </p>
      </div>
    </div>
  );
}

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
          <li><strong>Correctness.</strong> A receipt proves a response happened, not that it was good. A dispute can bind evidence about a call, but the verdict is the arbiter&apos;s, not the contract&apos;s.</li>
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

        <h2>Integrations that are not wired</h2>
        <p>
          This page used to describe ERC-8004 reputation writes and an ERC-8183 hook around
          settlement. Neither runs on the v8 contracts: <code>PayPerCallV8</code> exposes no setter
          for either, and the v7 addresses those calls used read back as the zero address, so no
          ERC-8004 record is ever written and no ERC-8183 hook is ever called from the call
          lifecycle.
        </p>
        <p>
          The ERC-8183 reference contract is deployed and a panel in the app drives it directly,
          but it is a separate job flow with its own escrow. It is not part of how a CallGuard call
          is bought, settled or slashed — nothing here depends on it.
        </p>

        <h2>Disputes and evidence</h2>
        <p>
          A completed call can be disputed in <code>DisputeV4</code>, which escrows a bond and reads
          the evidence anchored in <code>SLAEvidenceRegistryV2</code>. Two kinds are anchored today:
          <code>zk-execution</code>, a RISC Zero receipt that binds the committed response to the
          call, and <code>witness</code>, a provenance record of the bytes a key saw. Evidence is
          additive: it never changes a bond, a window, <code>disputeSlashBps</code> or a verdict.
          The <code>tee-attestation</code> kind has no verifier configured, so it cannot be anchored
          at all.
        </p>

        <h2>Verify it yourself</h2>
        <p>
          Every contract address on this site links to the Arc explorer. The subgraph is public.
          There is no hidden state — if this page claims something, you can check it on-chain.
        </p>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { parseUnits, keccak256, toHex } from "viem";
import { CheckCircle } from "lucide-react";
// MEDIUM-09: import USDC_ABI from config
import { CONFIG, USDC_ABI } from "../../lib/config";
import { errText } from "../../lib/utils";
import { Button, Field, Input, PageHeader, Textarea } from "../../ui";
import { KeyValue, PanelShell, PanelSource, PanelSplit, StatusNotice } from "../panel/PanelUi";

const JOBS_ABI = [
  { name: "createJob", type: "function", inputs: [{ name: "provider", type: "address" }, { name: "client", type: "address" }, { name: "expiredAt", type: "uint256" }, { name: "description", type: "string" }, { name: "evaluator", type: "address" }], outputs: [{ name: "jobId", type: "uint256" }], stateMutability: "nonpayable" },
  { name: "setBudget", type: "function", inputs: [{ name: "jobId", type: "uint256" }, { name: "budget", type: "uint256" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { name: "fund", type: "function", inputs: [{ name: "jobId", type: "uint256" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { name: "submit", type: "function", inputs: [{ name: "jobId", type: "uint256" }, { name: "deliverableHash", type: "bytes32" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { name: "complete", type: "function", inputs: [{ name: "jobId", type: "uint256" }, { name: "reasonHash", type: "bytes32" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { name: "cancel", type: "function", inputs: [{ name: "jobId", type: "uint256" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { name: "getJob", type: "function", inputs: [{ name: "jobId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "provider", type: "address" }, { name: "client", type: "address" }, { name: "budget", type: "uint256" }, { name: "status", type: "uint8" }] }], stateMutability: "view" },
  { name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
  { name: "allowance", type: "function", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
] as const;

const STEPS = ["Create Job", "Set Budget", "Fund Escrow", "Submit Work", "Complete & Pay", "Done"];

export default function Jobs() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [step, setStep] = useState(0);
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);

  // Form fields
  const [providerAddr, setProviderAddr] = useState("");
  const [description, setDescription] = useState("");
  const [jobId, setJobId] = useState("");
  const [budget, setBudget] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [checkId, setCheckId] = useState("");
  const [checkResult, setCheckResult] = useState<{ error?: string; provider?: string; client?: string; budget?: string; status?: string } | null>(null);

  function log(msg: string) { setOutput(prev => prev + (prev ? "\n" : "") + msg); }
  function clearLog() { setOutput(""); }


  async function doCreateJob() {
    if (!walletClient || !address) { log("Connect wallet first"); return; }
    if (!providerAddr || !description) { log("Fill provider address and description"); return; }
    setLoading(true); clearLog();
    try {
      log("Creating job...");
      const expiredAt = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const hash = await walletClient.writeContract({
        address: CONFIG.agenticCommerce as `0x${string}`,
        abi: JOBS_ABI,
        functionName: "createJob",
        args: [providerAddr as `0x${string}`, address, expiredAt, description, "0x0000000000000000000000000000000000000000"],
      });
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      log(`✓ Job created\ntx: ${hash.slice(0, 12)}...\nBlock: ${receipt.blockNumber}\n\nNext: set a budget for this job.`);
      setStep(1);
    } catch (_err: unknown) {
      log("Error: " + (_err instanceof Error ? _err.message : String(_err)));
    }
    setLoading(false);
  }

  async function doSetBudget() {
    if (!walletClient || !address) { log("Connect wallet first"); return; }
    if (!jobId || !budget) { log("Enter Job ID and budget amount"); return; }
    setLoading(true); clearLog();
    try {
      log(`Setting budget for job #${jobId}...`);
      const amount = parseUnits(budget, 6);
      const hash = await walletClient.writeContract({
        address: CONFIG.agenticCommerce as `0x${string}`,
        abi: JOBS_ABI,
        functionName: "setBudget",
        args: [BigInt(jobId), amount, "0x"],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      log(`✓ Budget set — ${budget} USDC for job #${jobId}\ntx: ${hash.slice(0, 12)}...\n\nNext: fund the escrow.`);
      setStep(2);
    } catch (_err: unknown) {
      log("Error: " + (_err instanceof Error ? _err.message : String(_err)));
    }
    setLoading(false);
  }

  async function doFundJob() {
    if (!walletClient || !address) { log("Connect wallet first"); return; }
    if (!jobId) { log("Enter Job ID"); return; }
    setLoading(true); clearLog();
    try {
      log(`Checking USDC allowance...`);
      const allowance = await publicClient!.readContract({
        address: CONFIG.usdcAddress as `0x${string}`,
        abi: USDC_ABI,
        functionName: "allowance",
        args: [address, CONFIG.agenticCommerce as `0x${string}`],
      });
      const needed = parseUnits("1000", 6);
      if ((allowance as bigint) < needed) {
        log("Approving USDC...");
        const appHash = await walletClient.writeContract({
          address: CONFIG.usdcAddress as `0x${string}`,
          abi: USDC_ABI,
          functionName: "approve",
          args: [CONFIG.agenticCommerce as `0x${string}`, BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935")],
        });
        await publicClient!.waitForTransactionReceipt({ hash: appHash });
        log("✓ USDC approved");
      }
      log(`Funding job #${jobId}...`);
      const hash = await walletClient.writeContract({
        address: CONFIG.agenticCommerce as `0x${string}`,
        abi: JOBS_ABI,
        functionName: "fund",
        args: [BigInt(jobId), "0x"],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      log(`✓ Escrow funded for job #${jobId}\ntx: ${hash.slice(0, 12)}...\n\nNext: provider submits deliverable.`);
      setStep(3);
    } catch (_err: unknown) {
      log("Error: " + (_err instanceof Error ? _err.message : String(_err)));
    }
    setLoading(false);
  }

  async function doSubmitJob() {
    if (!walletClient || !address) { log("Connect wallet first"); return; }
    if (!jobId) { log("Enter Job ID"); return; }
    setLoading(true); clearLog();
    try {
      log(`Submitting deliverable for job #${jobId}...`);
      const payload = deliverable || "deliverable";
      const deliverableHash = keccak256(toHex(payload)) as `0x${string}`;
      const hash = await walletClient.writeContract({
        address: CONFIG.agenticCommerce as `0x${string}`,
        abi: JOBS_ABI,
        functionName: "submit",
        args: [BigInt(jobId), deliverableHash, "0x"],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      log(`✓ Deliverable submitted for job #${jobId}\nhash: ${deliverableHash.slice(0, 12)}...\ntx: ${hash.slice(0, 12)}...\n\nNext: evaluator approves and settles.`);
      setStep(4);
    } catch (_err: unknown) {
      log("Error: " + (_err instanceof Error ? _err.message : String(_err)));
    }
    setLoading(false);
  }

  async function doCompleteJob() {
    if (!walletClient || !address) { log("Connect wallet first"); return; }
    if (!jobId) { log("Enter Job ID"); return; }
    setLoading(true); clearLog();
    try {
      log(`Completing job #${jobId}...`);
      const reasonHash = keccak256(toHex("work-delivered-and-approved")) as `0x${string}`;
      const hash = await walletClient.writeContract({
        address: CONFIG.agenticCommerce as `0x${string}`,
        abi: JOBS_ABI,
        functionName: "complete",
        args: [BigInt(jobId), reasonHash, "0x"],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      log(`✓ Job #${jobId} completed and settled!\ntx: ${hash.slice(0, 12)}...\n\nUSDC released to provider.`);
      setStep(5);
    } catch (_err: unknown) {
      log("Error: " + (_err instanceof Error ? _err.message : String(_err)));
    }
    setLoading(false);
  }

  async function doCancelJob() {
    if (!walletClient || !address || !jobId) { log("Connect wallet and enter Job ID"); return; }
    setLoading(true); clearLog();
    try {
      log(`Cancelling job #${jobId}...`);
      const hash = await walletClient.writeContract({
        address: CONFIG.agenticCommerce as `0x${string}`,
        abi: JOBS_ABI,
        functionName: "cancel",
        args: [BigInt(jobId), "0x"],
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      log(`✓ Job #${jobId} cancelled\ntx: ${hash.slice(0, 12)}...`);
    } catch (_err: unknown) {
      log("Error: " + (_err instanceof Error ? _err.message : String(_err)));
    }
    setLoading(false);
  }

  // `getJob(uint256)` is the reader the deployed ERC-8183 reference contract actually
  // answers; `doCheckJob(uint256)` reverts on Arc Testnet, so the panel used to show
  // "Check failed" for every job that existed.
  async function doReadJob() {
    if (!publicClient || !checkId) { setCheckResult({ error: "Enter a job ID" }); return; }
    try {
      const result = await publicClient.readContract({
        address: CONFIG.agenticCommerce as `0x${string}`,
        abi: JOBS_ABI,
        functionName: "getJob",
        args: [BigInt(checkId)],
      }) as { provider?: string; client?: string; budget?: bigint | string; status?: bigint | number };
      const statusNames = ["NONE", "CREATED", "FUNDED", "SUBMITTED", "COMPLETED", "CANCELLED"];
      setCheckResult({
        provider: result?.provider || "—",
        client: result?.client || "—",
        budget: result?.budget ? (Number(result.budget) / 1e6).toFixed(4) + " USDC" : "—",
        status: statusNames[Number(result?.status)] || "UNKNOWN",
      });
    } catch (_err: unknown) {
      setCheckResult({ error: errText(_err) });
    }
  }

  const stepContent = [
    // Step 0: Create
    <div key="create" className="pg-form">
      <Field label="Provider Address" htmlFor="jb-provider">
        <Input id="jb-provider" placeholder="0x... provider wallet address" value={providerAddr} onChange={e => setProviderAddr(e.target.value)} />
      </Field>
      <Field label="Job Description" htmlFor="jb-description">
        <Textarea id="jb-description" rows={3} placeholder="Describe the work to be done..." value={description} onChange={e => setDescription(e.target.value)} />
      </Field>
      <div className="pg-form__actions">
        <Button variant="primary" onClick={doCreateJob} disabled={loading || !address}>
          {loading ? "Creating..." : "Create Job →"}
        </Button>
      </div>
    </div>,

    // Step 1: Set Budget
    <div key="budget" className="pg-form">
      <Field label="Job ID" htmlFor="jb-id-budget">
        <Input id="jb-id-budget" placeholder="Job ID (from step 1)" value={jobId} onChange={e => setJobId(e.target.value)} />
      </Field>
      <Field label="Budget (USDC)" htmlFor="jb-budget">
        <Input id="jb-budget" placeholder="e.g. 10" type="number" step="0.01" value={budget} onChange={e => setBudget(e.target.value)} />
      </Field>
      <div className="pg-form__actions">
        <Button variant="primary" onClick={doSetBudget} disabled={loading || !address}>
          {loading ? "Setting..." : "Set Budget →"}
        </Button>
      </div>
    </div>,

    // Step 2: Fund
    <div key="fund" className="pg-form">
      <Field label="Job ID" htmlFor="jb-id-fund">
        <Input id="jb-id-fund" placeholder="Job ID" value={jobId} onChange={e => setJobId(e.target.value)} />
      </Field>
      <p className="pg-copy pg-copy--tight">
        This will approve USDC (if needed) and fund the job escrow.
      </p>
      <div className="pg-form__actions">
        <Button variant="primary" onClick={doFundJob} disabled={loading || !address}>
          {loading ? "Funding..." : "Fund Escrow →"}
        </Button>
      </div>
    </div>,

    // Step 3: Submit
    <div key="submit" className="pg-form">
      <Field label="Job ID" htmlFor="jb-id-submit">
        <Input id="jb-id-submit" placeholder="Job ID" value={jobId} onChange={e => setJobId(e.target.value)} />
      </Field>
      <Field label="Deliverable (hashed on-chain)" htmlFor="jb-deliverable">
        <Textarea id="jb-deliverable" rows={3} placeholder="Deliverable content or IPFS hash..." value={deliverable} onChange={e => setDeliverable(e.target.value)} />
      </Field>
      <div className="pg-form__actions">
        <Button variant="primary" onClick={doSubmitJob} disabled={loading || !address}>
          {loading ? "Submitting..." : "Submit Deliverable →"}
        </Button>
      </div>
    </div>,

    // Step 4: Complete
    <div key="complete" className="pg-form">
      <Field label="Job ID" htmlFor="jb-id-complete">
        <Input id="jb-id-complete" placeholder="Job ID" value={jobId} onChange={e => setJobId(e.target.value)} />
      </Field>
      <StatusNotice tone="success" title="Final step:">
        Marks the job complete and releases USDC to the provider. Only the evaluator or client can call this.
      </StatusNotice>
      <div className="pg-form__actions">
        <Button variant="primary" onClick={doCompleteJob} disabled={loading || !address}>
          {loading ? "Completing..." : "Complete & Pay →"}
        </Button>
        <Button variant="secondary" onClick={doCancelJob} disabled={loading}>
          Cancel Job
        </Button>
      </div>
    </div>,

    // Step 5: Done
    <div key="done" style={{ textAlign: "center", padding: "var(--sp-6)" }}>
      <CheckCircle size={40} color="var(--accent)" style={{ display: "block", margin: "0 auto var(--sp-3)" }} />
      <div style={{ fontSize: "var(--fs-xl)", fontWeight: "var(--fw-bold)", color: "var(--accent-ink)", marginBottom: "var(--sp-2)" }}>Job Complete!</div>
      <div style={{ fontSize: "var(--fs-base)", color: "var(--text-dim)", marginBottom: "var(--sp-4)" }}>USDC has been released to the provider.</div>
      <Button
        variant="primary"
        onClick={() => { setStep(0); clearLog(); setJobId(""); setProviderAddr(""); setDescription(""); }}
      >
        Create Another Job
      </Button>
    </div>,
  ];

  return (
    <PanelShell>
      <PageHeader
        eyebrow="Claims & Jobs"
        title="ERC-8183 Agentic Commerce"
        subtitle="Trustless job settlement — client locks USDC, provider delivers, evaluator approves, contract pays automatically."
      />
      <StatusNotice tone="info" title="Separate from the SLA lifecycle">
        This drives the ERC-8183 reference contract directly. It does not open a PayPerCall call,
        and no SLA, receipt or slash applies to a job here.
      </StatusNotice>
      <PanelSource
        label="AgenticCommerce"
        value="reads on demand"
        hint="no job list index"
        state="idle"
      />

      <div className="pg-stages" role="group" aria-label="Job stages">
        {STEPS.map((label, i) => (
          <div className="pg-stage-wrap" key={label}>
            <button
              type="button"
              className={`pg-stage${i < step ? " is-done" : ""}${i === step ? " is-current" : ""}`}
              disabled={i > step}
              aria-current={i === step ? "step" : undefined}
              onClick={() => setStep(i)}
            >
              <span className="pg-stage__dot" aria-hidden="true">{i < step ? "✓" : i + 1}</span>
              <span className="pg-stage__label">{label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <span className={`pg-stage__line${i < step ? " is-done" : ""}`} aria-hidden="true" />
            )}
          </div>
        ))}
      </div>

      <PanelSplit
        main={(
          <>
            <section className="ui-section">
              <div className="ui-section__head">
                <h2 className="ui-section__title">{STEPS[step]}</h2>
              </div>
              <div className="ui-section__body">
                {stepContent[step]}
                {output && <pre className="pg-output" aria-live="polite">{output}</pre>}
              </div>
            </section>

            <section className="ui-section pg-section--spaced">
              <div className="ui-section__head">
                <h2 className="ui-section__title">Check Job Status</h2>
              </div>
              <div className="ui-section__body">
                <div className="pg-inline-form">
                  <Field className="pg-inline-form__field" label="Job ID" htmlFor="jb-check">
                    <Input id="jb-check" placeholder="Job ID" value={checkId} onChange={e => setCheckId(e.target.value)} />
                  </Field>
                  <Button variant="primary" onClick={doReadJob}>Check →</Button>
                </div>
                {checkResult && (
                  checkResult.error ? (
                    <div className="pg-section--spaced">
                      <StatusNotice tone="danger" title="Check failed">{checkResult.error}</StatusNotice>
                    </div>
                  ) : (
                    <div className="pg-section--spaced">
                      <KeyValue
                        rows={Object.entries(checkResult).map(([k, v]) => ({
                          label: k.charAt(0).toUpperCase() + k.slice(1),
                          value: String(v),
                          mono: k === "provider" || k === "client",
                        }))}
                      />
                    </div>
                  )
                )}
              </div>
            </section>
          </>
        )}
        rail={(
          <>
            <KeyValue
              label="Deployment"
              rows={[
                { label: "Contract", value: "AgenticCommerce" },
                {
                  label: "Address",
                  value: (
                    <a
                      className="pg-rowlink pg-mono"
                      href={`https://explorer.testnet.arc.io/address/${CONFIG.agenticCommerce}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {CONFIG.agenticCommerce.slice(0, 10)}…{CONFIG.agenticCommerce.slice(-6)}
                    </a>
                  ),
                },
                { label: "Network", value: "Arc Testnet" },
                { label: "Token", value: "USDC · 6 decimals" },
                { label: "Writes", value: "createJob · setBudget · fund · submit · complete · cancel", mono: true },
              ]}
            />
            <KeyValue
              label="How ERC-8183 Jobs Work"
              rows={[
                { label: "1. Create", value: "Client creates a job specifying provider address, description, and expiry." },
                { label: "2. Budget", value: "Provider or client sets the USDC budget for the work." },
                { label: "3. Fund", value: "Client approves + deposits USDC into the job escrow contract." },
                { label: "4. Submit", value: "Provider delivers work and submits a hash of the deliverable." },
                { label: "5. Complete", value: "Evaluator (or client) approves — USDC is automatically released to provider." },
              ]}
            />
          </>
        )}
      />
    </PanelShell>
  );
}

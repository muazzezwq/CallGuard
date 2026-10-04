import { useState } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { parseUnits, keccak256, toHex, encodeFunctionData } from "viem";
import { CONFIG } from "../../lib/config";
import { CheckCircle, ChevronRight, AlertTriangle } from "lucide-react";

const JOBS_ABI = [
  { name: "createJob", type: "function", inputs: [{ name: "provider", type: "address" }, { name: "client", type: "address" }, { name: "expiredAt", type: "uint256" }, { name: "description", type: "string" }, { name: "evaluator", type: "address" }], outputs: [{ name: "jobId", type: "uint256" }], stateMutability: "nonpayable" },
  { name: "setBudget", type: "function", inputs: [{ name: "jobId", type: "uint256" }, { name: "budget", type: "uint256" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { name: "fund", type: "function", inputs: [{ name: "jobId", type: "uint256" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { name: "submit", type: "function", inputs: [{ name: "jobId", type: "uint256" }, { name: "deliverableHash", type: "bytes32" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { name: "complete", type: "function", inputs: [{ name: "jobId", type: "uint256" }, { name: "reasonHash", type: "bytes32" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { name: "cancel", type: "function", inputs: [{ name: "jobId", type: "uint256" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
  { name: "doCheckJob", type: "function", inputs: [{ name: "jobId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "provider", type: "address" }, { name: "client", type: "address" }, { name: "budget", type: "uint256" }, { name: "status", type: "uint8" }] }], stateMutability: "view" },
  { name: "getJob", type: "function", inputs: [{ name: "jobId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "provider", type: "address" }, { name: "client", type: "address" }, { name: "budget", type: "uint256" }, { name: "status", type: "uint8" }] }], stateMutability: "view" },
  { name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
  { name: "allowance", type: "function", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
] as const;

const USDC_ABI = [
  { name: "allowance", type: "function", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
] as const;

const STEPS = ["Create Job", "Set Budget", "Fund Escrow", "Submit Work", "Complete & Pay", "Done"];

const s: Record<string, React.CSSProperties> = {
  page: { padding: "20px 16px", maxWidth: 720, margin: "0 auto" },
  h1: { fontSize: 20, fontWeight: 700, color: "var(--text)", margin: "0 0 4px", fontFamily: "var(--font-display)" },
  sub: { fontSize: 13, color: "var(--text-dim)", margin: "0 0 20px" },
  card: { background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.07em", color: "var(--text-faint)", fontWeight: 600, marginBottom: 12 },
  label: { fontSize: 12, color: "var(--text-dim)", marginBottom: 5, display: "block" },
  input: { width: "100%", background: "var(--bg-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", color: "var(--text)", fontSize: 13, boxSizing: "border-box" as const },
  btn: { background: "var(--accent)", color: "#000", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  btnSecondary: { background: "var(--bg-3)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontWeight: 600, fontSize: 12, cursor: "pointer" },
  output: { background: "var(--bg-0)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 11, color: "var(--accent)", fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap" as const, minHeight: 60, marginTop: 10 },
};

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
  const [checkResult, setCheckResult] = useState<any>(null);

  function log(msg: string) { setOutput(prev => prev + (prev ? "\n" : "") + msg); }
  function clearLog() { setOutput(""); }

  function txLink(hash: string) { return `https://explorer.testnet.arc.io/tx/${hash}`; }

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
    } catch (e: any) {
      log("Error: " + (e.shortMessage || e.message));
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
    } catch (e: any) {
      log("Error: " + (e.shortMessage || e.message));
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
    } catch (e: any) {
      log("Error: " + (e.shortMessage || e.message));
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
    } catch (e: any) {
      log("Error: " + (e.shortMessage || e.message));
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
    } catch (e: any) {
      log("Error: " + (e.shortMessage || e.message));
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
    } catch (e: any) {
      log("Error: " + (e.shortMessage || e.message));
    }
    setLoading(false);
  }

  async function doCheckJob() {
    if (!publicClient || !checkId) { setCheckResult({ error: "Enter a job ID" }); return; }
    try {
      const result = await publicClient.readContract({
        address: CONFIG.agenticCommerce as `0x${string}`,
        abi: JOBS_ABI,
        functionName: "doCheckJob",
        args: [BigInt(checkId)],
      }) as any;
      const statusNames = ["NONE", "CREATED", "FUNDED", "SUBMITTED", "COMPLETED", "CANCELLED"];
      setCheckResult({
        provider: result?.provider || "—",
        client: result?.client || "—",
        budget: result?.budget ? (Number(result.budget) / 1e6).toFixed(4) + " USDC" : "—",
        status: statusNames[Number(result?.status)] || "UNKNOWN",
      });
    } catch (e: any) {
      setCheckResult({ error: e.shortMessage || e.message });
    }
  }

  const stepContent = [
    // Step 0: Create
    <div key="create">
      <label style={s.label}>Provider Address</label>
      <input style={{ ...s.input, marginBottom: 10 }} placeholder="0x... provider wallet address" value={providerAddr} onChange={e => setProviderAddr(e.target.value)} />
      <label style={s.label}>Job Description</label>
      <textarea style={{ ...s.input, minHeight: 70, resize: "vertical" as const }} placeholder="Describe the work to be done..." value={description} onChange={e => setDescription(e.target.value)} />
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button style={s.btn} onClick={doCreateJob} disabled={loading || !address}>
          {loading ? "Creating..." : "Create Job →"}
        </button>
      </div>
    </div>,

    // Step 1: Set Budget
    <div key="budget">
      <label style={s.label}>Job ID</label>
      <input style={{ ...s.input, marginBottom: 10 }} placeholder="Job ID (from step 1)" value={jobId} onChange={e => setJobId(e.target.value)} />
      <label style={s.label}>Budget (USDC)</label>
      <input style={{ ...s.input, marginBottom: 10 }} placeholder="e.g. 10" type="number" step="0.01" value={budget} onChange={e => setBudget(e.target.value)} />
      <button style={s.btn} onClick={doSetBudget} disabled={loading || !address}>
        {loading ? "Setting..." : "Set Budget →"}
      </button>
    </div>,

    // Step 2: Fund
    <div key="fund">
      <label style={s.label}>Job ID</label>
      <input style={{ ...s.input, marginBottom: 10 }} placeholder="Job ID" value={jobId} onChange={e => setJobId(e.target.value)} />
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
        This will approve USDC (if needed) and fund the job escrow.
      </div>
      <button style={s.btn} onClick={doFundJob} disabled={loading || !address}>
        {loading ? "Funding..." : "Fund Escrow →"}
      </button>
    </div>,

    // Step 3: Submit
    <div key="submit">
      <label style={s.label}>Job ID</label>
      <input style={{ ...s.input, marginBottom: 10 }} placeholder="Job ID" value={jobId} onChange={e => setJobId(e.target.value)} />
      <label style={s.label}>Deliverable (hashed on-chain)</label>
      <textarea style={{ ...s.input, minHeight: 60, resize: "vertical" as const, marginBottom: 10 }} placeholder="Deliverable content or IPFS hash..." value={deliverable} onChange={e => setDeliverable(e.target.value)} />
      <button style={s.btn} onClick={doSubmitJob} disabled={loading || !address}>
        {loading ? "Submitting..." : "Submit Deliverable →"}
      </button>
    </div>,

    // Step 4: Complete
    <div key="complete">
      <label style={s.label}>Job ID</label>
      <input style={{ ...s.input, marginBottom: 10 }} placeholder="Job ID" value={jobId} onChange={e => setJobId(e.target.value)} />
      <div style={{ padding: 12, background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.2)", borderRadius: 8, fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
        <strong style={{ color: "var(--accent)" }}>Final step:</strong> Marks the job complete and releases USDC to the provider. Only the evaluator or client can call this.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={s.btn} onClick={doCompleteJob} disabled={loading || !address}>
          {loading ? "Completing..." : "Complete & Pay →"}
        </button>
        <button style={s.btnSecondary} onClick={doCancelJob} disabled={loading}>
          Cancel Job
        </button>
      </div>
    </div>,

    // Step 5: Done
    <div key="done" style={{ textAlign: "center" as const, padding: 24 }}>
      <CheckCircle size={40} color="var(--accent)" style={{ marginBottom: 12 }} />
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)", marginBottom: 8 }}>Job Complete!</div>
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>USDC has been released to the provider.</div>
      <button style={s.btn} onClick={() => { setStep(0); clearLog(); setJobId(""); setProviderAddr(""); setDescription(""); }}>
        Create Another Job
      </button>
    </div>,
  ];

  return (
    <div style={s.page}>
      <div style={{ marginBottom: 16 }}>
        <div style={s.h1}>ERC-8183 Jobs</div>
        <div style={s.sub}>Trustless job settlement — client locks USDC, provider delivers, evaluator approves, contract pays.</div>
      </div>

      {/* Step Rail */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 20, overflowX: "auto" as const, gap: 0 }}>
        {STEPS.map((label, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{ cursor: i <= step ? "pointer" : "default", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 4 }}
              onClick={() => i <= step && setStep(i)}
            >
              <div style={{
                width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: i < step ? "var(--accent)" : i === step ? "var(--accent)" : "var(--bg-3)",
                border: i === step ? "2px solid var(--accent)" : "1px solid var(--border)",
                color: i <= step ? "#000" : "var(--text-dim)", fontSize: 12, fontWeight: 700,
              }}>
                {i < step ? "✓" : i + 1}
              </div>
              <div style={{ fontSize: 10, color: i === step ? "var(--accent)" : "var(--text-faint)", fontWeight: i === step ? 600 : 400, whiteSpace: "nowrap" as const }}>
                {label}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ height: 1, width: 24, background: i < step ? "var(--accent)" : "var(--border)", margin: "0 4px", marginBottom: 20 }} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div style={s.card}>
        <div style={s.sectionTitle}>{STEPS[step]}</div>
        {stepContent[step]}
        {output && <pre style={s.output}>{output}</pre>}
      </div>

      {/* Check Job */}
      <div style={s.card}>
        <div style={s.sectionTitle}>Check Job Status</div>
        <div style={{ display: "flex", gap: 8, marginBottom: checkResult ? 10 : 0 }}>
          <input style={{ ...s.input, flex: 1 }} placeholder="Job ID" value={checkId} onChange={e => setCheckId(e.target.value)} />
          <button style={s.btn} onClick={doCheckJob}>Check →</button>
        </div>
        {checkResult && (
          checkResult.error ? (
            <div style={{ fontSize: 12, color: "#ef4444" }}>{checkResult.error}</div>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              {Object.entries(checkResult).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "capitalize" as const }}>{k}</span>
                  <span style={{ fontSize: 12, color: "var(--text)", fontFamily: k === "provider" || k === "client" ? "var(--font-mono)" : undefined }}>
                    {String(v)}
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* How it works */}
      <div style={s.card}>
        <div style={s.sectionTitle}>How ERC-8183 Jobs Work</div>
        {[
          ["1. Create", "Client creates a job specifying provider address, description, and expiry."],
          ["2. Budget", "Provider or client sets the USDC budget for the work."],
          ["3. Fund", "Client approves + deposits USDC into the job escrow contract."],
          ["4. Submit", "Provider delivers work and submits a hash of the deliverable."],
          ["5. Complete", "Evaluator (or client) approves — USDC is automatically released to provider."],
        ].map(([step, desc]) => (
          <div key={step} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ width: 60, fontSize: 11, fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>{step}</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

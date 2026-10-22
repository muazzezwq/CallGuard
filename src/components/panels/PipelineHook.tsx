import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CONFIG } from "../../lib/config";
import { toast } from "sonner";
import { Badge, Button, Field, Input, PageHeader } from "../../ui";
import {
  CodeSurface, KeyValue, PanelShell, PanelSource, PanelSplit, StatusNotice,
} from "../panel/PanelUi";

const PPC_HOOK_ABI = [
  { name: "pipelineHook", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "setPipelineHook", type: "function", stateMutability: "nonpayable", inputs: [{ name: "hook", type: "address" }], outputs: [] },
] as const;

const IERC8183_HOOK = `interface IERC8183Hook {
  function beforeCall(
    bytes32 jobId,
    uint256 providerId,
    address caller,
    uint256 amount
  ) external;

  function afterCall(
    bytes32 jobId,
    bool    success
  ) external;
}`;

type TxState = "idle" | "pending" | "mining" | "success" | "error";

export default function PipelineHook() {
  const { isConnected } = useAccount();
  const [hookInput, setHookInput] = useState("");
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { data: currentHook, refetch } = useReadContract({
    address: CONFIG.ppcAddress,
    abi: PPC_HOOK_ABI,
    functionName: "pipelineHook",
  });

  const { writeContract } = useWriteContract();

  const { isLoading: isMining, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isMining) setTxState((s) => (s === "mining" ? s : "mining"));
  }, [isMining]);

  useEffect(() => {
    if (isSuccess) {
      setTxState("success");
      toast.success("Pipeline hook updated");
      void refetch();
    }
  }, [isSuccess, refetch]);

  const isZero = !currentHook || currentHook === "0x0000000000000000000000000000000000000000";
  const hookState = currentHook === undefined ? "Reading…" : isZero ? "Disabled" : "Active";
  const hookTone: "neutral" | "slash" | "guard" = currentHook === undefined ? "neutral" : isZero ? "slash" : "guard";
  const sourceState = currentHook === undefined ? "idle" : isZero ? "unavailable" : "live";

  function handleSet() {
    if (!hookInput || !/^0x[0-9a-fA-F]{40}$/.test(hookInput)) {
      toast.error("Enter a valid address");
      return;
    }
    setTxState("pending");
    writeContract(
      {
        address: CONFIG.ppcAddress,
        abi: PPC_HOOK_ABI,
        functionName: "setPipelineHook",
        args: [hookInput as `0x${string}`],
      },
      {
        onSuccess: (hash) => { setTxHash(hash); setTxState("mining"); },
        onError: (e) => { setTxState("error"); toast.error(e.message.slice(0, 80)); },
      }
    );
  }

  function handleDisable() {
    setTxState("pending");
    writeContract(
      {
        address: CONFIG.ppcAddress,
        abi: PPC_HOOK_ABI,
        functionName: "setPipelineHook",
        args: ["0x0000000000000000000000000000000000000000"],
      },
      {
        onSuccess: (hash) => { setTxHash(hash); setTxState("mining"); },
        onError: (e) => { setTxState("error"); toast.error(e.message.slice(0, 80)); },
      }
    );
  }

  return (
    <PanelShell>
      <PageHeader
        title="ERC-8183 Pipeline Hook"
        subtitle={(
          <>
            Hook contract that reports SLA lifecycle events to the AgenticCommerce job pipeline.{" "}
            <code>beforeCall</code> fires before every <code>callService</code>,{" "}
            <code>afterCall</code> fires on close.
          </>
        )}
        actions={<Badge tone={hookTone} dot>{hookState}</Badge>}
      />
      <PanelSource
        label="PayPerCall v7.1"
        value="pipelineHook"
        hint={currentHook === undefined ? "reading" : isZero ? "disabled" : "hook set"}
        state={sourceState}
      />

      <PanelSplit
        main={(
          <>
            <section className="ui-section">
              <div className="ui-section__head">
                <h2 className="ui-section__title">Current Hook Address</h2>
              </div>
              <div className="ui-section__body">
                <p className={isZero ? "pg-mono" : "pg-address"}>
                  {currentHook === undefined ? "Reading…" : isZero ? "Not set (0x000...000)" : currentHook}
                </p>
                {!isZero && currentHook && (
                  <p className="pg-note">
                    <a
                      className="pg-rowlink"
                      href={`https://explorer.testnet.arc.io/address/${currentHook}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View on ArcScan ↗
                    </a>
                  </p>
                )}
              </div>
            </section>

            <section className="ui-section pg-section--spaced">
              <div className="ui-section__head">
                <h2 className="ui-section__title">Set Hook Address</h2>
              </div>
              <div className="ui-section__body">
                {!isConnected ? (
                  <StatusNotice tone="info" title="Connect your wallet to perform this action." />
                ) : (
                  <>
                    <div className="pg-inline-form">
                      <Field className="pg-inline-form__field" label="Hook contract" htmlFor="ph-hook">
                        <Input
                          id="ph-hook"
                          mono
                          value={hookInput}
                          onChange={e => setHookInput(e.target.value)}
                          placeholder="0x... (contract implementing the IERC8183Hook interface)"
                        />
                      </Field>
                      <Button
                        variant="primary"
                        onClick={handleSet}
                        disabled={txState === "pending" || txState === "mining"}
                        loading={txState === "pending" || txState === "mining"}
                      >
                        {txState === "pending" ? "Waiting..." : txState === "mining" ? "Writing..." : "Set"}
                      </Button>
                    </div>
                    {!isZero && (
                      <div className="pg-form__actions pg-form__actions--spaced">
                        <Button
                          variant="danger"
                          onClick={handleDisable}
                          disabled={txState === "pending" || txState === "mining"}
                          loading={txState === "pending" || txState === "mining"}
                        >
                          Disable Hook
                        </Button>
                      </div>
                    )}
                    {txState === "success" && (
                      <StatusNotice
                        tone="success"
                        title="Hook updated successfully."
                        className="pg-section--spaced"
                        action={txHash ? (
                          <a
                            className="pg-rowlink"
                            href={`https://explorer.testnet.arc.io/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Tx ↗
                          </a>
                        ) : undefined}
                      />
                    )}
                    {txState === "error" && (
                      <StatusNotice
                        tone="danger"
                        title="Transaction failed. Please try again."
                        className="pg-section--spaced"
                      />
                    )}
                  </>
                )}
              </div>
            </section>
          </>
        )}
        rail={(
          <>
            <KeyValue
              label="Contract"
              rows={[
                { label: "Network", value: "Arc Testnet" },
                {
                  label: "PayPerCall",
                  value: (
                    <a
                      className="pg-rowlink pg-mono"
                      href={`https://explorer.testnet.arc.io/address/${CONFIG.ppcAddress}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {CONFIG.ppcAddress.slice(0, 10)}…{CONFIG.ppcAddress.slice(-6)}
                    </a>
                  ),
                },
                { label: "State", value: hookState },
                { label: "Function", value: "setPipelineHook", mono: true },
              ]}
            />
            <KeyValue
              label="Lifecycle"
              rows={[
                {
                  label: "1",
                  value: (
                    <>
                      <strong>callService() is called</strong>
                      <br />
                      PayPerCall sends beforeCall(jobId, providerId, caller, amount) to the hook contract
                    </>
                  ),
                },
                {
                  label: "2",
                  value: (
                    <>
                      <strong>SLA window elapses</strong>
                      <br />
                      Provider delivers a response or the deadline passes
                    </>
                  ),
                },
                {
                  label: "3",
                  value: (
                    <>
                      <strong>Call closes</strong>
                      <br />
                      submitReceipt or claimTimeout → afterCall(jobId, success) fires
                    </>
                  ),
                },
              ]}
            />
            <CodeSurface
              label="IERC8183Hook Interface"
              language="solidity"
              code={IERC8183_HOOK}
              wrap
            />
            <StatusNotice tone="info" title="Best-effort hooks">
              Both hooks are called <strong>best-effort</strong> — the PayPerCall transaction continues even if the hook contract reverts.
              <br />
              PayPerCall v7.1: <span className="pg-mono">{CONFIG.ppcAddress}</span>
            </StatusNotice>
          </>
        )}
      />
    </PanelShell>
  );
}

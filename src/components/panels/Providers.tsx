import { useMemo, useState } from "react";
import { useReadContract } from "wagmi";
import { CONFIG, ACTIVE_REGISTRY_ADDRESS, V8_ENABLED, REGISTRY_ABI, REGISTRY_ABI_V8 } from "../../lib/config";
import { useAppStore } from "../../store/useAppStore";
import {
  AddressPill, Badge, Button, Copy, EmptyState, ErrorState, Field, Input,
  PageHeader, SectionCard, Skeleton, Table, Tabs, Td, Th, Tr,
} from "../../ui";
import { usdcCompact, usdcExact } from "./providerMetrics";
import { endpointHref, endpointState } from "./endpointUrl";

const REGISTRY = ACTIVE_REGISTRY_ADDRESS;
const ZERO = "0x0000000000000000000000000000000000000000";

/* PayPerCall.DEFAULT_MAX_CONCURRENT: a provider that registers 0 gets this cap. */
const DEFAULT_MAX_CONCURRENT = 10;

const SETUP_STEPS = [
  {
    n: 1,
    title: "Get testnet USDC",
    body: "On Arc, USDC is both the stake asset and the gas token. The faucet issues testnet USDC to your address.",
    action: "Open faucet", href: "https://faucet.circle.com",
  },
  {
    n: 2,
    title: "Connect your wallet",
    body: "Use Connect wallet in the top bar. Arc Testnet is added by the app; if your wallet asks, approve the network switch.",
    action: null, href: null,
  },
  {
    n: 3,
    title: "Register as a provider",
    body: "Set a price per call, a maximum response time, a slash rate and the stake. Registration is a transaction, so it needs gas.",
    action: "Open Register", panel: "register",
  },
  {
    n: 4,
    title: "Answer calls and submit receipts",
    body: "Watch CallStarted events for your provider id. After answering, submit a receipt within the response window plus the 5-second grace, signed with the EIP-712 Receipt type (domain ArcSLA, version 1).",
    action: null, href: null,
  },
];

function codeSamples(): Record<string, string> {
  const ppc = CONFIG.ppcAddress;
  const usdc = CONFIG.usdcAddress;
  return {
    "Browser JS": `// npm i ethers
import { ethers } from "ethers";

const PPC  = "${ppc}";
const USDC = "${usdc}";
const price = 1_000_000n; // 1 USDC, 6 decimals — read the real price from the registry

const provider = new ethers.BrowserProvider(window.ethereum);
const wallet = await provider.getSigner();

// PayPerCall pulls the fee with transferFrom, so approve it first.
const usdcC = new ethers.Contract(USDC, ["function approve(address,uint256)"], wallet);
await (await usdcC.approve(PPC, price)).wait();

const ppcC = new ethers.Contract(
  PPC,
  ["function callService(uint256 providerId, bytes32 requestHash) returns (bytes32 callId)"],
  wallet,
);
const requestHash = ethers.keccak256(ethers.toUtf8Bytes("ping"));
const callId = (await (await ppcC.callService(1, requestHash)).wait())
  .logs.map(l => { try { return ppcC.interface.parseLog(l); } catch { return null; } })
  .find(e => e?.name === "CallStarted")?.args.callId;
console.log("callId:", callId);`,

    "Node.js": `// npm i ethers
const { ethers } = require("ethers");
const rpc = new ethers.JsonRpcProvider("${CONFIG.rpcUrl}");
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, rpc); // keep this key off the client

const PPC  = "${ppc}";
const USDC = "${usdc}";

const usdcC = new ethers.Contract(USDC, ["function approve(address,uint256)"], wallet);
await (await usdcC.approve(PPC, ethers.parseUnits("1", 6))).wait();

const ppcC = new ethers.Contract(
  PPC,
  ["function callService(uint256 providerId, bytes32 requestHash) returns (bytes32 callId)"],
  wallet,
);
const requestHash = ethers.keccak256(ethers.toUtf8Bytes("ping"));
const receipt = await (await ppcC.callService(1, requestHash)).wait();
const callId = receipt.logs
  .map(l => { try { return ppcC.interface.parseLog(l); } catch { return null; } })
  .find(e => e?.name === "CallStarted")?.args.callId;
console.log("callId:", callId);

// Provider side: submitReceipt(callId, responseHash, respondedAt, signature)
// signature is EIP-712 over Receipt(callId, responseHash, respondedAt).`,

    "Python": `# pip install web3
import os
from web3 import Web3

w3 = Web3(Web3.HTTPProvider("${CONFIG.rpcUrl}"))
acct = w3.eth.account.from_key(os.environ["PRIVATE_KEY"])
PPC  = Web3.to_checksum_address("${ppc}")
USDC = Web3.to_checksum_address("${usdc}")
price = 1_000_000  # 1 USDC, 6 decimals

usdc_abi = [{"name":"approve","type":"function","stateMutability":"nonpayable",
             "inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],
             "outputs":[{"type":"bool"}]}]
usdc_c = w3.eth.contract(address=USDC, abi=usdc_abi)
tx = usdc_c.functions.approve(PPC, price).build_transaction({
    "from": acct.address, "nonce": w3.eth.get_transaction_count(acct.address),
    "gas": 100_000, "gasPrice": w3.eth.gas_price, "chainId": w3.eth.chain_id,
})
w3.eth.wait_for_transaction_receipt(
    w3.eth.send_raw_transaction(acct.sign_transaction(tx).raw_transaction))

ppc_abi = [{"name":"callService","type":"function","stateMutability":"nonpayable",
            "inputs":[{"name":"providerId","type":"uint256"},{"name":"requestHash","type":"bytes32"}],
            "outputs":[{"name":"callId","type":"bytes32"}]}]
ppc_c = w3.eth.contract(address=PPC, abi=ppc_abi)
call = ppc_c.functions.callService(1, Web3.keccak(text="ping")).build_transaction({
    "from": acct.address, "nonce": w3.eth.get_transaction_count(acct.address),
    "gas": 400_000, "gasPrice": w3.eth.gas_price, "chainId": w3.eth.chain_id,
})
w3.eth.wait_for_transaction_receipt(
    w3.eth.send_raw_transaction(acct.sign_transaction(call).raw_transaction))`,

    "curl": `# getProvider(uint256) selector: 0x5c42d079, argument left-padded to 32 bytes.
# The reply is an ABI-encoded 9-field tuple; decode it before displaying values.
curl ${CONFIG.rpcUrl} \\
  -X POST -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{
    "to":"${CONFIG.registryAddress}",
    "data":"0x5c42d0790000000000000000000000000000000000000000000000000000000000000001"
  },"latest"]}'`,
  };
}

export default function Providers() {
  const { setPanel } = useAppStore();
  const [rawId, setRawId] = useState("1");
  const [codeTab, setCodeTab] = useState("Browser JS");

  const trimmed = rawId.trim();
  const idNum = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  const idValid = idNum !== null && Number.isSafeInteger(idNum) && idNum >= 1;

  const { data, isLoading, isError, error, refetch, isFetching, isFetched, dataUpdatedAt } = useReadContract({
    address: REGISTRY,
    abi: V8_ENABLED ? REGISTRY_ABI_V8 : REGISTRY_ABI,
    functionName: "getProvider",
    args: [BigInt(idValid ? idNum : 1)],
    query: { enabled: idValid, staleTime: 15_000 },
  });

  const baseRecord = useMemo(() => {
    const t = data as Record<string | number, unknown> | undefined;
    if (!t) return null;
    const read = (name: string, idx: number) => t[name] ?? t[idx];
    const owner = read("owner", 0) as string | undefined;
    if (!owner || owner.toLowerCase() === ZERO) return null;
    return {
      owner,
      signer: read("signer", 1) as string,
      stake: read("stake", 2) as bigint,
      pricePerCall: read("pricePerCall", 3) as bigint,
      latestTermsVersion: V8_ENABLED ? Number(read("latestTermsVersion", 4) ?? 0) : 1,
      maxResponseTime: V8_ENABLED ? 0 : Number(read("maxResponseTime", 4) ?? 0),
      slashBps: V8_ENABLED ? 0 : Number(read("slashBps", 5) ?? 0),
      active: Boolean(read("active", V8_ENABLED ? 5 : 6)),
      maxConcurrentCalls: Number(read("maxConcurrentCalls", V8_ENABLED ? 9 : 7) ?? 0),
      zkTier: Number(read("zkTier", V8_ENABLED ? 10 : 8) ?? 0),
    };
  }, [data]);

  const termsQuery = useReadContract({
    address: REGISTRY,
    abi: REGISTRY_ABI_V8,
    functionName: "getTerms",
    args: [BigInt(idValid ? idNum : 1), baseRecord?.latestTermsVersion ?? 0],
    query: { enabled: V8_ENABLED && !!baseRecord && (baseRecord?.latestTermsVersion ?? 0) > 0, staleTime: 15_000 },
  });
  const terms = termsQuery.data as Record<string | number, unknown> | undefined;

  const record = useMemo(() => {
    if (!baseRecord) return null;
    return {
      ...baseRecord,
      maxResponseTime: V8_ENABLED ? Number(terms?.maxResponseTime ?? terms?.[1] ?? 0) : baseRecord.maxResponseTime,
      slashBps: V8_ENABLED ? Number(terms?.slashBps ?? terms?.[2] ?? 0) : baseRecord.slashBps,
    };
  }, [baseRecord, terms]);

  /* getProvider does not include the endpoint, so it is a separate read. It is
     only requested once a record exists, to avoid reading unset ids. */
  const endpointQuery = useReadContract({
    address: REGISTRY,
    abi: V8_ENABLED ? REGISTRY_ABI_V8 : REGISTRY_ABI,
    functionName: "getEndpoint",
    args: [BigInt(idValid ? idNum : 1)],
    query: { enabled: idValid && record !== null, staleTime: 15_000 },
  });

  const endpoint = endpointState(endpointQuery);
  /* The link is the gate, not a formatting detail: only a usable endpoint
     produces one, so a placeholder can never be clicked or pinged. */
  const endpointLink = endpointHref(endpoint);

  const samples = useMemo(codeSamples, []);
  const concurrency = record
    ? record.maxConcurrentCalls === 0
      ? `${DEFAULT_MAX_CONCURRENT} (default)`
      : String(record.maxConcurrentCalls)
    : "";

  const slashAmount = record ? (record.stake * BigInt(record.slashBps)) / 10_000n : 0n;

  const updated = useMemo(() => {
    if (!dataUpdatedAt) return null;
    const secs = Math.max(0, Math.round((Date.now() - dataUpdatedAt) / 1000));
    return secs < 60 ? `${secs}s ago` : `${Math.round(secs / 60)}m ago`;
  }, [dataUpdatedAt]);

  return (
    <div className="ov-page pv-root">
      <PageHeader
        eyebrow="Discover"
        title="Providers"
        subtitle="Read a provider's registry record by id, then follow the setup guide or copy an integration snippet."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setPanel("marketplace")}>
            Browse all providers
          </Button>
        }
      />

      <SectionCard
        title="Look up a provider"
        subtitle="Values come from ServiceRegistry.getProvider and getEndpoint on Arc Testnet. The endpoint is the string recorded at registration; it is not verified."
      >
        <div className="pv-lookup">
          <Field
            label="Provider id"
            htmlFor="pv-id"
            error={trimmed !== "" && !idValid ? "Enter a positive whole number." : undefined}
            hint="Ids start at 1 and increase."
          >
            <Input
              id="pv-id"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={rawId}
              mono
              error={trimmed !== "" && !idValid}
              aria-invalid={trimmed !== "" && !idValid ? true : undefined}
              aria-describedby={trimmed !== "" && !idValid ? "pv-id-err" : "pv-id-hint"}
              onChange={e => setRawId(e.target.value)}
            />
          </Field>
          <Button size="sm" onClick={() => { refetch(); endpointQuery.refetch(); }} disabled={!idValid || isFetching}>
            {isFetching ? "Reading…" : "Read record"}
          </Button>
          {record && idValid && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                sessionStorage.setItem("provprofile_id", String(idNum));
                setPanel("provprofile");
              }}
            >
              Open provider details
            </Button>
          )}
        </div>

        <div className="pv-status" role="status" aria-live="polite">
          {!idValid
            ? trimmed === "" ? "Enter an id to read its record." : "No record was requested."
            : isLoading ? `Reading provider #${idNum}…`
            : isError ? `Provider #${idNum} could not be read.`
            : !isFetched ? "Not read yet."
            : record ? `Provider #${idNum} record read from the registry.`
            : `No provider is registered under #${idNum}.`}
          {record && idValid && updated && <span className="pv-status-meta"> · updated {updated}</span>}
        </div>

        {!idValid ? (
          <p className="pv-idle">Enter a provider id above to read the on-chain record.</p>
        ) : isLoading ? (
          <div className="pv-facts" aria-busy="true">
            {[...Array(6)].map((_, i) => (
              <div className="pv-fact" key={i}>
                <Skeleton width="38%" height={11} />
                <Skeleton width="62%" height={14} />
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title="The registry call failed."
            description="A failed read is not a missing provider. Check the network and retry the request."
            detail={error instanceof Error ? error.message : undefined}
            action={<Button size="sm" onClick={() => refetch()}>Retry</Button>}
          />
        ) : !record ? (
          <EmptyState
            icon={<span aria-hidden="true">◎</span>}
            title={`No provider is registered under #${idNum}`}
            description="The registry returned an empty record for this id. Ids are assigned in order, so a gap means the id was never registered."
            action={<Button size="sm" onClick={() => setPanel("register")}>Register a provider</Button>}
          />
        ) : (
          <>
            <Table className="pv-table">
              <thead>
                <tr>
                  <Th scope="col">Field</Th>
                  <Th scope="col">Value</Th>
                  <Th scope="col">Source</Th>
                </tr>
              </thead>
              <tbody>
                <Tr>
                  <Td>Owner</Td>
                  <Td><AddressPill value={record.owner} href={CONFIG.explorerAddr(record.owner)} /></Td>
                  <Td className="pv-src">registry</Td>
                </Tr>
                <Tr>
                  <Td>Receipt signer</Td>
                  <Td><AddressPill value={record.signer} href={CONFIG.explorerAddr(record.signer)} /></Td>
                  <Td className="pv-src">registry</Td>
                </Tr>
                <Tr>
                  <Td>Status</Td>
                  <Td>
                    <Badge tone={record.active ? "guard" : "neutral"}>
                      {record.active ? "Active" : "Inactive"}
                    </Badge>
                    {!record.active && <span className="pv-hint"> cannot take new calls</span>}
                  </Td>
                  <Td className="pv-src">registry</Td>
                </Tr>
                <Tr>
                  <Td>Price / call</Td>
                  <Td mono>{usdcExact(record.pricePerCall) ?? "—"} USDC</Td>
                  <Td className="pv-src">registry</Td>
                </Tr>
                <Tr>
                  <Td>Response window</Td>
                  <Td mono>{record.maxResponseTime}s<span className="pv-hint"> + 5s submit grace</span></Td>
                  <Td className="pv-src">registry</Td>
                </Tr>
                <Tr>
                  <Td>Slash on a missed deadline</Td>
                  <Td mono>
                    {(record.slashBps / 100).toFixed(2)}% of stake
                    <span className="pv-hint"> · {usdcCompact(slashAmount) ?? "—"} USDC per slashed call</span>
                  </Td>
                  <Td className="pv-src">registry + computed</Td>
                </Tr>
                <Tr>
                  <Td>Stake</Td>
                  <Td mono>{usdcCompact(record.stake) ?? "—"} USDC</Td>
                  <Td className="pv-src">registry</Td>
                </Tr>
                <Tr>
                  <Td>Concurrent calls per caller</Td>
                  <Td mono>{concurrency}</Td>
                  <Td className="pv-src">registry + PayPerCall constant</Td>
                </Tr>
                <Tr>
                  <Td>zkML tier</Td>
                  <Td mono>{record.zkTier === 0 ? "0 · no attestation" : `${record.zkTier} · doubles the concurrent cap at tier 2+`}</Td>
                  <Td className="pv-src">registry</Td>
                </Tr>
                <Tr>
                  <Td>Endpoint</Td>
                  <Td mono>
                    {endpoint.kind === "loading" ? (
                      <span className="pv-hint">Reading the endpoint…</span>
                    ) : endpoint.kind === "error" ? (
                      <span className="pv-hint">
                        Endpoint read failed.{" "}
                        <button type="button" className="pv-inline-link" onClick={() => endpointQuery.refetch()}>
                          Retry
                        </button>
                      </span>
                    ) : endpoint.kind === "empty" ? (
                      <span className="pv-hint">No endpoint recorded at registration.</span>
                    ) : endpoint.kind === "placeholder" ? (
                      <>
                        <span className="pv-endpoint">{endpoint.value}</span>
                        <span className="pv-hint"> · placeholder from the registration form, not a usable endpoint</span>
                      </>
                    ) : endpoint.kind === "invalid" ? (
                      <>
                        <span className="pv-endpoint">{endpoint.value}</span>
                        <span className="pv-hint"> · not an http(s) URL, so it cannot be called</span>
                      </>
                    ) : (
                      <>
                        <a className="pv-endpoint" href={endpointLink ?? undefined} target="_blank" rel="noreferrer noopener">
                          {endpoint.value}
                        </a>
                        <span className="pv-hint"> · recorded at registration, not verified</span>
                      </>
                    )}
                  </Td>
                  <Td className="pv-src">registry</Td>
                </Tr>
              </tbody>
            </Table>
            <p className="pv-note">
              Completed and slashed call counts are indexed by the subgraph, not stored in this
              record.{" "}
              <button
                type="button"
                className="pv-inline-link"
                onClick={() => {
                  sessionStorage.setItem("provprofile_id", String(idNum));
                  setPanel("provprofile");
                }}
              >
                Provider details
              </button>{" "}
              shows them together with the computed score.
            </p>
          </>
        )}
      </SectionCard>

      <SectionCard title="Provider setup" subtitle="Four steps from an empty wallet to a provider answering calls.">
        <details className="pv-disc">
          <summary>Show the setup steps</summary>
          <ol className="pv-steps">
            {SETUP_STEPS.map(step => (
              <li key={step.n} className="pv-step">
                <span className="pv-step-n" aria-hidden="true">{step.n}</span>
                <div>
                  <div className="pv-step-title">{step.title}</div>
                  <p className="pv-step-body">{step.body}</p>
                  {step.href && (
                    <a className="pv-step-link" href={step.href} target="_blank" rel="noreferrer">
                      {step.action} ↗
                    </a>
                  )}
                  {step.panel && (
                    <Button size="sm" variant="secondary" onClick={() => setPanel(step.panel as "register")}>
                      {step.action}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </details>
      </SectionCard>

      <SectionCard
        title="Integration snippets"
        subtitle="Every call escrows the provider's price in USDC and returns a bytes32 callId."
        action={<Copy value={samples[codeTab]} label="Copy the current snippet" />}
      >
        <Tabs
          className="pv-tabs"
          value={codeTab}
          onChange={setCodeTab}
          tabs={Object.keys(samples).map(k => ({ id: k, label: k }))}
        />
        {/* A long snippet scrolls horizontally; the region must be reachable
            by keyboard so the overflow is scrollable without a mouse. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <pre className="pv-code" tabIndex={0} aria-label="Integration snippet">{samples[codeTab]}</pre>
      </SectionCard>
    </div>
  );
}

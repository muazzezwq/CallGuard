import { useReadContract } from "wagmi";
import {
  ACTIVE_PPC_ADDRESS, ACTIVE_REGISTRY_ADDRESS, CONFIG, DISPUTE_V4_ENABLED, PPC_ABI_V8,
  REGISTRY_ABI, REGISTRY_ABI_V8, SLA_EVIDENCE_V2_ADDRESS, SLA_EVIDENCE_V2_ENABLED,
  V8_CONFIG, V8_ENABLED,
} from "../../lib/config";
import { Copy, PageHeader, Stat } from "../../ui";
import {
  Ledger, LedgerRow, PanelShell, PanelSource, PanelSplit, SignalRow, StatusNotice,
} from "../panel/PanelUi";

/* The admin surface is a wiring view, not a control panel. `ServiceRegistryV8`
   exposes `setPayPerCall` once, and reverts with `PayPerCallAlreadySet`
   afterwards, because a registry is bound to one escrow contract for its life.
   The v7 panel offered a one-time setter plus a two-step timelock that v8 never
   had; both buttons could only fail, so they are gone. Changing the wiring means
   deploying a new registry, and that is not something a browser button should
   pretend to do. */

/* v7 names its admin `owner`; v8 names it `admin` and does not inherit Ownable.
   One extra ABI entry covers the v7 branch without a second registry ABI. */
const REGISTRY_ABI_V7_ADMIN = [
  { name: "owner", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "payPerCall", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  ...REGISTRY_ABI,
] as const;
const REGISTRY_ABI_ACTIVE = V8_ENABLED ? REGISTRY_ABI_V8 : REGISTRY_ABI_V7_ADMIN;
/* Both stages expose these reads; the v8 ABI is the one with `registry()`. */
const PPC_ABI_ACTIVE = PPC_ABI_V8;

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function sameAddress(a?: string, b?: string): boolean | undefined {
  if (!a || !b) return undefined;
  return a.toLowerCase() === b.toLowerCase();
}

function WiringRow({
  lead, value, expected, ok, tone, note,
}: {
  lead: string;
  value?: string;
  expected?: string;
  ok?: boolean;
  tone?: "guard" | "danger" | "neutral" | "muted";
  note?: string;
}) {
  return (
    <LedgerRow
      tone={tone ?? (ok === undefined ? "neutral" : ok ? "guard" : "danger")}
      lead={lead}
      meta={(
        <span className="pg-address">
          {value ?? "—"}
          {expected && !ok ? <> <span className="pp-muted">expected {expected.slice(0, 10)}…</span></> : null}
        </span>
      )}
      trailing={
        <span className="pg-mono">
          {ok === undefined ? "reading…" : ok ? "ok" : "mismatch"}
          {note ? ` · ${note}` : ""}
        </span>
      }
    />
  );
}

export default function AdminPanel() {
  const registryLabel = V8_ENABLED ? "ServiceRegistryV8" : "ServiceRegistry v7";

  /* Registry side of the wiring. `admin` on v8, `owner` on v7 — the v8 registry
     does not inherit Ownable, so asking it for `owner` reverts. */
  const { data: registryAdmin } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI_ACTIVE,
    functionName: V8_ENABLED ? "admin" : "owner",
  });

  const { data: wiredPpc } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI_ACTIVE,
    functionName: "payPerCall",
  });

  const { data: nextProviderId } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI_ACTIVE,
    functionName: "nextProviderId",
  });

  /* Escrow side: it stores the registry it was deployed against, so the pair can
     be checked in both directions. A one-way match would hide a registry that
     points at a stale escrow. */
  const { data: wiredRegistry } = useReadContract({
    address: ACTIVE_PPC_ADDRESS,
    abi: PPC_ABI_ACTIVE,
    functionName: "registry",
    query: { enabled: V8_ENABLED },
  });

  const { data: keeperBountyBps } = useReadContract({
    address: ACTIVE_PPC_ADDRESS,
    abi: PPC_ABI_ACTIVE,
    functionName: "keeperBountyBps",
  });

  const { data: graceSeconds } = useReadContract({
    address: ACTIVE_PPC_ADDRESS,
    abi: PPC_ABI_ACTIVE,
    functionName: "SUBMIT_GRACE",
  });

  /* DisputeV4 is the only contract that may slash in addition to the escrow. The
     registry stores that permission as a flag, so it is worth showing: a false
     here means a dispute can be opened but its slash will not stick. */
  const disputeAddr = V8_CONFIG.dispute;
  const { data: disputeIsSlasher } = useReadContract({
    address: ACTIVE_REGISTRY_ADDRESS,
    abi: REGISTRY_ABI_V8,
    functionName: "authorizedSlashers",
    args: [disputeAddr],
    query: { enabled: V8_ENABLED && DISPUTE_V4_ENABLED },
  });

  const forwardOk = sameAddress(wiredPpc as string | undefined, ACTIVE_PPC_ADDRESS);
  const backwardOk = V8_ENABLED
    ? sameAddress(wiredRegistry as string | undefined, ACTIVE_REGISTRY_ADDRESS)
    : undefined;

  const wired = forwardOk === true && (backwardOk === true || backwardOk === undefined);

  const addresses: { name: string; addr: string; tone?: "neutral" | "muted" }[] = [
    { name: "ServiceRegistryV8", addr: V8_CONFIG.registryAddress },
    { name: "PayPerCallV8", addr: V8_CONFIG.ppcAddress },
    { name: "SLAKeeper", addr: V8_CONFIG.keeperAddress },
    { name: "DisputeV4", addr: disputeAddr },
    { name: "Authority (admin)", addr: (registryAdmin as string) ?? "" },
    { name: "USDC", addr: CONFIG.usdc },
    { name: "ServiceRegistry v7 (read-only)", addr: CONFIG.registry, tone: "muted" },
    { name: "PayPerCall v7.1 (read-only)", addr: CONFIG.payPerCall, tone: "muted" },
  ];
  if (SLA_EVIDENCE_V2_ENABLED) {
    addresses.splice(4, 0, { name: "SLAEvidenceRegistryV2", addr: SLA_EVIDENCE_V2_ADDRESS });
  }

  return (
    <PanelShell>
      <PageHeader
        title="Wiring"
        subtitle={`${registryLabel} — who is bound to what, read from the contracts`}
      />
      <PanelSource
        label={registryLabel}
        value={`${ACTIVE_REGISTRY_ADDRESS.slice(0, 10)}…`}
        hint={wired ? "wired in both directions" : "check the rows below"}
        state={wiredPpc === undefined ? "idle" : wired ? "live" : "unavailable"}
      />

      <SignalRow label="Current binding">
        <Stat
          label="Registry"
          value={<span className="pg-address">{ACTIVE_REGISTRY_ADDRESS.slice(0, 10)}…</span>}
          hint={registryLabel}
        />
        <Stat
          label="Escrow (payPerCall)"
          value={<span className="pg-address">{(wiredPpc as string | undefined)?.slice(0, 10) ?? "—"}…</span>}
          hint={forwardOk === undefined ? "Reading…" : forwardOk ? "Matches the wired escrow" : "Points somewhere else"}
          tone={forwardOk === undefined ? undefined : forwardOk ? "guard" : "slash"}
        />
        <Stat
          label={V8_ENABLED ? "Admin" : "Owner"}
          value={<span className="pg-address">{(registryAdmin as string | undefined)?.slice(0, 10) ?? "—"}…</span>}
          hint={registryAdmin === undefined ? "Reading…" : "Signs registry administration"}
        />
      </SignalRow>

      <StatusNotice tone="info" title="The binding is set once, at deploy.">
        A registry is attached to one escrow contract for its lifetime. On v8,
        <span className="pg-mono"> setPayPerCall </span>
        reverts with <span className="pg-mono">PayPerCallAlreadySet</span> after the first call, and
        there is no timelock or propose step. Re-pointing the pair means deploying a new registry, so
        this screen only reads the state back.
      </StatusNotice>

      <PanelSplit
        main={(
          <>
            <section className="ui-section">
              <div className="ui-section__head">
                <h2 className="ui-section__title">Binding check</h2>
              </div>
              <div className="ui-section__body">
                <p className="pg-copy pg-copy--tight">
                  Both contracts store the other's address. A match in one direction only would leave a
                  registry pointing at an escrow that has moved on, so both are shown.
                </p>
                <Ledger label="Registry → escrow">
                  <WiringRow
                    lead="registry.payPerCall()"
                    value={wiredPpc as string | undefined}
                    expected={ACTIVE_PPC_ADDRESS}
                    ok={forwardOk}
                  />
                </Ledger>
                {V8_ENABLED && (
                  <Ledger label="Escrow → registry">
                    <WiringRow
                      lead="payPerCall.registry()"
                      value={wiredRegistry as string | undefined}
                      expected={ACTIVE_REGISTRY_ADDRESS}
                      ok={backwardOk}
                    />
                  </Ledger>
                )}
              </div>
            </section>

            <section className="ui-section pg-section--spaced">
              <div className="ui-section__head">
                <h2 className="ui-section__title">Slashing authority</h2>
              </div>
              <div className="ui-section__body">
                <p className="pg-copy pg-copy--tight">
                  The escrow contract can always claim a timeout. A dispute contract slashes only while
                  the registry has it authorised; a revoked contract keeps its records but cannot move
                  stake.
                </p>
                <Ledger label="authorizedSlashers">
                  <WiringRow
                    lead={DISPUTE_V4_ENABLED ? "DisputeV4" : "Dispute (unconfigured)"}
                    value={disputeAddr || ZERO_ADDR}
                    ok={V8_ENABLED && DISPUTE_V4_ENABLED ? disputeIsSlasher === true : undefined}
                    note={V8_ENABLED && DISPUTE_V4_ENABLED ? undefined : "needs VITE_DISPUTE_V4"}
                  />
                </Ledger>
                <Ledger label="Escrow timings">
                  <LedgerRow
                    tone="neutral"
                    lead="keeperBountyBps"
                    meta={<span className="pg-mono">{keeperBountyBps === undefined ? "—" : `${Number(keeperBountyBps)} bps`}</span>}
                  />
                  <LedgerRow
                    tone="neutral"
                    lead="SUBMIT_GRACE"
                    meta={<span className="pg-mono">{graceSeconds === undefined ? "—" : `${Number(graceSeconds)} s`}</span>}
                  />
                  <LedgerRow
                    tone="neutral"
                    lead="nextProviderId"
                    meta={<span className="pg-mono">{nextProviderId === undefined ? "—" : String(nextProviderId)}</span>}
                  />
                </Ledger>
              </div>
            </section>
          </>
        )}
        rail={(
          <Ledger label="Address book">
            {addresses.filter(a => a.addr).map(({ name, addr, tone }) => (
              <LedgerRow
                key={`${name}-${addr}`}
                tone={tone ?? "neutral"}
                lead={name}
                meta={<span className="pg-address">{addr}</span>}
                trailing={<Copy value={addr} label={`Copy ${name} address`} />}
              />
            ))}
          </Ledger>
        )}
      />
    </PanelShell>
  );
}

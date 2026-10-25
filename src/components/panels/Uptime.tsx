// A8 availability panel.
//
// The registry stores `availabilityTargetBps` per terms version but never
// enforced it: a provider could publish 99.5 % uptime, miss calls, and keep the
// stake. `SLAUptime` measures availability since the last check and lets anyone
// claim a slash when the published target was missed. This panel shows the real
// numbers before the click, so a claim cannot surprise the claimer or the
// provider.
import { useMemo, useState } from "react";
import { useAccount, useChainId, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import {
  REGISTRY_ABI_V8,
  SLA_UPTIME_ABI,
  SLA_UPTIME_ADDRESS,
  SLA_UPTIME_ENABLED,
  V8_CONFIG,
  V8_ENABLED,
  arcTestnet,
} from "../../lib/config";
import { formatUsdc, friendlyError, shortAddr } from "../../lib/utils";
import { Badge, Button, Field, Input, Stat } from "../../ui";
import {
  KeyValue,
  Ledger,
  LedgerRow,
  PanelShell,
  PanelSource,
  PanelSplit,
  SignalRow,
  StatusNotice,
} from "../panel/PanelUi";

const LIVE = SLA_UPTIME_ENABLED;

const bpsToPct = (bps: number | bigint) => `${(Number(bps) / 100).toFixed(2)}%`;

type Preview = {
  availabilityBps: bigint;
  targetBps: number;
  samples: bigint;
  slashAmount: bigint;
  cooldownEndsAt: bigint;
  ready: boolean;
};

type ProviderRow = {
  owner: string;
  stake: bigint;
  completedCalls: bigint;
  slashedCalls: bigint;
  active: boolean;
};

function stamp(ts: bigint | number | undefined) {
  const n = Number(ts ?? 0);
  if (!n) return "—";
  return new Date(n * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function readPreview(data: unknown): Preview | null {
  // viem returns a tuple output either as a positional array or as an object
  // with the component names, depending on how the ABI was declared, so both
  // shapes are accepted here instead of trusting one.
  const t = data as
    | readonly [bigint, number | bigint, bigint, bigint, bigint, boolean]
    | Record<string, unknown>
    | undefined;
  if (!t) return null;
  const pick = (key: string, index: number): unknown => {
    if (Array.isArray(t)) return t[index];
    return (t as Record<string, unknown>)[key];
  };
  const availabilityBps = pick("availabilityBps", 0);
  const targetBps = pick("targetBps", 1);
  const samples = pick("samples", 2);
  const slashAmount = pick("slashAmount", 3);
  const cooldownEndsAt = pick("cooldownEndsAt", 4);
  const ready = pick("ready", 5);
  if (availabilityBps === undefined || targetBps === undefined) return null;
  return {
    availabilityBps: BigInt(availabilityBps as bigint),
    targetBps: Number(targetBps),
    samples: BigInt((samples ?? 0) as bigint),
    slashAmount: BigInt((slashAmount ?? 0) as bigint),
    cooldownEndsAt: BigInt((cooldownEndsAt ?? 0) as bigint),
    ready: Boolean(ready),
  };
}

function readProvider(data: unknown): ProviderRow | null {
  const t = data as readonly unknown[] | Record<string, unknown> | undefined;
  if (!t) return null;
  const pick = (key: string, index: number): unknown => {
    if (Array.isArray(t)) return t[index];
    return (t as Record<string, unknown>)[key];
  };
  const owner = pick("owner", 0);
  const stake = pick("stake", 2);
  if (typeof owner !== "string" || stake === undefined) return null;
  return {
    owner,
    stake: BigInt(stake as bigint),
    active: Boolean(pick("active", 5)),
    completedCalls: BigInt((pick("completedCalls", 7) ?? 0) as bigint),
    slashedCalls: BigInt((pick("slashedCalls", 8) ?? 0) as bigint),
  };
}

export default function Uptime() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [manualId, setManualId] = useState("1");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: nextProviderId } = useReadContract({
    address: V8_CONFIG.registryAddress,
    abi: REGISTRY_ABI_V8,
    functionName: "nextProviderId",
    query: { enabled: V8_ENABLED, refetchInterval: 30_000 },
  });

  const { data: minSamplesRaw } = useReadContract({
    address: SLA_UPTIME_ADDRESS, abi: SLA_UPTIME_ABI, functionName: "minSamples",
    query: { enabled: LIVE },
  });
  const { data: cooldownRaw } = useReadContract({
    address: SLA_UPTIME_ADDRESS, abi: SLA_UPTIME_ABI, functionName: "cooldown",
    query: { enabled: LIVE },
  });
  const { data: slashBpsRaw } = useReadContract({
    address: SLA_UPTIME_ADDRESS, abi: SLA_UPTIME_ABI, functionName: "availabilitySlashBps",
    query: { enabled: LIVE },
  });
  const { data: bountyBpsRaw } = useReadContract({
    address: SLA_UPTIME_ADDRESS, abi: SLA_UPTIME_ABI, functionName: "bountyBps",
    query: { enabled: LIVE },
  });
  const { data: treasuryRaw } = useReadContract({
    address: SLA_UPTIME_ADDRESS, abi: SLA_UPTIME_ABI, functionName: "treasury",
    query: { enabled: LIVE },
  });

  const ids = useMemo(() => {
    const count = Number(nextProviderId ?? 0n);
    const out: number[] = [];
    for (let id = 1; id < count; id++) out.push(id);
    return out.reverse().slice(0, 12);
  }, [nextProviderId]);

  async function claim(providerId: number, slashAmount: bigint) {
    if (!LIVE) {
      setStatus("❌ SLAUptime is not configured for this build.");
      return;
    }
    setBusy(`claim-${providerId}`);
    setStatus(`Claiming availability slash for provider ${providerId} (${formatUsdc(slashAmount)} USDC)…`);
    try {
      if (chainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id });
      const hash = await writeContractAsync({
        address: SLA_UPTIME_ADDRESS,
        abi: SLA_UPTIME_ABI,
        functionName: "claimAvailability",
        args: [BigInt(providerId)],
      });
      setStatus(`✅ Claim sent (${hash.slice(0, 10)}…). The slash and the bounty settle in the same transaction.`);
    } catch (e) {
      setStatus(`❌ ${friendlyError(e)}`);
    } finally {
      setBusy(null);
    }
  }

  const minSamples = Number(minSamplesRaw ?? 0);
  const cooldownHours = Math.round(Number(cooldownRaw ?? 0) / 3600);
  const slashPct = bpsToPct(slashBpsRaw ?? 0);
  const bountyPct = bpsToPct(bountyBpsRaw ?? 0);

  return (
    <PanelShell>
      <PanelSource
        label="SLAUptime"
        value={LIVE ? shortAddr(SLA_UPTIME_ADDRESS) : "not configured"}
        hint="availability claims on ServiceRegistryV8 + PayPerCallV8"
        state={LIVE ? "live" : "unavailable"}
      />

      <SignalRow label="Availability enforcement">
        <Stat label="Slash per miss" value={slashPct} hint="of the provider stake" />
        <Stat label="Claimer bounty" value={bountyPct} hint="of the slash, paid immediately" />
        <Stat label="Min samples" value={minSamples || "—"} hint="calls needed before a claim" />
        <Stat label="Cooldown" value={cooldownHours ? `${cooldownHours} h` : "—"} hint="between two claims" />
        <Stat label="Treasury" value={treasuryRaw ? shortAddr(String(treasuryRaw)) : "—"} hint="receives the rest" />
      </SignalRow>

      {status && (
        <StatusNotice
          tone={status.startsWith("✅") ? "success" : status.startsWith("❌") ? "danger" : "info"}
          title={status.replace(/^[✅❌]\s*/u, "")}
        />
      )}

      {!LIVE && (
        <StatusNotice tone="info" title="This build has no SLAUptime address">
          Set <code>VITE_SLA_UPTIME</code> after deploying <code>contracts/SLAUptime.sol</code>. Until then the
          panel only documents the mechanism: availability is measured from the registry counters since the last
          check, and a provider below its published target can be slashed by anyone.
        </StatusNotice>
      )}

      <PanelSplit
        main={(
          <>
            <Ledger
              label="Providers"
              empty="No provider is registered on the v8 registry yet."
            >
              {ids.map((id) => (
                <ProviderClaimRow
                  key={id}
                  id={id}
                  live={LIVE}
                  busy={busy === `claim-${id}`}
                  onClaim={(slash) => claim(id, slash)}
                />
              ))}
            </Ledger>

            <Field
              label="Check another provider"
              hint="Any provider id works, including ones outside the newest twelve."
              htmlFor="uptime-provider-id"
            >
              <Input
                id="uptime-provider-id"
                mono
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="1"
                inputMode="numeric"
              />
            </Field>
            {/^\d+$/.test(manualId.trim()) && manualId.trim() !== "0" && (
              <ProviderClaimRow
                id={Number(manualId)}
                live={LIVE}
                busy={busy === `claim-${manualId}`}
                onClaim={(slash) => claim(Number(manualId), slash)}
              />
            )}
          </>
        )}
        rail={(
          <>
            <KeyValue
              label="How a claim works"
              rows={[
                { label: "1 · window", value: "Calls recorded since the last check on this provider." },
                { label: "2 · metric", value: "completed / (completed + timed out), in basis points." },
                { label: "3 · gate", value: `Observed availability must be below the target, with at least ${minSamples || "N"} samples.` },
                { label: "4 · slash", value: `${slashPct} of the stake, capped at the stake itself.` },
                { label: "5 · split", value: `${bountyPct} to the claimer, the rest to the treasury.` },
                { label: "6 · cooldown", value: `${cooldownHours || "N"} hours before the same provider can be claimed again.` },
              ]}
            />
            <StatusNotice tone="info" title="Why the window resets">
              A lifetime ratio would let a provider with a long good history drift for hundreds of calls before
              anything bites. Each successful claim resets the baseline, so the next claim scores only what
              happened after the last decision. A provider that stops taking calls stops accumulating misses — and
              stops earning too.
            </StatusNotice>
            <KeyValue
              label="Provider side"
              rows={[
                { label: "Target", value: "Publish it in the terms (Register → availability target). 0 disables claims." },
                { label: "Defence", value: "Keep serving calls: above-target windows cannot be claimed." },
                { label: "Recovery", value: "After a slash, a clean window puts the provider back in compliance." },
              ]}
            />
          </>
        )}
      />

      {address && (
        <StatusNotice tone="info" title="Bounty pays to the connected wallet">
          The claim transaction is sent from {shortAddr(address)} and the bounty is transferred to that address in
          the same call. No bond is required, so a claim only costs gas.
        </StatusNotice>
      )}
    </PanelShell>
  );
}

function ProviderClaimRow({
  id, live, busy, onClaim,
}: {
  id: number;
  live: boolean;
  busy: boolean;
  onClaim: (slashAmount: bigint) => void;
}) {
  const { data: providerRaw } = useReadContract({
    address: V8_CONFIG.registryAddress,
    abi: REGISTRY_ABI_V8,
    functionName: "getProvider",
    args: [BigInt(id)],
    query: { enabled: V8_ENABLED, refetchInterval: 30_000 },
  });
  const { data: previewRaw } = useReadContract({
    address: SLA_UPTIME_ADDRESS,
    abi: SLA_UPTIME_ABI,
    functionName: "previewAvailability",
    args: [BigInt(id)],
    query: { enabled: live, refetchInterval: 30_000 },
  });

  const provider = readProvider(providerRaw);
  const preview = readPreview(previewRaw);

  if (!provider || provider.owner === "0x0000000000000000000000000000000000000000") return null;

  const target = preview?.targetBps ?? 0;
  const observed = preview?.availabilityBps;
  const samples = preview?.samples ?? 0n;
  const belowTarget = target > 0 && observed !== undefined && observed < BigInt(target);
  const noTarget = target === 0;

  const tone = noTarget ? "neutral" : belowTarget ? "warn" : "neutral";
  const state = noTarget
    ? "No availability target"
    : belowTarget
      ? samples === 0n ? "Below target · no samples yet" : "Below target"
      : "Meeting target";

  return (
    <LedgerRow
      tone={tone}
      lead={`Provider #${id}`}
      meta={(
        <>
          {shortAddr(provider.owner)} · stake {formatUsdc(provider.stake)} USDC ·{" "}
          {provider.completedCalls.toString()} completed / {provider.slashedCalls.toString()} timed out ·{" "}
          target {noTarget ? "—" : bpsToPct(target)} · observed{" "}
          {observed === undefined ? "—" : bpsToPct(observed)} · {samples.toString()} sample(s)
          {preview?.cooldownEndsAt && preview.cooldownEndsAt > 0n ? ` · next claim ${stamp(preview.cooldownEndsAt)}` : ""}
        </>
      )}
      trailing={(
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
          <Badge tone={belowTarget ? "slash" : "neutral"} dot>{state}</Badge>
          {live && preview?.ready && (
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => onClaim(preview.slashAmount)}
            >
              {busy ? "Claiming…" : `Claim ${formatUsdc(preview.slashAmount)} USDC`}
            </Button>
          )}
        </span>
      )}
    />
  );
}

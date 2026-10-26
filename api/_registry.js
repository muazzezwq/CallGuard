// /api/_registry.js — read the active ServiceRegistry without an indexer.
//
// The sitemap, the provider profile page and the marketplace health check all
// need the same thing: the list of active providers, straight from the registry
// that enforces the SLA. Keeping one copy of the selectors and the tuple layout
// means a registry change breaks in one place instead of three.
//
// `getProvider` returns `ProviderView`, whose shape differs by version:
//   v7: 0 owner, 1 signer, 2 stake, 3 pricePerCall, ..., 6 active
//   v8: 0 owner, 1 signer, 2 stake, 3 pricePerCall, 4 latestTermsVersion,
//       5 active, 6 pendingCalls, 7 completedCalls, 8 slashedCalls,
//       9 maxConcurrentCalls, 10 zkTier
// The endpoint is not part of either tuple; `getEndpoint` exposes it and its
// selector is the same on both.
//
// The active pair is resolved per call (see `activeContracts`), never captured at
// module load: this module is shared by routes that must agree on one registry
// for a given request.
import { activeContracts } from './_contracts.js';

const SELECTOR_GET_PROVIDER = '0x5c42d079';
const SELECTOR_NEXT_PROVIDER_ID = '0x51a8dbcf';
const SELECTOR_GET_ENDPOINT = '0x937bbc4a';
const ZERO_WORD = '0'.repeat(64);
const RPC_TIMEOUT_MS = 3000;

export function encodeUintArg(value) {
  return Number(value).toString(16).padStart(64, '0');
}

export async function rpcCall(rpcUrl, method, params, timeoutMs = RPC_TIMEOUT_MS) {
  const r = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`rpc http ${r.status}`);
  const body = await r.json();
  if (body?.error) throw new Error(`rpc ${body.error.code ?? 'error'}: ${body.error.message ?? 'unknown'}`);
  return body.result;
}

export function wordAt(raw, index) {
  return raw.slice(2 + index * 64, 2 + (index + 1) * 64);
}

// v8 ProviderView puts active at 5, v7 at 6; both are a single bool word.
export function isActiveWord(raw, isV8) {
  return wordAt(raw, isV8 ? 5 : 6) !== ZERO_WORD;
}

// ABI-decoded `string` return: offset word, length word, then the bytes.
export function decodeString(raw) {
  if (!raw || raw === '0x') return '';
  const hex = raw.slice(2);
  if (hex.length < 128) return '';
  const offsetChars = Number(BigInt('0x' + wordAt(raw, 0))) * 2;
  const lengthChars = Number(BigInt('0x' + hex.slice(offsetChars, offsetChars + 64))) * 2;
  const data = hex.slice(offsetChars + 64, offsetChars + 64 + lengthChars);
  return Buffer.from(data, 'hex').toString('utf8');
}

async function ethCall(rpcUrl, registry, data) {
  return rpcCall(rpcUrl, 'eth_call', [{ to: registry, data }, 'latest']);
}

// The endpoint is not in `ProviderView`; it needs its own call.
export async function readEndpoint(rpcUrl, id, env = process.env) {
  const { registry } = activeContracts(env);
  try {
    const raw = await ethCall(rpcUrl, registry, SELECTOR_GET_ENDPOINT + encodeUintArg(id));
    return decodeString(raw);
  } catch {
    return '';
  }
}

// One provider, or null when the id was never registered. Amounts stay strings in
// USDC base units so a 6-decimal value is never rounded through a float.
export async function readProvider(rpcUrl, id, env = process.env) {
  const { isV8, registry } = activeContracts(env);
  const raw = await ethCall(rpcUrl, registry, SELECTOR_GET_PROVIDER + encodeUintArg(id));
  if (!raw || raw === '0x' || raw.length < 2 + 64 * 4) return null;

  const provider = {
    id: String(id),
    owner: `0x${wordAt(raw, 0).slice(24)}`,
    signer: `0x${wordAt(raw, 1).slice(24)}`,
    stake: BigInt('0x' + wordAt(raw, 2)).toString(),
    pricePerCall: BigInt('0x' + wordAt(raw, 3)).toString(),
    active: isActiveWord(raw, isV8),
  };

  if (isV8) {
    provider.termsVersion = Number(BigInt('0x' + wordAt(raw, 4)));
    provider.pendingCalls = Number(BigInt('0x' + wordAt(raw, 6)));
    provider.completedCalls = Number(BigInt('0x' + wordAt(raw, 7)));
    provider.slashedCalls = Number(BigInt('0x' + wordAt(raw, 8)));
    provider.maxConcurrentCalls = Number(BigInt('0x' + wordAt(raw, 9)));
  }

  return provider;
}

// v8 counts providers with `nextProviderId`, so enumeration is exact. v7 has no
// counter: ids are dense from 1, so it probes.
export async function listActiveProviderIds(rpcUrl, limit, env = process.env) {
  const { isV8, registry } = activeContracts(env);
  const ids = [];

  async function readActive(id) {
    const raw = await ethCall(rpcUrl, registry, SELECTOR_GET_PROVIDER + encodeUintArg(id));
    return raw && raw !== '0x' ? isActiveWord(raw, isV8) : false;
  }

  if (isV8) {
    const raw = await ethCall(rpcUrl, registry, SELECTOR_NEXT_PROVIDER_ID);
    const next = Number(BigInt(raw));
    // Chunked so a long registry does not serialize into one huge round trip.
    for (let start = 1; start < next; start += 10) {
      const chunk = [];
      for (let id = start; id < Math.min(start + 10, next); id += 1) chunk.push(id);
      const flags = await Promise.all(chunk.map((id) => readActive(id).catch(() => false)));
      chunk.forEach((id, i) => { if (flags[i]) ids.push(String(id)); });
      if (ids.length >= limit) break;
    }
    return ids.slice(0, limit);
  }

  for (let id = 1; id <= limit; id += 1) {
    try {
      if (await readActive(id)) ids.push(String(id));
    } catch { /* keep probing */ }
  }
  return ids;
}

export async function listActiveProviders(rpcUrl, limit = 5, env = process.env) {
  const ids = await listActiveProviderIds(rpcUrl, limit, env);
  const providers = await Promise.all(
    ids.map(async (id) => {
      const provider = await readProvider(rpcUrl, id, env).catch(() => null);
      if (!provider || !provider.active) return null;
      return { ...provider, endpoint: await readEndpoint(rpcUrl, id, env) };
    })
  );
  return providers.filter(Boolean);
}

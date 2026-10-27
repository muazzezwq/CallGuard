// Shareable links for the app shell: `/app?verify=<callId>` opens receipt
// verification and starts it, `/?provider=<id>` opens a provider profile.
//
// The parser lives here because two components must agree about the same URL:
// the wallet gate (`src/App.tsx`) decides whether the route needs a wallet, and
// the shell (`src/components/layout/AppShell.tsx`) decides which panel opens. A
// verification link is read-only — it calls the attestation API and reads the
// chain — so it must not be turned away by the gate that guards the write surface.

/** `0x` plus 64 hex characters, exactly. */
const CALL_ID_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export interface VerifyIntent {
  /** What the URL carried, trimmed and URL-decoded, so the field can echo it. */
  input: string;
  /** Lower-cased call id when the value is well formed, otherwise null. */
  callId: string | null;
  /** Why `callId` is null, worded for the panel. Null when the value is valid. */
  error: string | null;
}

function paramsOf(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function parseCallId(raw: string): VerifyIntent {
  const input = raw.trim();
  if (!input) return { input, callId: null, error: "Enter a call ID to verify." };
  if (!CALL_ID_PATTERN.test(input)) {
    return { input, callId: null, error: "A call ID is 0x followed by 64 hex characters." };
  }
  return { input, callId: input.toLowerCase(), error: null };
}

/** The verification intent in this URL, or null when there is none. An empty
 *  `?verify=` is an intent too: the panel then explains what is missing. */
export function readVerifyIntent(search: string): VerifyIntent | null {
  const params = paramsOf(search);
  if (!params.has("verify")) return null;
  return parseCallId(params.get("verify") ?? "");
}

/** Parse a single call id that did not necessarily come from a URL. */
export function parseCallIdInput(raw: string): VerifyIntent {
  return parseCallId(raw);
}

/** The gate opens only for a verification link. Everything else under `/app`
 *  still needs a wallet, because every other panel can write. */
export function allowsWalletlessAccess(search: string): boolean {
  return readVerifyIntent(search) !== null;
}

/** A provider id from `?provider=`, unless the URL asks for verification instead:
 *  a link that names a call is about that call, and one intent per page load. */
export function readProviderIntent(search: string): string | null {
  if (readVerifyIntent(search)) return null;
  const raw = (paramsOf(search).get("provider") ?? "").trim();
  return /^\d+$/.test(raw) ? raw : null;
}

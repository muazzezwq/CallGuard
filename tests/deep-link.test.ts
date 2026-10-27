import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { allowsWalletlessAccess, readProviderIntent, readVerifyIntent } from "../src/lib/deepLink";
import { useAppStore } from "../src/store/useAppStore";

// A shareable verification link is `/app?verify=<callId>`. Two places decide what
// happens to it: the wallet gate in App.tsx (does this route need a wallet?) and the
// shell in AppShell.tsx (which panel opens?). Both read the same parser, so the
// decisions cannot drift apart.
const CALL_ID = "0x8cfa18217dfaa18bb7edc27102e29b9adf83abe5f100a5d2912ac6fbbedfb265";

const originalState = useAppStore.getState();

afterEach(() => {
  useAppStore.setState(originalState, true);
});

describe("verification deep link", () => {
  test("reads the full call id out of ?verify=", () => {
    const intent = readVerifyIntent(`?verify=${CALL_ID}`);
    expect(intent).not.toBeNull();
    expect(intent?.callId).toBe(CALL_ID);
    expect(intent?.error).toBeNull();
    expect(intent?.input).toBe(CALL_ID);
  });

  test("normalises checksum casing but keeps the 66-character value", () => {
    const upper = CALL_ID.toUpperCase().replace("0X", "0x");
    const intent = readVerifyIntent(`?verify=${upper}`);
    expect(intent?.callId).toBe(CALL_ID);
    expect(intent?.callId).toHaveLength(66);
  });

  test("rejects a truncated id, a non-hex id, and a bare 0x", () => {
    for (const bad of [CALL_ID.slice(0, 60), `${CALL_ID}ff`, "0xnothex", "0x"]) {
      const intent = readVerifyIntent(`?verify=${encodeURIComponent(bad)}`);
      expect(intent).not.toBeNull();
      expect(intent?.callId).toBeNull();
      expect(intent?.error).toMatch(/64 hex characters/);
      // The raw value survives so the field can show what was actually asked for.
      expect(intent?.input).toBe(bad);
    }
  });

  test("is absent when the parameter is absent", () => {
    expect(readVerifyIntent("")).toBeNull();
    expect(readVerifyIntent("?provider=1")).toBeNull();
  });

  test("an empty parameter is still an intent, so the panel can say what is wrong", () => {
    const intent = readVerifyIntent("?verify=");
    expect(intent).not.toBeNull();
    expect(intent?.callId).toBeNull();
    expect(intent?.error).toMatch(/Enter a call ID/);
  });

  test("the wallet gate opens for a verification link and stays shut for everything else", () => {
    expect(allowsWalletlessAccess(`?verify=${CALL_ID}`)).toBe(true);
    expect(allowsWalletlessAccess("?verify=")).toBe(true);
    expect(allowsWalletlessAccess("")).toBe(false);
    expect(allowsWalletlessAccess("?provider=1")).toBe(false);
    expect(allowsWalletlessAccess("?verify=0xdeadbeef")).toBe(true);
  });

  test("verification wins over a provider link when both are present", () => {
    expect(readProviderIntent(`?verify=${CALL_ID}&provider=2`)).toBeNull();
    expect(readProviderIntent("?provider=2")).toBe("2");
    expect(readProviderIntent("?provider=abc")).toBeNull();
  });

  test("opening the verify intent puts the exact call id in the store and selects the panel", () => {
    const action = useAppStore.getState().openVerify;
    action(CALL_ID);
    expect(useAppStore.getState().activePanel).toBe("verify");
    expect(useAppStore.getState().pendingVerify).toBe(CALL_ID);
    useAppStore.getState().clearPendingVerify();
    expect(useAppStore.getState().pendingVerify).toBeNull();
  });
});

describe("deep link ownership", () => {
  // Two auto-verify paths would fire two attestation requests for one page load:
  // the shell selects the panel and hands over the id, the panel does not go
  // looking at the URL on its own.
  test("the shell owns ?verify= and the panel does not read it", async () => {
    const shell = await readFile("src/components/layout/AppShell.tsx", "utf8");
    const panel = await readFile("src/components/panels/Verify.tsx", "utf8");
    expect(shell).toContain("readVerifyIntent");
    expect(panel).not.toMatch(/params\.get\(\s*["']verify["']\s*\)/);
    expect(panel).toContain("pendingVerify");
    // StrictMode runs the consuming effect twice in development; the guard is what
    // keeps one page load to one attestation request (measured: 2 before, 1 after).
    expect(panel).toContain("verifyInFlight");
  });

  test("the wallet gate and the shell share one parser", async () => {
    const gate = await readFile("src/App.tsx", "utf8");
    expect(gate).toContain("allowsWalletlessAccess");
  });
});

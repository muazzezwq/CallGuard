// The dispute panel must never send `openDispute` on a deployment whose
// registry has not authorised it as a slasher: the contract reverts
// `OnlySlasher` after the wallet has already paid gas for the transaction.
// These are source-level assertions because the panel is a React component and
// there is no DOM harness in this repo; they lock the three places the guard
// has to exist (the read, the button gate, the handler's early return).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const panel = readFileSync(
  new URL("../src/components/panels/DisputesV8.tsx", import.meta.url),
  "utf8",
);

describe("DisputeV8 slasher-grant guard", () => {
  test("reads the grant from the registry for the dispute address", () => {
    expect(panel).toContain('functionName: "authorizedSlashers"');
    expect(panel).toContain("args: [DISPUTE_ADDRESS]");
    expect(panel).toContain("V8_CONFIG.registryAddress");
  });

  test("treats an unanswered read as not granted", () => {
    // undefined must not unlock the button; only an explicit `true` does.
    expect(panel).toContain("const slasherGrantKnown = slasherAuthorised !== undefined;");
    expect(panel).toContain("const disputeUnauthorised = slasherAuthorised === false;");
    expect(panel).toMatch(/slasherGrantKnown && !disputeUnauthorised/);
  });

  test("blocks the handler before it touches the wallet", () => {
    const handler = panel.slice(panel.indexOf("function openDispute()"));
    const guardAt = handler.indexOf("if (!slasherGrantKnown || disputeUnauthorised)");
    const writeAt = handler.indexOf("writeContractAsync");
    expect(guardAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(guardAt);
    // The early return comes before the approve/bond path, not after it.
    expect(handler.slice(guardAt, writeAt)).toContain("return;");
  });

  test("explains the revert instead of letting the user find it", () => {
    expect(panel).toContain("OnlySlasher");
    expect(panel).toContain("This deployment cannot open disputes yet");
  });
});

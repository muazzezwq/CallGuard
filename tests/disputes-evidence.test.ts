import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

// Task 11: the Disputes panel shows the snapshot `DisputeV4.evidenceOf` recorded
// at open — but evidence must never weigh the money: no arithmetic may combine a
// row with `disputeBond` or `disputeSlashBps`. The retired DisputeV3 keeps an
// explicitly labelled read path with its own `finalize`, so dispute #4's escrow
// stays reachable after the env moves to V4.
describe("dispute evidence snapshot", () => {
  test("the dispute panel reads the snapshot and never weights it", async () => {
    const src = await readFile("src/components/panels/DisputesV8.tsx", "utf8");
    expect(src).toContain("evidenceOf");
    expect(src).toMatch(/NoVerifier|NoAnchor|WrongResponse|ModeIsSignature/);
    expect(src).not.toMatch(/evidence[\s\S]{0,80}(disputeBond|disputeSlashBps)/);
  });

  test("the panel reuses the shared evidence kind table, not a copy", async () => {
    const panel = await readFile("src/components/panels/DisputesV8.tsx", "utf8");
    const verify = await readFile("src/components/panels/Verify.tsx", "utf8");
    const record = await readFile("src/lib/verification/evidenceRecord.ts", "utf8");
    // The table lives in `evidenceRecord.ts`; both panels import it.
    expect(record).toContain("zk-execution");
    expect(panel).toContain("EVIDENCE_KINDS");
    expect(verify).toContain("from \"../../lib/verification/evidenceRecord\"");
    // Verify keeps the usage, not the local copy.
    expect(verify).not.toMatch(/const EVIDENCE_KINDS = \[/);
  });

  test("config pins the retiring V3 and adds the V4 write path", async () => {
    const src = await readFile("src/lib/config.ts", "utf8");
    expect(src).toContain("0xEf9f21Ece9b4C58BCb76913887E4f4846Ec36Fec");
    expect(src).toContain("VITE_DISPUTE_V4");
    expect(src).toContain("DISPUTE_V4_ENABLED");
  });

  test("the retiring V3 keeps a read path with its finalize", async () => {
    const src = await readFile("src/components/panels/DisputesV8.tsx", "utf8");
    expect(src).toContain("DISPUTE_V3_ADDRESS");
    expect(src).toContain("finalize");
  });

  test("each absent reason has its plain-language sentence", async () => {
    const src = await readFile("src/components/panels/DisputesV8.tsx", "utf8");
    expect(src).toContain("no verifier is wired for this kind on the evidence registry");
    expect(src).toContain("nothing anchored for this call");
    expect(src).toContain("anchored, but for a different response than the one this call committed");
    expect(src).toContain("signed by a key; a signature cannot bind a response on chain");
    expect(src).toContain("the wired verifier does not bind the call's response");
  });

  test("the block states the read-only nature once, in visible copy", async () => {
    const src = await readFile("src/components/panels/DisputesV8.tsx", "utf8");
    expect(src).toContain("changes neither the bond, the slash, nor the verdict");
  });

  test("a mode-0 kind reads as unanchorable, not as pending", async () => {
    const src = await readFile("src/components/panels/DisputesV8.tsx", "utf8");
    // The registry reverts `NoVerifierForKind` before reading a proof, so an
    // absent row of this kind is a refusal, not a check that has not run yet.
    expect(src).toMatch(/cannot be anchored at all/);
    expect(src).toContain("NoVerifierForKind");
    expect(src).toMatch(/row\.mode === 0/);
  });

  test("the legacy finalize button is gated on V3's own appeal window", async () => {
    const src = await readFile("src/components/panels/DisputesV8.tsx", "utf8");
    // `legacyCanFinalize` reads the window resolved per record (V3 layout), so
    // both a named field and the positional index work.
    expect(src).toMatch(/legacyCanFinalize[\s\S]{0,400}legacyAppealWindow/);
  });

  test("a bound row that is not present reads as a contradiction, not absent", async () => {
    const src = await readFile("src/components/panels/DisputesV8.tsx", "utf8");
    // No new reason code: the impossible `bound && !present` combination gets
    // an explicit sentence, visibly different from the absent sentences.
    expect(src).toContain("is bound but carries no anchor — read the dispute on chain before relying on it");
  });

  test("the loading snapshot reads as reading, never as absent", async () => {
    const src = await readFile("src/components/panels/DisputesV8.tsx", "utf8");
    // The block destructures `isLoading` and guards with it before the absent
    // notice: locate the loading guard, then the absent sentence within it.
    expect(src).toContain("reading the evidence snapshot…");
    const guard = src.match(/if \([\s\S]{0,80}isLoading\)[\s\S]{0,240}\}/);
    expect(guard).not.toBeNull();
    expect(guard![0]).toContain("reading the evidence snapshot…");
    // What this actually proves: the loading guard's body — the branch taken
    // while the read is in flight — does not contain the absent sentence, so
    // "No evidence snapshot recorded" cannot be emitted from the loading path.
    expect(guard![0]).not.toContain("No evidence snapshot recorded");
  });
});

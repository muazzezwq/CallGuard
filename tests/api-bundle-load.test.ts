import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// `/api/evidence` is served by `api/attestation.js`, which imports `api/_evidence.js`.
// That module answered `500 FUNCTION_INVOCATION_FAILED` on every request — including
// requests that never touch evidence — while the whole suite here passed. The cause was
// module load, not the handler: the fixtures were pulled in with
// `createRequire(import.meta.url)`, the bundler leaves that call in place, and the
// deployed function directory did not carry the JSON files, so the import threw before
// any code ran. The lesson is that a green `bun test` only proves *bun* resolves the
// graph. These tests load the production artifact shape instead.

const ATTESTATION = "api/attestation.js";
const EVIDENCE = "api/_evidence.js";

describe("the API function loads the way it is deployed", () => {
  test("the bundle resolves with no repository files beside it", async () => {
    const outdir = await mkdtemp(join(tmpdir(), "cg-fn-"));
    const result = await Bun.build({
      entrypoints: [ATTESTATION],
      target: "node",
      format: "esm",
      outdir,
    });
    expect(result.success, result.logs.map(String).join("\n")).toBe(true);

    const [artifact] = result.outputs;
    const entry = join(outdir, "entry.mjs");
    await writeFile(entry, await artifact.text());

    // A directory with one file in it: the artifact may not reach back into the repo.
    // `node` is the production runtime; running the entry there is the closest thing to
    // a deployed cold start that can happen before a deploy.
    const proc = Bun.spawnSync({
      cmd: ["node", "--input-type=module", "-e",
        `import(${JSON.stringify(entry)}).then((m) => console.log(typeof m.default))`],
      cwd: outdir,
      stdout: "pipe",
      stderr: "pipe",
      env: { PATH: process.env.PATH ?? "" },
    });

    const stdout = proc.stdout.toString().trim();
    const stderr = proc.stderr.toString().trim();
    expect(stderr, stderr).not.toContain("Cannot find module");
    expect(stdout, stderr).toBe("function");
  }, 60_000);

  test("the fixtures are inlined, not required at runtime", () => {
    const source = readFileSync(EVIDENCE, "utf8");
    const body = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    // `createRequire` is the exact construct that produced the 500: the bundler keeps
    // the call, so the function needs files that are not guaranteed to be beside it.
    expect(body).not.toContain("createRequire");
    expect(body).not.toMatch(/require\("\.\.\/src\/lib\/verification/);

    // Every fixture import states its type, so the bundler inlines the content.
    const fixtureImports = body.match(/from "\.\.\/src\/lib\/verification\/fixtures\/[^"]+"/g) ?? [];
    expect(fixtureImports.length).toBeGreaterThan(0);
    for (const line of body.split("\n").filter((l) => fixtureImports.some((i) => l.includes(i)))) {
      expect(line, line).toContain('with { type: "json" }');
    }
  });
});

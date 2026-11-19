/* Bun loads `.env` before the test files run, so a developer who follows the
   README and copies `.env.example` to `.env` would silently change what the
   suites exercise: the v8 pair flips module-level constants in `api/` from the
   v7 fixtures to the live contracts, and idempotency / auto-receipt started
   answering 402. Tests must not depend on the machine's deployment.

   Clear every key the example defines, before any test module is imported.
   Suites that need a value set it themselves (and restore it). Loaded from
   bunfig.toml under `[test] preload`. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const example = join(import.meta.dir, "..", ".env.example");
for (const line of readFileSync(example, "utf8").split("\n")) {
  const m = line.match(/^\s*(?:#\s*)?([A-Z][A-Z0-9_]*)\s*=/);
  if (m) delete process.env[m[1]];
}

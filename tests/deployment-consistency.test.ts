import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* The 13 Nov 2026 redeploy left three sources of truth behind: the subgraph
   manifest, the env example the UI is built from, and the tables humans read.
   They disagreed for five days (manifest on the new pair, .env.example and
   README on the retired one), which is exactly the class of bug a reader cannot
   see. Pin the agreement instead of re-checking it by hand. */

const root = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const ENV_KEYS = {
  ServiceRegistryV8: "VITE_SERVICE_REGISTRY_V8",
  PayPerCallV8: "VITE_PAY_PER_CALL_V8",
  SLAKeeper: "VITE_SLA_KEEPER",
  DisputeV4: "VITE_DISPUTE_V4",
  SLAEvidenceRegistryV2: "VITE_SLA_EVIDENCE_V2",
} as const;

function envAddress(key: string): string {
  const m = read(".env.example").match(new RegExp(`^${key}=(0x[0-9a-fA-F]{40})$`, "m"));
  if (!m) throw new Error(`${key} missing from .env.example`);
  return m[1].toLowerCase();
}

/** Address of the data source named `name` in the v8 manifest. */
function manifestAddress(name: string): string {
  const lines = read("subgraph/v8/subgraph.yaml").split("\n");
  const start = lines.findIndex((l) => l.trim() === `name: ${name}`);
  if (start === -1) throw new Error(`data source ${name} missing from subgraph.yaml`);
  for (const line of lines.slice(start + 1, start + 6)) {
    const m = line.match(/^\s*address:\s*"(0x[0-9a-fA-F]{40})"/);
    if (m) return m[1].toLowerCase();
  }
  throw new Error(`data source ${name} has no address`);
}

/** Full explorer URL in the README "Core Contracts" table row for `contract`. */
function readmeAddress(contract: string): string {
  const row = read("README.md")
    .split("\n")
    .find((l) => l.startsWith(`| \`${contract}\``));
  if (!row) throw new Error(`${contract} missing from the README table`);
  const m = row.match(/explorer\.testnet\.arc\.io\/address\/(0x[0-9a-fA-F]{40})/);
  if (!m) throw new Error(`${contract} row has no explorer address`);
  return m[1].toLowerCase();
}

describe("the live deployment is the same in every place that names it", () => {
  test("the subgraph indexes the contracts the app is built to write to", () => {
    expect(manifestAddress("ServiceRegistryV8")).toBe(envAddress(ENV_KEYS.ServiceRegistryV8));
    expect(manifestAddress("PayPerCallV8")).toBe(envAddress(ENV_KEYS.PayPerCallV8));
    expect(manifestAddress("DisputeV4")).toBe(envAddress(ENV_KEYS.DisputeV4));
  });

  test("the README table names the same contracts", () => {
    for (const [name, key] of Object.entries(ENV_KEYS)) {
      expect(readmeAddress(name)).toBe(envAddress(key));
    }
  });

  test("the app's subgraph default is the version the package deploys", () => {
    const versionOf = (source: string, re: RegExp) => {
      const m = source.match(re);
      if (!m) throw new Error(`no version in ${re}`);
      return m[1];
    };
    const app = versionOf(read("src/lib/config.ts"), /onur\/(1\.0\.\d+)/);
    const pkg = versionOf(read("subgraph/package.json"), /--version-label\s+(1\.0\.\d+)/);
    const deploy = versionOf(read("subgraph/v8/README.md"), /version label `(1\.0\.\d+)`/);
    expect(app).toBe(pkg);
    expect(deploy).toBe(pkg);
  });

  test("the marketing FAQ names the same dispute and evidence contracts", () => {
    const landing = read("src/marketing/Landing.tsx").toLowerCase();
    expect(landing).toContain(envAddress(ENV_KEYS.DisputeV4));
    expect(landing).toContain(envAddress(ENV_KEYS.SLAEvidenceRegistryV2));
  });
});

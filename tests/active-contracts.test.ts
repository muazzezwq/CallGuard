import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

// The app reads PayPerCallV8 / ServiceRegistryV8 while both v7 contracts stay
// deployed and readable. A label that still names the v7 pair tells the reader the
// wrong contract, so the surfaces that print an address must read the active pair
// from config (`ACTIVE_PPC_ADDRESS` / `ACTIVE_REGISTRY_ADDRESS`), never the legacy
// `CONFIG.ppcAddress` / `CONFIG.registryAddress` constants.
const SURFACES = [
  "src/components/layout/AppFooter.tsx",
  "src/components/panels/Overview.tsx",
  "src/components/panels/SettingsPanel.tsx",
  "src/marketing/Landing.tsx",
];

describe("active contract addresses", () => {
  for (const path of SURFACES) {
    test(`${path} prints the active pair, not the retired one`, async () => {
      const source = await readFile(path, "utf8");
      expect(source).toContain("ACTIVE_PPC_ADDRESS");
      expect(source).not.toContain("CONFIG.ppcAddress");
      expect(source).not.toContain("CONFIG.registryAddress");
    });
  }

  // A write that still targeted v7 would spend on the retired contract.
  test("the overview bulk-call write targets the active PayPerCall", async () => {
    const source = await readFile("src/components/panels/Overview.tsx", "utf8");
    const writes = source.match(/address: ACTIVE_PPC_ADDRESS,[\s\S]{0,40}abi:/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    expect(source).toContain("PPC_ABI_V8_ACTIVE");
    expect(source).toContain("REGISTRY_ABI_V8_ACTIVE");
  });

  // Panels that exist to clean up or read the retired deployment stay on v7 on
  // purpose; reading them from the active pair would defeat their purpose.
  test("the v7 cleanup panel keeps the legacy registry", async () => {
    const source = await readFile("src/components/panels/V7Cleanup.tsx", "utf8");
    expect(source).toContain("CONFIG.registryAddress");
  });
});

// Real Upstash integration tests for the idempotency store adapter.
//
// These tests are disabled by default. They run only when the test process is
// explicitly started with:
//
//   UPSTASH_IDEMPOTENCY_INTEGRATION=isolated-test-db
//
// Connection details are read only from the dedicated UPSTASH_TEST_REST_URL
// and UPSTASH_TEST_REST_TOKEN names, so production Upstash variables are never
// read. The recommended command uses `bun --no-env-file` so .env/.env.local
// cannot silently supply credentials:
//
//   UPSTASH_IDEMPOTENCY_INTEGRATION=isolated-test-db \
//   UPSTASH_TEST_EXPECTED_HOST='<isolated-test-hostname>' \
//   UPSTASH_TEST_DB_IDENTITY_SHA256='<sha256-of-marker>' \
//   UPSTASH_TEST_REST_URL='<isolated-test-url>' \
//   UPSTASH_TEST_REST_TOKEN='<isolated-test-token>' \
//   bun --no-env-file test tests/upstash-idempotency-store.integration.test.ts --timeout=30000
//
// Do not paste credentials into source, shell history, CI logs, or this file.
// The suite requires an https URL whose hostname exactly matches
// UPSTASH_TEST_EXPECTED_HOST. It also reads the single marker at
// callguard:test:db-identity and compares its SHA-256 to
// UPSTASH_TEST_DB_IDENTITY_SHA256 before creating clients or mutating data.
// It creates a random prefix under callguard:test:idempotency: and only
// scans/deletes keys under that exact prefix. It never imports the production
// handler and never signs, allocates nonces, or submits transactions.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { createUpstashIdempotencyStore } from "../api/_upstash_idempotency_store";

const TEST_PREFIX_ROOT = "callguard:test:idempotency:";
const DB_IDENTITY_KEY = "callguard:test:db-identity";
const ENABLE_VALUE = "isolated-test-db";
const ENABLED = process.env.UPSTASH_IDEMPOTENCY_INTEGRATION === ENABLE_VALUE;
const COMMAND_TIMEOUT_MS = 15_000;
const EXPECTED_HOST_PATTERN = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/i;
const DB_IDENTITY_HASH_PATTERN = /^[0-9a-f]{64}$/i;
const integrationDescribe = ENABLED ? describe : describe.skip;

type TestConfig = {
  url: string;
  token: string;
};

type TestEnv = Record<string, string | undefined>;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readIdentityHash(env: TestEnv): string {
  const raw = env.UPSTASH_TEST_DB_IDENTITY_SHA256;
  if (!raw || raw.trim() !== raw || !DB_IDENTITY_HASH_PATTERN.test(raw)) {
    throw new Error(
      "UPSTASH_TEST_DB_IDENTITY_SHA256 is required and must be a SHA-256 hex digest.",
    );
  }
  return raw.toLowerCase();
}

function normalizeExpectedHost(raw: string | undefined): string {
  if (!raw || raw.trim() !== raw) {
    throw new Error(
      "UPSTASH_TEST_EXPECTED_HOST is required and must be a bare hostname.",
    );
  }
  if (!EXPECTED_HOST_PATTERN.test(raw)) {
    throw new Error("UPSTASH_TEST_EXPECTED_HOST is invalid.");
  }
  return raw.toLowerCase();
}

function parseTestUrl(raw: string | undefined): URL {
  if (!raw) throw new Error("UPSTASH_TEST_REST_URL is required.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("UPSTASH_TEST_REST_URL is invalid.");
  }
  if (url.protocol !== "https:") {
    throw new Error("UPSTASH_TEST_REST_URL must use https.");
  }
  if (url.username || url.password) {
    throw new Error("UPSTASH_TEST_REST_URL must not contain credentials.");
  }
  return url;
}

function readTestConfig(env: TestEnv = process.env): TestConfig {
  const expectedHost = normalizeExpectedHost(env.UPSTASH_TEST_EXPECTED_HOST);
  const url = parseTestUrl(env.UPSTASH_TEST_REST_URL);
  const token = env.UPSTASH_TEST_REST_TOKEN;
  if (!token) {
    throw new Error(
      "Integration test enabled, but UPSTASH_TEST_REST_URL and UPSTASH_TEST_REST_TOKEN are missing. "
      + "Provide isolated test credentials inline and run with bun --no-env-file.",
    );
  }
  if (url.hostname.toLowerCase() !== expectedHost) {
    throw new Error(
      "UPSTASH_TEST_REST_URL hostname does not exactly match UPSTASH_TEST_EXPECTED_HOST.",
    );
  }
  return { url: url.toString(), token };
}

async function verifyDatabaseIdentity(
  config: TestConfig,
  expectedHash: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const marker = await upstashCommand(config, ["GET", DB_IDENTITY_KEY], fetchImpl);
  if (typeof marker !== "string" || marker.length === 0) {
    throw new Error("Upstash test database identity marker is missing.");
  }
  if (sha256(marker) !== expectedHash) {
    throw new Error("Upstash test database identity marker does not match.");
  }
}

async function createTestClients({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = COMMAND_TIMEOUT_MS,
}: {
  env?: TestEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
} = {}) {
  const config = readTestConfig(env);
  const expectedIdentityHash = readIdentityHash(env);
  await verifyDatabaseIdentity(config, expectedIdentityHash, fetchImpl);
  const prefix = makeUniquePrefix();
  const clientA = createUpstashIdempotencyStore({
    ...config,
    keyPrefix: prefix,
    timeoutMs,
    fetchImpl,
  });
  const clientB = createUpstashIdempotencyStore({
    ...config,
    keyPrefix: prefix,
    timeoutMs,
    fetchImpl,
  });
  return { config, prefix, clientA, clientB };
}

function makeUniquePrefix(): string {
  return `${TEST_PREFIX_ROOT}${randomUUID().replaceAll("-", "")}:`;
}

function uniqueOperationId(label: string): string {
  return `${label}:${randomUUID().replaceAll("-", "")}`;
}

function assertCleanupScope(prefix: string, keys: string[] = []) {
  if (
    typeof prefix !== "string"
    || !prefix.startsWith(TEST_PREFIX_ROOT)
    || prefix.length <= TEST_PREFIX_ROOT.length
    || /[\\*?\[\]]/.test(prefix)
  ) {
    throw new Error("Cleanup prefix is outside the idempotency test namespace");
  }
  for (const key of keys) {
    if (typeof key !== "string" || !key.startsWith(prefix)) {
      throw new Error("Cleanup key is outside the exact test prefix");
    }
  }
}

function escapeRedisGlob(value: string): string {
  return value.replace(/[\\*?\[\]]/g, "\\$&");
}

async function upstashCommand(
  config: TestConfig,
  command: unknown[],
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<unknown> {
  const response = await fetchImpl(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Upstash cleanup HTTP ${response.status}`);
  }
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Upstash cleanup returned invalid JSON");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Upstash cleanup returned an invalid response");
  }
  if (Object.prototype.hasOwnProperty.call(payload, "error")) {
    throw new Error("Upstash cleanup command failed");
  }
  if (!Object.prototype.hasOwnProperty.call(payload, "result")) {
    throw new Error("Upstash cleanup response has no result");
  }
  return (payload as { result: unknown }).result;
}

async function scanPrefix(config: TestConfig, prefix: string): Promise<string[]> {
  assertCleanupScope(prefix);
  const pattern = `${escapeRedisGlob(prefix)}*`;
  const keys = new Set<string>();
  let cursor = "0";

  for (let page = 0; page < 1_000; page += 1) {
    const result = await upstashCommand(config, [
      "SCAN",
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      "100",
    ]);
    if (!Array.isArray(result) || result.length < 2 || !Array.isArray(result[1])) {
      throw new Error("Upstash SCAN returned an invalid result");
    }
    const [nextCursor, batch] = result;
    for (const key of batch) {
      if (typeof key !== "string" || !key.startsWith(prefix)) {
        throw new Error("Upstash SCAN returned a key outside the test prefix");
      }
      keys.add(key);
    }
    cursor = String(nextCursor);
    if (cursor === "0") return [...keys];
  }

  throw new Error("Upstash SCAN did not finish");
}

async function deleteKeys(
  config: TestConfig,
  prefix: string,
  keys: string[],
): Promise<void> {
  assertCleanupScope(prefix, keys);
  for (let index = 0; index < keys.length; index += 100) {
    const batch = keys.slice(index, index + 100);
    if (batch.length === 0) continue;
    const deleted = await upstashCommand(config, ["DEL", ...batch]);
    if (typeof deleted !== "number") {
      throw new Error("Upstash DEL returned an invalid result");
    }
  }
}

async function cleanupPrefix(config: TestConfig, prefix: string): Promise<number> {
  assertCleanupScope(prefix);
  const keys = await scanPrefix(config, prefix);
  await deleteKeys(config, prefix, keys);
  return keys.length;
}

function operation(
  operationId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 2,
    kind: "operation",
    operationId,
    authId: operationId,
    fingerprint: "a".repeat(64),
    state: "prepared",
    revision: 0,
    createdAt: 1,
    updatedAt: 1,
    attempts: 0,
    lease: null,
    txHash: null,
    signedTransaction: null,
    ...overrides,
  };
}

function createFakeFetch(reply?: (command: unknown[]) => unknown) {
  const calls: unknown[][] = [];
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const command = JSON.parse(String(init?.body ?? "null")) as unknown[];
    calls.push(command);
    if (!reply) throw new Error("fake fetch must not be called");
    const result = reply(command);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ result }),
    } as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls: () => calls };
}

function createMarkerFetch(marker: string) {
  return createFakeFetch((command) => {
    if (command[0] === "GET" && command[1] === DB_IDENTITY_KEY) return marker;
    throw new Error("unexpected fake fetch command");
  });
}

describe("integration config guards", () => {
  const BASE_MARKER = "unit-test-db-marker";
  const baseEnv: TestEnv = {
    UPSTASH_TEST_REST_URL: "https://db.example.com",
    UPSTASH_TEST_REST_TOKEN: "unit-test-token",
    UPSTASH_TEST_EXPECTED_HOST: "db.example.com",
    UPSTASH_TEST_DB_IDENTITY_SHA256: sha256(BASE_MARKER),
  };

  async function expectRejected(env: TestEnv) {
    const fake = createFakeFetch();
    await expect(createTestClients({ env, fetchImpl: fake.fetchImpl })).rejects.toThrow();
    expect(fake.calls()).toHaveLength(0);
  }

  test("requires UPSTASH_TEST_EXPECTED_HOST", async () => {
    await expectRejected({ ...baseEnv, UPSTASH_TEST_EXPECTED_HOST: undefined });
  });

  test("rejects invalid expected hosts", async () => {
    await expectRejected({ ...baseEnv, UPSTASH_TEST_EXPECTED_HOST: "https://db.example.com" });
    await expectRejected({ ...baseEnv, UPSTASH_TEST_EXPECTED_HOST: "db.example.com/path" });
    await expectRejected({ ...baseEnv, UPSTASH_TEST_EXPECTED_HOST: "db.example.com:443" });
    await expectRejected({ ...baseEnv, UPSTASH_TEST_EXPECTED_HOST: " db.example.com" });
    await expectRejected({ ...baseEnv, UPSTASH_TEST_EXPECTED_HOST: "db.example.com." });
  });

  test("requires isolated test URL and token", async () => {
    await expectRejected({ ...baseEnv, UPSTASH_TEST_REST_URL: undefined });
    await expectRejected({ ...baseEnv, UPSTASH_TEST_REST_TOKEN: undefined });
  });

  test("does not fall back to production Upstash variables", async () => {
    await expectRejected({
      ...baseEnv,
      UPSTASH_TEST_REST_URL: undefined,
      UPSTASH_REDIS_REST_URL: "https://db.example.com",
      UPSTASH_REDIS_REST_TOKEN: "unit-test-token",
    });
    await expectRejected({
      ...baseEnv,
      UPSTASH_TEST_REST_TOKEN: undefined,
      UPSTASH_REDIS_REST_URL: "https://db.example.com",
      UPSTASH_REDIS_REST_TOKEN: "unit-test-token",
    });
  });

  test("requires UPSTASH_TEST_DB_IDENTITY_SHA256", async () => {
    await expectRejected({ ...baseEnv, UPSTASH_TEST_DB_IDENTITY_SHA256: undefined });
  });

  test("rejects invalid identity digests", async () => {
    await expectRejected({ ...baseEnv, UPSTASH_TEST_DB_IDENTITY_SHA256: "not-a-digest" });
  });

  test("rejects malformed URLs", async () => {
    await expectRejected({ ...baseEnv, UPSTASH_TEST_REST_URL: "not a url" });
  });

  test("rejects non-HTTPS protocols", async () => {
    await expectRejected({ ...baseEnv, UPSTASH_TEST_REST_URL: "http://db.example.com" });
    await expectRejected({ ...baseEnv, UPSTASH_TEST_REST_URL: "ftp://db.example.com" });
  });

  test("rejects URL credentials", async () => {
    await expectRejected({ ...baseEnv, UPSTASH_TEST_REST_URL: "https://user:pass@db.example.com" });
  });

  test("rejects unexpected, parent, and subdomain hosts", async () => {
    await expectRejected({ ...baseEnv, UPSTASH_TEST_REST_URL: "https://evil.example.com" });
    await expectRejected({ ...baseEnv, UPSTASH_TEST_EXPECTED_HOST: "example.com" });
    await expectRejected({ ...baseEnv, UPSTASH_TEST_REST_URL: "https://sub.db.example.com" });
    await expectRejected({ ...baseEnv, UPSTASH_TEST_REST_URL: "https://db.example.com.evil.com" });
  });

  test("rejects a missing identity marker before any mutation", async () => {
    const fake = createFakeFetch(() => null);
    await expect(createTestClients({ env: baseEnv, fetchImpl: fake.fetchImpl }))
      .rejects.toThrow(/identity marker/);
    expect(fake.calls()).toEqual([["GET", DB_IDENTITY_KEY]]);
  });

  test("rejects a mismatched identity marker before any mutation", async () => {
    const fake = createFakeFetch(() => "wrong-marker");
    await expect(createTestClients({ env: baseEnv, fetchImpl: fake.fetchImpl }))
      .rejects.toThrow(/identity marker/);
    expect(fake.calls()).toEqual([["GET", DB_IDENTITY_KEY]]);
  });

  test("accepts an exact hostname case-insensitively", async () => {
    const fake = createMarkerFetch(BASE_MARKER);
    await expect(createTestClients({
      env: {
        ...baseEnv,
        UPSTASH_TEST_REST_URL: "https://DB.EXAMPLE.COM",
        UPSTASH_TEST_EXPECTED_HOST: "db.example.com",
      },
      fetchImpl: fake.fetchImpl,
    })).resolves.toBeDefined();
    await expect(createTestClients({
      env: {
        ...baseEnv,
        UPSTASH_TEST_EXPECTED_HOST: "DB.EXAMPLE.COM",
      },
      fetchImpl: fake.fetchImpl,
    })).resolves.toBeDefined();
    expect(fake.calls()).toEqual([
      ["GET", DB_IDENTITY_KEY],
      ["GET", DB_IDENTITY_KEY],
    ]);
  });

  test("valid config reaches the injected fetch only when an operation runs", async () => {
    const fake = createFakeFetch((command) => {
      if (command[0] === "GET" && command[1] === DB_IDENTITY_KEY) return BASE_MARKER;
      throw new Error("unexpected fake fetch command");
    });
    const { clientA } = await createTestClients({ env: baseEnv, fetchImpl: fake.fetchImpl });
    expect(fake.calls()).toEqual([["GET", DB_IDENTITY_KEY]]);
    await expect(clientA.get("probe")).rejects.toThrow();
    expect(fake.calls()).toHaveLength(2);
    expect(fake.calls()[1][0]).toBe("GET");
    expect(String(fake.calls()[1][1])).toContain("probe");
  });
});

describe("integration cleanup scope guards", () => {
  test("rejects prefixes outside the idempotency test root", () => {
    expect(() => assertCleanupScope("")).toThrow();
    expect(() => assertCleanupScope("callguard:prod:")).toThrow();
    expect(() => assertCleanupScope(TEST_PREFIX_ROOT)).toThrow();
    expect(() => assertCleanupScope(`${TEST_PREFIX_ROOT}bad*prefix:`)).toThrow();
  });

  test("rejects keys outside the exact test prefix before deletion", () => {
    const prefix = `${TEST_PREFIX_ROOT}owned:`;
    expect(() => assertCleanupScope(prefix, [`${prefix}ok`, "callguard:prod:key"]))
      .toThrow();
    expect(() => assertCleanupScope(prefix, [`${prefix}ok`])).not.toThrow();
  });

  test("generates unique prefixes under the test root", () => {
    const first = makeUniquePrefix();
    const second = makeUniquePrefix();
    expect(first).not.toBe(second);
    expect(first.startsWith(TEST_PREFIX_ROOT)).toBe(true);
    expect(second.startsWith(TEST_PREFIX_ROOT)).toBe(true);
    expect(first.length).toBeGreaterThan(TEST_PREFIX_ROOT.length);
  });

  test("rejects the database identity marker as a cleanup key", () => {
    const prefix = `${TEST_PREFIX_ROOT}owned:`;
    expect(DB_IDENTITY_KEY.startsWith(TEST_PREFIX_ROOT)).toBe(false);
    expect(() => assertCleanupScope(prefix, [DB_IDENTITY_KEY])).toThrow();
  });
});

integrationDescribe("Upstash real integration (opt-in)", () => {
  let config: TestConfig;
  let prefix: string;
  let clientA: ReturnType<typeof createUpstashIdempotencyStore>;
  let clientB: ReturnType<typeof createUpstashIdempotencyStore>;

  beforeAll(async () => {
    ({ config, prefix, clientA, clientB } = await createTestClients());
  });

  afterAll(async () => {
    if (!config || !prefix) return;
    await cleanupPrefix(config, prefix);
    const remaining = await scanPrefix(config, prefix);
    if (remaining.length !== 0) {
      throw new Error(`Cleanup left ${remaining.length} key(s) under the test prefix`);
    }
  });

  test("two clients race create-if-absent and exactly one record wins", async () => {
    const operationId = uniqueOperationId("create-race");
    const record = operation(operationId);

    const [first, second] = await Promise.all([
      clientA.create(record),
      clientB.create(record),
    ]);

    expect([first.created, second.created].filter(Boolean)).toHaveLength(1);
    expect(first.record).toEqual(record);
    expect(second.record).toEqual(record);

    const persistedA = await clientA.get(operationId);
    const persistedB = await clientB.get(operationId);
    expect(persistedA).toEqual(record);
    expect(persistedB).toEqual(record);
  });

  test("two clients race the same state and revision and exactly one CAS wins", async () => {
    const operationId = uniqueOperationId("transition-race");
    const record = operation(operationId);
    await clientA.create(record);

    const [first, second] = await Promise.all([
      clientA.transition(operationId, "prepared", 0, "nonce_reserved", {
        attempts: 1,
      }),
      clientB.transition(operationId, "prepared", 0, "nonce_reserved", {
        attempts: 2,
      }),
    ]);

    const winners = [first, second].filter(result => result.ok);
    const losers = [first, second].filter(result => !result.ok);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    const winnerAttempts = winners[0].record.attempts;
    expect([1, 2]).toContain(winnerAttempts);

    const persisted = await clientA.get(operationId);
    expect(persisted).toMatchObject({
      state: "nonce_reserved",
      revision: 1,
      attempts: winnerAttempts,
    });
    expect(losers[0].record).toMatchObject({
      state: "nonce_reserved",
      revision: 1,
    });

    const stale = await clientB.transition(
      operationId,
      "prepared",
      0,
      "nonce_reserved",
      { attempts: 3 },
    );
    expect(stale.ok).toBe(false);
    expect(stale.record).toMatchObject({
      state: "nonce_reserved",
      revision: 1,
      attempts: winnerAttempts,
    });
  });
});

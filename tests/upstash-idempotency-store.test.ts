import { describe, expect, test } from "bun:test";
import {
  UpstashIdempotencyStoreError,
  createUpstashIdempotencyStore,
  createUpstashIdempotencyStoreFromEnv,
} from "../api/_upstash_idempotency_store";

const BASE_URL = "https://example.upstash.io";
const TOKEN = "test-token";
const PREFIX = "test:idempotency:";
const OP_ID = `call-service:auth:0x${"11".repeat(20)}:0x${"22".repeat(32)}`;
const FINGERPRINT = "f".repeat(64);
const TX_HASH = `0x${"33".repeat(32)}`;
const RAW_TX = "0xdeadbeef";
const NOW = 1_234;

type Reply = {
  status?: number;
  body?: unknown;
  text?: string;
  throw?: unknown;
  hang?: boolean;
};

type Call = {
  url: string;
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  };
  command: unknown[];
};

function makeFakeFetch(replies: Reply[] | ((call: Call) => Reply | Promise<Reply>)) {
  const calls: Call[] = [];
  const fetchImpl = async (
    url: string,
    init: Call["init"],
  ) => {
    const command = JSON.parse(init.body) as unknown[];
    const call: Call = { url, init, command };
    calls.push(call);
    const reply = typeof replies === "function"
      ? await replies(call)
      : replies[calls.length - 1];
    if (!reply) throw new Error("unexpected fetch call");
    if (reply.hang) {
      await new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }
    if (reply.throw) throw reply.throw;
    const status = reply.status ?? 200;
    const text = reply.text ?? JSON.stringify(reply.body ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    };
  };
  return { fetchImpl, calls };
}

function operation(overrides: Record<string, unknown> = {}) {
  return {
    version: 2,
    kind: "operation",
    operationId: OP_ID,
    authId: OP_ID,
    fingerprint: FINGERPRINT,
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

function createStore(
  fetchImpl: unknown,
  overrides: Record<string, unknown> = {},
) {
  return createUpstashIdempotencyStore({
    url: BASE_URL,
    token: TOKEN,
    keyPrefix: PREFIX,
    fetchImpl,
    now: () => NOW,
    ...overrides,
  });
}

function expectCode(fn: () => unknown, code: string) {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(UpstashIdempotencyStoreError);
  expect((caught as UpstashIdempotencyStoreError).code).toBe(code);
  return caught as UpstashIdempotencyStoreError;
}

async function expectRejectCode(promise: Promise<unknown>, code: string) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(UpstashIdempotencyStoreError);
  expect((caught as UpstashIdempotencyStoreError).code).toBe(code);
  return caught as UpstashIdempotencyStoreError;
}

describe("Upstash REST EVAL store contract", () => {
  test("create is one EVAL create-if-absent command and returns the stored record", async () => {
    const record = operation();
    const { fetchImpl, calls } = makeFakeFetch([
      { body: { result: [1, JSON.stringify(record)] } },
    ]);
    const store = createStore(fetchImpl);

    const result = await store.create(record);

    expect(result).toEqual({ created: true, record });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(BASE_URL);
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].init.headers["Content-Type"]).toBe("application/json");
    expect(calls[0].command[0]).toBe("EVAL");
    expect(calls[0].command[1]).toContain("create-if-absent");
    expect(calls[0].command[1]).toContain('redis.call("GET", KEYS[1])');
    expect(calls[0].command[1]).toContain('redis.call("SET", KEYS[1], ARGV[1])');
    expect(calls[0].command[2]).toBe("1");
    expect(calls[0].command[3]).toBe(`${PREFIX}${OP_ID}`);
    expect(JSON.parse(String(calls[0].command[4]))).toEqual(record);
    expect(calls[0].command[0]).not.toBe("PIPELINE");
  });

  test("create returns the existing record when the key already exists", async () => {
    const existing = operation({ state: "signed", revision: 2 });
    const { fetchImpl } = makeFakeFetch([
      { body: { result: [0, JSON.stringify(existing)] } },
    ]);
    const store = createStore(fetchImpl);

    const result = await store.create(operation());

    expect(result).toEqual({ created: false, record: existing });
  });

  test("get is one GET command and returns null for a missing key", async () => {
    const record = operation();
    const { fetchImpl, calls } = makeFakeFetch([
      { body: { result: JSON.stringify(record) } },
      { body: { result: null } },
    ]);
    const store = createStore(fetchImpl);

    expect(await store.get(OP_ID)).toEqual(record);
    expect(await store.get("missing")).toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls[0].command).toEqual(["GET", `${PREFIX}${OP_ID}`]);
    expect(calls[1].command).toEqual(["GET", `${PREFIX}missing`]);
  });

  test("transition is one EVAL state + revision CAS command with a bounded patch", async () => {
    const updated = operation({
      state: "signed",
      revision: 3,
      updatedAt: NOW,
      signedTransaction: RAW_TX,
      txHash: TX_HASH,
    });
    const { fetchImpl, calls } = makeFakeFetch([
      { body: { result: [1, JSON.stringify(updated)] } },
    ]);
    const store = createStore(fetchImpl);

    const result = await store.transition(
      OP_ID,
      "nonce_reserved",
      2,
      "signed",
      { signedTransaction: RAW_TX, txHash: TX_HASH },
    );

    expect(result).toEqual({ ok: true, record: updated });
    expect(calls).toHaveLength(1);
    expect(calls[0].command[0]).toBe("EVAL");
    expect(calls[0].command[1]).toContain("transition-cas");
    expect(calls[0].command[1]).toContain('record["state"] ~= ARGV[1]');
    expect(calls[0].command[1]).toContain('tonumber(record["revision"]) ~= tonumber(ARGV[2])');
    expect(calls[0].command[1]).toContain('redis.call("SET", KEYS[1], updated)');
    expect(calls[0].command[2]).toBe("1");
    expect(calls[0].command[3]).toBe(`${PREFIX}${OP_ID}`);
    expect(calls[0].command[4]).toBe("nonce_reserved");
    expect(calls[0].command[5]).toBe("2");
    expect(calls[0].command[6]).toBe("signed");
    expect(JSON.parse(String(calls[0].command[7]))).toEqual({
      signedTransaction: RAW_TX,
      txHash: TX_HASH,
    });
    expect(calls[0].command[8]).toBe(String(NOW));
  });

  test("transition returns the current record on CAS failure and null when absent", async () => {
    const current = operation({ state: "nonce_reserved", revision: 1 });
    const { fetchImpl } = makeFakeFetch([
      { body: { result: [0, JSON.stringify(current)] } },
      { body: { result: [0, false] } },
    ]);
    const store = createStore(fetchImpl);

    expect(await store.transition(OP_ID, "prepared", 0, "nonce_reserved"))
      .toEqual({ ok: false, record: current });
    expect(await store.transition(OP_ID, "prepared", 0, "nonce_reserved"))
      .toEqual({ ok: false, record: null });
  });

  test("each store operation uses exactly one request and never /pipeline", async () => {
    const record = operation();
    const signed = operation({ state: "signed", revision: 1, updatedAt: NOW });
    const { fetchImpl, calls } = makeFakeFetch([
      { body: { result: [1, JSON.stringify(record)] } },
      { body: { result: JSON.stringify(record) } },
      { body: { result: [1, JSON.stringify(signed)] } },
    ]);
    const store = createStore(fetchImpl);

    await store.create(record);
    await store.get(OP_ID);
    await store.transition(OP_ID, "prepared", 0, "signed", {
      signedTransaction: RAW_TX,
      txHash: TX_HASH,
    });

    expect(calls).toHaveLength(3);
    expect(calls.every(call => call.url === BASE_URL)).toBe(true);
    expect(calls.every(call => call.command[0] !== "PIPELINE")).toBe(true);
  });

  test("createFromEnv uses only the existing UPSTASH_REDIS_REST names", async () => {
    const record = operation();
    const { fetchImpl, calls } = makeFakeFetch([
      { body: { result: JSON.stringify(record) } },
    ]);
    const store = createUpstashIdempotencyStoreFromEnv({
      env: {
        UPSTASH_REDIS_REST_URL: BASE_URL,
        UPSTASH_REDIS_REST_TOKEN: TOKEN,
      },
      keyPrefix: PREFIX,
      fetchImpl,
    });

    expect(await store.get(OP_ID)).toEqual(record);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(BASE_URL);
  });
});

describe("Upstash REST EVAL validation", () => {
  test("create rejects a record without operationId before making a request", async () => {
    const { fetchImpl, calls } = makeFakeFetch([]);
    const store = createStore(fetchImpl);

    await expectRejectCode(store.create({}), "INVALID_ARGUMENT");
    expect(calls).toHaveLength(0);
  });

  test("transition validates expected state, revision, next state, and patch", async () => {
    const { fetchImpl, calls } = makeFakeFetch([]);
    const store = createStore(fetchImpl);

    await expectRejectCode(
      store.transition(OP_ID, "", 0, "nonce_reserved"),
      "INVALID_ARGUMENT",
    );
    await expectRejectCode(
      store.transition(OP_ID, "prepared", -1, "nonce_reserved"),
      "INVALID_ARGUMENT",
    );
    await expectRejectCode(
      store.transition(OP_ID, "prepared", 0, ""),
      "INVALID_ARGUMENT",
    );
    await expectRejectCode(
      store.transition(OP_ID, "prepared", 0, "nonce_reserved", {
        state: "signed",
      }),
      "INVALID_PATCH",
    );
    await expectRejectCode(
      store.transition(OP_ID, "prepared", 0, "nonce_reserved", {
        operationId: "other",
      }),
      "INVALID_PATCH",
    );
    await expectRejectCode(
      store.transition(OP_ID, "prepared", 0, "nonce_reserved", {
        lease: null,
      }),
      "INVALID_PATCH",
    );
    expect(calls).toHaveLength(0);
  });

  test("configuration is fail-closed and validates URL, token, prefix, timeout, and fetch", () => {
    const { fetchImpl } = makeFakeFetch([]);

    expectCode(
      () => createUpstashIdempotencyStore({
        url: BASE_URL,
        token: TOKEN,
        keyPrefix: "",
        fetchImpl,
      }),
      "UPSTASH_INVALID_CONFIG",
    );
    expectCode(
      () => createUpstashIdempotencyStore({
        url: "not-a-url",
        token: TOKEN,
        keyPrefix: PREFIX,
        fetchImpl,
      }),
      "UPSTASH_INVALID_CONFIG",
    );
    expectCode(
      () => createUpstashIdempotencyStore({
        url: BASE_URL,
        token: "bad\r\ntoken",
        keyPrefix: PREFIX,
        fetchImpl,
      }),
      "UPSTASH_INVALID_CONFIG",
    );
    expectCode(
      () => createUpstashIdempotencyStore({
        url: BASE_URL,
        token: TOKEN,
        keyPrefix: PREFIX,
        fetchImpl,
        timeoutMs: 0,
      }),
      "UPSTASH_INVALID_CONFIG",
    );
    expectCode(
      () => createUpstashIdempotencyStore({
        url: BASE_URL,
        token: TOKEN,
        keyPrefix: PREFIX,
        fetchImpl: null,
      }),
      "UPSTASH_INVALID_CONFIG",
    );
    expectCode(
      () => createUpstashIdempotencyStoreFromEnv({
        env: {},
        keyPrefix: PREFIX,
        fetchImpl,
      }),
      "UPSTASH_NOT_CONFIGURED",
    );
  });
});

describe("Upstash REST EVAL failure behavior", () => {
  test("HTTP errors fail closed without leaking the token", async () => {
    const { fetchImpl } = makeFakeFetch([
      { status: 500, body: { error: `token=${TOKEN}` } },
    ]);
    const store = createStore(fetchImpl);

    const error = await expectRejectCode(store.get(OP_ID), "UPSTASH_HTTP_ERROR");
    expect(error.status).toBe(500);
    expect(error.message).not.toContain(TOKEN);
  });

  test("Upstash error payloads fail closed and are redacted", async () => {
    const { fetchImpl } = makeFakeFetch([
      { body: { error: `upstream token=${TOKEN}` } },
    ]);
    const store = createStore(fetchImpl);

    const error = await expectRejectCode(store.get(OP_ID), "UPSTASH_RESPONSE_ERROR");
    expect(error.message).not.toContain(TOKEN);
  });

  test("network, timeout, malformed JSON, missing result, and bad result shapes fail closed", async () => {
    const network = makeFakeFetch([{ throw: new Error("network down") }]);
    const networkStore = createStore(network.fetchImpl);
    await expectRejectCode(networkStore.get(OP_ID), "UPSTASH_UNAVAILABLE");

    const timeout = makeFakeFetch([{ hang: true }]);
    const timeoutStore = createStore(timeout.fetchImpl, { timeoutMs: 5 });
    const timeoutError = await expectRejectCode(timeoutStore.get(OP_ID), "UPSTASH_UNAVAILABLE");
    expect(timeoutError.message).toContain("timed out");

    const malformed = makeFakeFetch([{ text: "{not-json" }]);
    const malformedStore = createStore(malformed.fetchImpl);
    await expectRejectCode(malformedStore.get(OP_ID), "UPSTASH_INVALID_RESPONSE");

    const empty = makeFakeFetch([{ text: "" }]);
    const emptyStore = createStore(empty.fetchImpl);
    await expectRejectCode(emptyStore.get(OP_ID), "UPSTASH_INVALID_RESPONSE");

    const missing = makeFakeFetch([{ body: {} }]);
    const missingStore = createStore(missing.fetchImpl);
    await expectRejectCode(missingStore.get(OP_ID), "UPSTASH_INVALID_RESPONSE");

    const badCreate = makeFakeFetch([{ body: { result: [1] } }]);
    const badCreateStore = createStore(badCreate.fetchImpl);
    await expectRejectCode(badCreateStore.create(operation()), "UPSTASH_INVALID_RESPONSE");

    const badRecord = makeFakeFetch([{ body: { result: [1, "not-json"] } }]);
    const badRecordStore = createStore(badRecord.fetchImpl);
    await expectRejectCode(badRecordStore.create(operation()), "UPSTASH_INVALID_RESPONSE");

    const nonObject = makeFakeFetch([{ body: { result: [1, "[]"] } }]);
    const nonObjectStore = createStore(nonObject.fetchImpl);
    await expectRejectCode(nonObjectStore.create(operation()), "UPSTASH_INVALID_RESPONSE");
  });

  test("transport failures never fall back to an in-memory store", async () => {
    let attempts = 0;
    const fetchImpl = async () => {
      attempts += 1;
      throw new Error("network down");
    };
    const store = createStore(fetchImpl);

    await expectRejectCode(store.create(operation()), "UPSTASH_UNAVAILABLE");
    await expectRejectCode(store.get(OP_ID), "UPSTASH_UNAVAILABLE");

    expect(attempts).toBe(2);
  });
});

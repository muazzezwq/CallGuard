import { afterEach, describe, expect, it } from "bun:test";
import { fetchProviders, SubgraphUnavailableError } from "../src/lib/subgraph";

// A cold or rate-limited indexer answers 429, and an empty provider list is not
// the same fact as an unreachable indexer. These tests pin the distinction so a
// panel can say "indexer unavailable" instead of "no providers".

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(response: { ok: boolean; status: number; body: unknown }) {
  globalThis.fetch = (async () => ({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  })) as unknown as typeof fetch;
}

describe("subgraph unavailability", () => {
  it("rejects instead of returning an empty list on 429", async () => {
    stubFetch({ ok: false, status: 429, body: {} });

    const error = await fetchProviders().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SubgraphUnavailableError);
    expect((error as SubgraphUnavailableError).reason).toBe("HTTP 429");
  });

  it("rejects when the response carries errors and no data", async () => {
    stubFetch({
      ok: true,
      status: 200,
      body: { errors: [{ message: "indexing_error" }] },
    });

    const error = await fetchProviders().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SubgraphUnavailableError);
    expect((error as SubgraphUnavailableError).reason).toBe("indexing_error");
  });

  it("keeps partial data: rows that came back are real", async () => {
    stubFetch({
      ok: true,
      status: 200,
      body: { data: { providers: [] }, errors: [{ message: "partial" }] },
    });

    await expect(fetchProviders()).resolves.toEqual([]);
  });
});

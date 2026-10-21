/* Executed with `bun test` (bun's built-in runner — no new dependency).
   Scope: the endpoint classifier and read-state machine used by the Providers
   and Provider details panels to decide whether the string stored by
   ServiceRegistry.getEndpoint can be offered as a link. Both panels are also
   exercised in a browser against real and mocked reads; see the audit report. */
import { describe, expect, test } from "bun:test";
import {
  classifyEndpoint, endpointHref, endpointState,
} from "../src/components/panels/endpointUrl";

describe("classifyEndpoint", () => {
  test("empty and non-string values are unavailable", () => {
    expect(classifyEndpoint("")).toEqual({ kind: "empty" });
    expect(classifyEndpoint("   ")).toEqual({ kind: "empty" });
    expect(classifyEndpoint(undefined)).toEqual({ kind: "empty" });
    expect(classifyEndpoint(null)).toEqual({ kind: "empty" });
    expect(classifyEndpoint(42)).toEqual({ kind: "empty" });
  });

  test("the registration-form placeholder is never usable, whatever its case", () => {
    expect(classifyEndpoint("https://your-provider-endpoint.com/api")).toEqual({
      kind: "placeholder",
      value: "https://your-provider-endpoint.com/api",
    });
    expect(classifyEndpoint("https://YOUR-PROVIDER-ENDPOINT.com/api")).toEqual({
      kind: "placeholder",
      value: "https://YOUR-PROVIDER-ENDPOINT.com/api",
    });
    expect(classifyEndpoint("https://your-provider-endpoint.com/api/")).toEqual({
      kind: "placeholder",
      value: "https://your-provider-endpoint.com/api/",
    });
    expect(classifyEndpoint("https://api.your-provider-endpoint.com/v1")).toEqual({
      kind: "placeholder",
      value: "https://api.your-provider-endpoint.com/v1",
    });
  });

  test("a host that merely contains the placeholder name stays usable", () => {
    expect(classifyEndpoint("https://your-provider-endpoint.com.evil.test/api")).toEqual({
      kind: "usable",
      value: "https://your-provider-endpoint.com.evil.test/api",
    });
    expect(classifyEndpoint("https://notyour-provider-endpoint.com/api")).toEqual({
      kind: "usable",
      value: "https://notyour-provider-endpoint.com/api",
    });
  });

  test("http and https URLs are usable, surrounding whitespace is trimmed", () => {
    expect(classifyEndpoint("  https://api.example.com/sla  ")).toEqual({
      kind: "usable",
      value: "https://api.example.com/sla",
    });
    expect(classifyEndpoint("http://127.0.0.1:8080/answer")).toEqual({
      kind: "usable",
      value: "http://127.0.0.1:8080/answer",
    });
  });

  test("free text and non-http protocols are invalid, not usable", () => {
    expect(classifyEndpoint("api.example.com")).toEqual({
      kind: "invalid",
      value: "api.example.com",
    });
    expect(classifyEndpoint("ftp://api.example.com")).toEqual({
      kind: "invalid",
      value: "ftp://api.example.com",
    });
    expect(classifyEndpoint("javascript:alert(1)")).toEqual({
      kind: "invalid",
      value: "javascript:alert(1)",
    });
  });
});

describe("endpointState", () => {
  test("a failed read is reported as an error, not as an empty value", () => {
    expect(endpointState({ isError: true })).toEqual({ kind: "error" });
    expect(endpointState({ isError: true, data: undefined })).toEqual({ kind: "error" });
  });

  test("an in-flight read is loading until data or an error arrives", () => {
    expect(endpointState({ isLoading: true })).toEqual({ kind: "loading" });
    expect(endpointState({ isLoading: true, data: "" })).toEqual({ kind: "loading" });
  });

  test("a failed read wins over a stale loading flag", () => {
    expect(endpointState({ isLoading: true, isError: true })).toEqual({ kind: "error" });
  });

  test("a settled read is classified by its value", () => {
    expect(endpointState({ data: "" })).toEqual({ kind: "empty" });
    expect(endpointState({ data: "  " })).toEqual({ kind: "empty" });
    expect(endpointState({ data: "https://api.example.com/sla" })).toEqual({
      kind: "usable",
      value: "https://api.example.com/sla",
    });
    expect(endpointState({ data: "https://your-provider-endpoint.com/api" })).toEqual({
      kind: "placeholder",
      value: "https://your-provider-endpoint.com/api",
    });
    expect(endpointState({ data: "not a url" })).toEqual({ kind: "invalid", value: "not a url" });
  });
});

describe("endpointHref", () => {
  test("only a usable endpoint yields a link", () => {
    expect(endpointHref({ kind: "usable", value: "https://api.example.com/sla" }))
      .toBe("https://api.example.com/sla");
    expect(endpointHref({ kind: "usable", value: "http://127.0.0.1:8080/answer" }))
      .toBe("http://127.0.0.1:8080/answer");
  });

  test("placeholders and every non-usable state stay unlinked", () => {
    const unlinkable = [
      { kind: "loading" },
      { kind: "error" },
      { kind: "empty" },
      { kind: "placeholder", value: "https://your-provider-endpoint.com/api" },
      { kind: "invalid", value: "api.example.com" },
    ] as const;
    for (const state of unlinkable) {
      expect(endpointHref(state)).toBeNull();
    }
  });
});

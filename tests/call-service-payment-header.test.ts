import { describe, expect, test } from "bun:test";
import { mergePaymentSource, parsePaymentHeader } from "../api/call-service.js";

/* The header carriers only. Settlement behaviour stays covered by
   tests/api-call-service-idempotency.test.ts, which drives the handler factory. */

const AUTHORIZATION = {
  from: "0x1111111111111111111111111111111111111111",
  to: "0xedce61eF5be31DC22cEfE342692622A26919a7EF",
  value: "1000000",
  validAfter: "0",
  validBefore: "1799999999",
  nonce: `0x${"bb".repeat(32)}`,
};
const SIGNATURE = `0x${"11".repeat(65)}`;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

describe("parsePaymentHeader", () => {
  test("reports absence instead of failing when the header is missing", () => {
    expect(parsePaymentHeader(undefined)).toEqual({ present: false });
    expect(parsePaymentHeader("")).toEqual({ present: false });
  });

  test("decodes the flat {authorization, signature} payload", () => {
    expect(parsePaymentHeader(encode({ authorization: AUTHORIZATION, signature: SIGNATURE })))
      .toEqual({ present: true, authorization: AUTHORIZATION, signature: SIGNATURE });
  });

  test("decodes the {payload: {authorization}, signature} shape", () => {
    expect(parsePaymentHeader(encode({ payload: { authorization: AUTHORIZATION }, signature: SIGNATURE })))
      .toEqual({ present: true, authorization: AUTHORIZATION, signature: SIGNATURE });
  });

  test("decodes a bare authorization object with the signature beside it", () => {
    expect(parsePaymentHeader(encode({ ...AUTHORIZATION, signature: SIGNATURE })))
      .toEqual({ present: true, authorization: AUTHORIZATION, signature: SIGNATURE });
  });

  test("rejects bytes that are not base64 JSON", () => {
    expect(parsePaymentHeader("not base64 at all").error).toBe("Malformed payment signature");
  });

  test("rejects a payload without a signature", () => {
    expect(parsePaymentHeader(encode({ authorization: AUTHORIZATION })).error)
      .toBe("Malformed payment signature");
  });

  test("rejects a payload whose authorization is not an object", () => {
    expect(parsePaymentHeader(encode({ authorization: "0xabc", signature: SIGNATURE })).error)
      .toBe("Malformed payment signature");
  });
});

describe("mergePaymentSource", () => {
  const header = { present: true, authorization: AUTHORIZATION, signature: SIGNATURE };

  test("uses the body when no header is present", () => {
    expect(mergePaymentSource(AUTHORIZATION, SIGNATURE, { present: false }))
      .toEqual({ authorization: AUTHORIZATION, signature: SIGNATURE });
  });

  test("uses the header when the body carries no payment", () => {
    expect(mergePaymentSource(undefined, undefined, header))
      .toEqual({ authorization: AUTHORIZATION, signature: SIGNATURE });
  });

  test("accepts the same payment in both carriers", () => {
    expect(mergePaymentSource(AUTHORIZATION, SIGNATURE, header))
      .toEqual({ authorization: AUTHORIZATION, signature: SIGNATURE });
  });

  test("refuses two different payments rather than choosing one", () => {
    const other = { ...AUTHORIZATION, value: "2000000" };
    expect(mergePaymentSource(other, SIGNATURE, header).error)
      .toBe("Payment supplied in both the PAYMENT-SIGNATURE header and the body");
  });
});

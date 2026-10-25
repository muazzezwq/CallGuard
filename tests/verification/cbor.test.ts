import { describe, expect, test } from "bun:test";
import { CborError, decodeCbor, encodeCbor } from "../../src/lib/verification/cbor";

function hex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g)!.map(byte => parseInt(byte, 16)));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

describe("decodeCbor", () => {
  test("decodes small and multi-byte unsigned integers", () => {
    expect(decodeCbor(hex("00"))).toBe(0);
    expect(decodeCbor(hex("17"))).toBe(23);
    expect(decodeCbor(hex("1818"))).toBe(24);
    expect(decodeCbor(hex("1901f4"))).toBe(500);
  });

  test("decodes negative integers, which is how COSE names an algorithm", () => {
    expect(decodeCbor(hex("20"))).toBe(-1);
    expect(decodeCbor(hex("3822"))).toBe(-35); // ES384
  });

  test("decodes byte strings as byte arrays, not text", () => {
    const value = decodeCbor(hex("4401020304"));
    expect(value).toBeInstanceOf(Uint8Array);
    expect(toHex(value as Uint8Array)).toBe("01020304");
  });

  test("decodes text, arrays, maps, booleans and null", () => {
    expect(decodeCbor(hex("63616263"))).toBe("abc");
    expect(decodeCbor(hex("83010203"))).toEqual([1, 2, 3]);
    const map = decodeCbor(hex("a26161016162a1616302")) as Map<unknown, unknown>;
    expect(map.get("a")).toBe(1);
    expect((map.get("b") as Map<unknown, unknown>).get("c")).toBe(2);
    expect(decodeCbor(hex("f5"))).toBe(true);
    expect(decodeCbor(hex("f6"))).toBeNull();
  });

  test("rejects trailing bytes instead of ignoring them", () => {
    expect(() => decodeCbor(hex("0000"))).toThrow(CborError);
  });

  test("rejects indefinite-length items", () => {
    expect(() => decodeCbor(hex("5f"))).toThrow(CborError);
    expect(() => decodeCbor(hex("9f"))).toThrow(CborError);
  });

  test("rejects a byte string that runs past the input", () => {
    expect(() => decodeCbor(hex("4401"))).toThrow(CborError);
  });

  test("rejects tags, which this layer does not need and will not guess", () => {
    expect(() => decodeCbor(hex("c000"))).toThrow(CborError);
  });
});

describe("encodeCbor", () => {
  test("round-trips the shapes an attestation document uses", () => {
    const value = new Map<unknown, unknown>([
      [1, -35],
      ["module", "abc"],
      ["bytes", hex("deadbeef")],
      ["list", [1, 2, 3]],
      ["flag", true],
      ["none", null],
    ]);
    const decoded = decodeCbor(encodeCbor(value as never)) as Map<unknown, unknown>;
    expect(decoded.get(1)).toBe(-35);
    expect(decoded.get("module")).toBe("abc");
    expect(toHex(decoded.get("bytes") as Uint8Array)).toBe("deadbeef");
    expect(decoded.get("list")).toEqual([1, 2, 3]);
    expect(decoded.get("flag")).toBe(true);
    expect(decoded.get("none")).toBeNull();
  });

  test("encodes a two-byte length prefix for a 300-byte string", () => {
    const encoded = encodeCbor("x".repeat(300));
    expect(toHex(encoded.subarray(0, 3))).toBe("79012c");
    expect(encoded.length).toBe(303);
  });

  test("refuses values it cannot represent", () => {
    expect(() => encodeCbor(1.5 as never)).toThrow(CborError);
  });
});

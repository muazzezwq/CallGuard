/**
 * Minimal CBOR codec.
 *
 * Scope: what an AWS Nitro attestation document and COSE_Sign1 need — unsigned
 * integers, negative integers, byte strings, text strings, arrays, maps with any
 * key type, booleans, null. No floats, no indefinite lengths, no tags.
 *
 * Hand-written and strict on purpose: this decoder parses the bytes whose
 * signature is then checked, so a lenient parser is attack surface. Anything the
 * codec does not understand is rejected instead of interpreted.
 */

export type CborValue =
  | number
  | Uint8Array
  | string
  | boolean
  | null
  | CborValue[]
  | Map<CborValue, CborValue>;

export class CborError extends Error {}

export function decodeCbor(bytes: Uint8Array): CborValue {
  const [value, offset] = decodeAt(bytes, 0);
  if (offset !== bytes.length) {
    throw new CborError(`trailing ${bytes.length - offset} byte(s) after CBOR item`);
  }
  return value;
}

function decodeAt(bytes: Uint8Array, offset: number): [CborValue, number] {
  const initial = bytes[offset];
  if (initial === undefined) throw new CborError("unexpected end of CBOR input");

  const major = initial >> 5;
  const additional = initial & 0x1f;
  if (additional === 31) throw new CborError("indefinite-length items are not accepted");

  const [length, body] = readLength(bytes, offset + 1, additional);

  switch (major) {
    case 0:
      return [checkSafe(length), body];
    case 1:
      return [-1 - checkSafe(length), body];
    case 2: {
      const end = body + length;
      if (end > bytes.length) throw new CborError("byte string runs past the input");
      return [bytes.subarray(body, end), end];
    }
    case 3: {
      const end = body + length;
      if (end > bytes.length) throw new CborError("text string runs past the input");
      return [new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(body, end)), end];
    }
    case 4: {
      const items: CborValue[] = [];
      let cursor = body;
      for (let i = 0; i < length; i += 1) {
        const [item, next] = decodeAt(bytes, cursor);
        items.push(item);
        cursor = next;
      }
      return [items, cursor];
    }
    case 5: {
      const map = new Map<CborValue, CborValue>();
      let cursor = body;
      for (let i = 0; i < length; i += 1) {
        const [key, afterKey] = decodeAt(bytes, cursor);
        const [value, afterValue] = decodeAt(bytes, afterKey);
        map.set(key, value);
        cursor = afterValue;
      }
      return [map, cursor];
    }
    case 6:
      throw new CborError("CBOR tags are not accepted");
    case 7:
      if (additional === 20) return [false, offset + 1];
      if (additional === 21) return [true, offset + 1];
      if (additional === 22) return [null, offset + 1];
      throw new CborError(`unsupported simple value ${additional}`);
    default:
      throw new CborError(`unsupported CBOR major type ${major}`);
  }
}

function readLength(bytes: Uint8Array, offset: number, additional: number): [number, number] {
  if (additional < 24) return [additional, offset];
  const width = additional === 24 ? 1 : additional === 25 ? 2 : additional === 26 ? 4 : 0;
  if (width === 0) throw new CborError(`unsupported additional info ${additional}`);
  if (offset + width > bytes.length) throw new CborError("length prefix runs past the input");
  let value = 0;
  for (let i = 0; i < width; i += 1) value = value * 256 + (bytes[offset + i] as number);
  return [value, offset + width];
}

function checkSafe(value: number): number {
  if (value > Number.MAX_SAFE_INTEGER) throw new CborError("integer beyond safe range");
  return value;
}

/** Encodes the subset above. Needed for COSE Sig_structure and for fixtures. */
export function encodeCbor(value: CborValue): Uint8Array {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new CborError("only integers are supported");
    return value >= 0 ? encodeHead(0, value) : encodeHead(1, -1 - value);
  }
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    return concat(encodeHead(3, bytes.length), bytes);
  }
  if (value instanceof Uint8Array) return concat(encodeHead(2, value.length), value);
  if (typeof value === "boolean") return new Uint8Array([value ? 0xf5 : 0xf4]);
  if (value === null) return new Uint8Array([0xf6]);
  if (Array.isArray(value)) return concat(encodeHead(4, value.length), ...value.map(encodeCbor));
  if (value instanceof Map) {
    const parts: Uint8Array[] = [encodeHead(5, value.size)];
    for (const [key, item] of value) parts.push(encodeCbor(key), encodeCbor(item));
    return concat(...parts);
  }
  throw new CborError("unsupported value for encoding");
}

function encodeHead(major: number, length: number): Uint8Array {
  if (length < 24) return new Uint8Array([(major << 5) | length]);
  if (length < 0x100) return new Uint8Array([(major << 5) | 24, length]);
  if (length < 0x10000) return new Uint8Array([(major << 5) | 25, length >> 8, length & 0xff]);
  if (length < 0x100000000) {
    return new Uint8Array([
      (major << 5) | 26,
      (length >>> 24) & 0xff,
      (length >>> 16) & 0xff,
      (length >>> 8) & 0xff,
      length & 0xff,
    ]);
  }
  throw new CborError("length too large to encode");
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

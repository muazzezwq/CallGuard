import { describe, expect, test } from "bun:test";
import {
  callStatusLabel,
  csvCell,
  clampPage,
  mergeNotifications,
  normalizeCalls,
  notificationKey,
  notificationStoreKey,
  positiveUsdc,
  sanitizeNotifications,
  usdcAmount,
  type ActivityNotification,
} from "../src/lib/activity";

const notif = (id: string, ts: number): ActivityNotification => ({
  id,
  type: "call",
  msg: `event ${id}`,
  sub: "",
  ts,
});

describe("exact amounts", () => {
  test("missing and unreadable amounts are null, not zero", () => {
    expect(usdcAmount(undefined)).toBeNull();
    expect(usdcAmount(null)).toBeNull();
    expect(usdcAmount("")).toBeNull();
    expect(usdcAmount("not-a-number")).toBeNull();
  });

  test("base units format to 6 decimals", () => {
    expect(usdcAmount("1000000")).toBe("1");
    expect(usdcAmount("1")).toBe("0.000001");
    expect(usdcAmount("0")).toBe("0");
  });

  test("positive check uses BigInt so 1 base unit survives", () => {
    expect(positiveUsdc("1")).toBe("0.000001");
    expect(positiveUsdc("0")).toBeNull();
    expect(positiveUsdc("0x0")).toBeNull();
    expect(positiveUsdc("true")).toBeNull();
  });
});

describe("normalizeCalls", () => {
  test("dedupes by id and keeps the first row", () => {
    const rows = [
      { id: "a", createdAt: "10", marker: 1 },
      { id: "a", createdAt: "10", marker: 2 },
      { id: "b", createdAt: "11" },
    ];
    const out = normalizeCalls(rows);
    expect(out).toHaveLength(2);
    expect(out.find(r => r.id === "a")?.marker).toBe(1);
  });

  test("orders newest first and breaks ties by id", () => {
    const out = normalizeCalls([
      { id: "b", createdAt: "10" },
      { id: "a", createdAt: "10" },
      { id: "c", createdAt: "12" },
    ]);
    expect(out.map(r => r.id)).toEqual(["c", "a", "b"]);
  });

  test("rows without an id are preserved, not collapsed", () => {
    const out = normalizeCalls([{ createdAt: "2" }, { createdAt: "1" }]);
    expect(out).toHaveLength(2);
  });

  test("missing or invalid createdAt sorts last without becoming 1970", () => {
    const out = normalizeCalls([
      { id: "missing" },
      { id: "invalid", createdAt: "soon" },
      { id: "dated", createdAt: "5" },
    ]);
    expect(out.map(r => r.id)).toEqual(["dated", "invalid", "missing"]);
  });
});

describe("status labels", () => {
  test("maps the indexer enum without overstating a timeout claim", () => {
    expect(callStatusLabel("STARTED")).toBe("Open");
    expect(callStatusLabel("COMPLETED")).toBe("Completed");
    expect(callStatusLabel("SLASHED")).toBe("Timeout claimed");
    expect(callStatusLabel("REFUNDED")).toBe("Refunded");
    expect(callStatusLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(callStatusLabel(null)).toBe("Unknown");
  });
});

describe("pagination", () => {  test("clamps to the available range", () => {
    expect(clampPage(0, 3)).toBe(0);
    expect(clampPage(2, 3)).toBe(2);
    expect(clampPage(5, 3)).toBe(2);
    expect(clampPage(-1, 3)).toBe(0);
    expect(clampPage(4, 0)).toBe(0);
  });
});

describe("CSV", () => {
  test("quotes every cell and doubles inner quotes", () => {
    expect(csvCell('a "quoted" value')).toBe('"a ""quoted"" value"');
    expect(csvCell("plain")).toBe('"plain"');
    expect(csvCell(undefined)).toBe('""');
  });

  test("commas and newlines stay inside the quoted cell", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("notification identity", () => {
  test("key needs a transaction hash and includes the log index and event", () => {
    expect(notificationKey("0xabc", 3, "call")).toBe("0xabc:3:call");
    expect(notificationKey("0xabc", 0, "slash")).toBe("0xabc:0:slash");
    expect(notificationKey(undefined, 1, "call")).toBeNull();
    expect(notificationKey("", 1, "call")).toBeNull();
  });

  test("storage is per account, with a separate disconnected key", () => {
    expect(notificationStoreKey("0xABC")).toBe("cg_notifs_v3:0xabc");
    expect(notificationStoreKey(null)).toBe("cg_notifs_v3:anon");
    expect(notificationStoreKey("0xabc")).not.toBe(notificationStoreKey("0xdef"));
  });
});

describe("notification store", () => {
  test("drops malformed entries and dedupes by id, keeping the newest", () => {
    const out = sanitizeNotifications([
      { id: "a", type: "call", msg: "one", ts: 5 },
      { id: "a", type: "call", msg: "two", ts: 8 },
      { id: "b", type: "push", msg: "unsupported", ts: 9 },
      { id: "c", msg: "no type", ts: 9 },
      { id: "d", type: "slash", msg: "no ts" },
      null,
    ]);
    expect(out.map(n => n.id)).toEqual(["a"]);
    expect(out[0].msg).toBe("two");
  });

  test("merge keeps the newest copy and caps the list", () => {
    const out = mergeNotifications([notif("a", 5), notif("b", 3)], [notif("a", 6), notif("c", 4)], 2);
    expect(out.map(n => n.id)).toEqual(["a", "c"]);
    expect(out[0].ts).toBe(6);
  });
});

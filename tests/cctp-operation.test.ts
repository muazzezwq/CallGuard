import { beforeEach, describe, expect, test } from "bun:test";
import {
  CCTP_OPERATION_KEY,
  cctpStageDecision,
  clearCctpOperation,
  readCctpOperation,
  startCctpOperation,
  updateCctpOperation,
  type CctpStage,
} from "../src/lib/cctpOperation";
import { resetPaymentGateState } from "../src/lib/paymentGate";
import type { GuardStorage } from "../src/lib/facilitatorGuard";

const HASH_A = `0x${"aa".repeat(32)}`;
const HASH_B = `0x${"bb".repeat(32)}`;
const HASH_C = `0x${"cc".repeat(32)}`;

function makeStorage(backing = new Map<string, string>()) {
  const fail = { get: false, set: false, remove: false, tamper: false };
  const storage: GuardStorage = {
    getItem: (key) => {
      if (fail.get) throw new Error("read failed");
      return backing.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (fail.set) throw new Error("write failed");
      backing.set(key, fail.tamper ? `${value} ` : value);
    },
    removeItem: (key) => {
      if (fail.remove) throw new Error("remove failed");
      backing.delete(key);
    },
  };
  return { storage, backing, fail };
}

beforeEach(() => {
  resetPaymentGateState();
});

describe("CCTP operation marker", () => {
  test("starts one operation and refuses a second", () => {
    const { storage, backing } = makeStorage();
    const started = startCctpOperation(storage, { chain: "sepolia", amount: "1000" });
    expect(started.ok).toBe(true);
    if (started.ok) expect(started.operation.stage).toBe("started");
    expect(backing.has(CCTP_OPERATION_KEY)).toBe(true);

    const second = startCctpOperation(storage, { chain: "sepolia", amount: "1000" });
    expect(second.ok).toBe(false);
  });

  test("a marker cannot be started when storage cannot be verified", () => {
    const unreadable = makeStorage();
    unreadable.fail.get = true;
    expect(startCctpOperation(unreadable.storage, { chain: "sepolia", amount: "1" }).ok).toBe(false);

    const unwritable = makeStorage();
    unwritable.fail.set = true;
    expect(startCctpOperation(unwritable.storage, { chain: "sepolia", amount: "1" }).ok).toBe(false);

    const tampered = makeStorage();
    tampered.fail.tamper = true;
    const result = startCctpOperation(tampered.storage, { chain: "sepolia", amount: "1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("readback-failed");
  });

  test("an unreadable or corrupt marker is never treated as none", () => {
    const broken = makeStorage();
    broken.backing.set(CCTP_OPERATION_KEY, "not json");
    const read = readCctpOperation(broken.storage);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toBe("marker-corrupt");

    const unreadable = makeStorage();
    unreadable.fail.get = true;
    expect(readCctpOperation(unreadable.storage).ok).toBe(false);
    expect(readCctpOperation(null).ok).toBe(false);
  });

  test("only forward transitions are accepted", () => {
    const { storage } = makeStorage();
    expect(startCctpOperation(storage, { chain: "sepolia", amount: "1000" }).ok).toBe(true);

    const skip = updateCctpOperation(storage, { stage: "approval-confirmed" });
    expect(skip.ok).toBe(false);

    expect(updateCctpOperation(storage, { stage: "approval-pending" }).ok).toBe(true);
    expect(updateCctpOperation(storage, { stage: "approval-confirmed" }).ok).toBe(true);
    const backwards = updateCctpOperation(storage, { stage: "started" });
    expect(backwards.ok).toBe(false);
    expect(updateCctpOperation(storage, { stage: "burn-pending" }).ok).toBe(true);
  });

  test("hashes are preserved across later stage updates", () => {
    const { storage } = makeStorage();
    expect(startCctpOperation(storage, { chain: "base", amount: "5000" }).ok).toBe(true);
    expect(updateCctpOperation(storage, { stage: "burn-pending" }).ok).toBe(true);
    expect(updateCctpOperation(storage, { stage: "burn-pending", burnHash: HASH_A }).ok).toBe(true);
    expect(updateCctpOperation(storage, { stage: "burn-confirmed" }).ok).toBe(true);

    const read = readCctpOperation(storage);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.operation?.burnHash).toBe(HASH_A);
      expect(read.operation?.stage).toBe("burn-confirmed");
      expect(read.operation?.chain).toBe("base");
      expect(read.operation?.amount).toBe("5000");
    }
  });

  test("a failed stage update leaves the previous stage in place", () => {
    const { storage, backing, fail } = makeStorage();
    expect(startCctpOperation(storage, { chain: "amoy", amount: "1" }).ok).toBe(true);
    expect(updateCctpOperation(storage, { stage: "burn-pending", burnHash: HASH_B }).ok).toBe(true);

    fail.set = true;
    expect(updateCctpOperation(storage, { stage: "burn-confirmed" }).ok).toBe(false);
    fail.set = false;

    const read = readCctpOperation(storage);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.operation?.stage).toBe("burn-pending");
      expect(read.operation?.burnHash).toBe(HASH_B);
    }
    expect(backing.has(CCTP_OPERATION_KEY)).toBe(true);
  });

  test("clearing is verified, and an unverified clear keeps the marker", () => {
    const { storage, backing, fail } = makeStorage();
    expect(startCctpOperation(storage, { chain: "sepolia", amount: "1" }).ok).toBe(true);

    fail.remove = true;
    expect(clearCctpOperation(storage).ok).toBe(false);
    expect(backing.has(CCTP_OPERATION_KEY)).toBe(true);

    fail.remove = false;
    fail.get = true;
    expect(clearCctpOperation(storage).ok).toBe(false);
    fail.get = false;

    expect(clearCctpOperation(storage).ok).toBe(true);
    expect(backing.has(CCTP_OPERATION_KEY)).toBe(false);
  });
});

describe("CCTP stage decisions", () => {
  const cases: Array<[CctpStage, "confirmed" | "reverted" | "unknown", string, boolean]> = [
    ["approval-pending", "confirmed", "advance", false],
    ["approval-pending", "reverted", "fail", true],
    ["approval-pending", "unknown", "stop", false],
    ["burn-pending", "confirmed", "advance", false],
    ["burn-pending", "reverted", "fail", true],
    ["burn-pending", "unknown", "stop", false],
    ["mint-pending", "confirmed", "advance", true],
    ["mint-pending", "reverted", "stop", false],
    ["mint-pending", "unknown", "stop", false],
  ];

  for (const [stage, receipt, action, clear] of cases) {
    test(`${stage} + ${receipt} => ${action}`, () => {
      const decision = cctpStageDecision(stage, receipt);
      expect(decision.action).toBe(action);
      expect(decision.clearOperation).toBe(clear);
      if (action === "advance") expect(decision.next).not.toBeNull();
    });
  }

  test("a confirmed mint is the only advance that clears the operation", () => {
    expect(cctpStageDecision("mint-pending", "confirmed").clearOperation).toBe(true);
    expect(cctpStageDecision("burn-pending", "confirmed").clearOperation).toBe(false);
    expect(cctpStageDecision("approval-pending", "confirmed").clearOperation).toBe(false);
  });

  test("an unknown receipt always keeps the operation and never advances", () => {
    for (const stage of ["approval-pending", "burn-pending", "mint-pending"] as const) {
      const decision = cctpStageDecision(stage, "unknown");
      expect(decision.action).toBe("stop");
      expect(decision.clearOperation).toBe(false);
      expect(decision.next).toBeNull();
    }
  });

  test("a stage with no defined transition stops instead of guessing", () => {
    for (const stage of ["started", "approval-confirmed", "burn-confirmed", "mint-confirmed"] as const) {
      const decision = cctpStageDecision(stage, "confirmed");
      expect(decision.action).toBe("stop");
      expect(decision.clearOperation).toBe(false);
    }
  });
});

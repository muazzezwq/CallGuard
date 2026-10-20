/* Classification of the facilitator response, kept pure so the payment-safety
   rules are testable without a component harness.

   The response body is unauthenticated. No field in it can prove that USDC did
   not move: `PRE_SETTLEMENT`, `demo` and `settled:false` are claims made by the
   same process that would have broadcast the settlement, and a single nonce
   read cannot rule out a pending or racing transaction.

   Three outcomes exist:

   - `settled`: the body carries a transaction hash. This is still only a clue:
     the caller must read that receipt itself before treating the attempt as
     confirmed or reverted.
   - `reverted`: the facilitator returned its exact terminal reverted schema
     with a valid transaction hash. The caller still reads the receipt before
     trusting it, but this outcome is not left indefinitely uncertain.
   - `uncertain`: everything else, including claims of no settlement. The guard
     stays and no automatic on-chain fallback is started. Recovery is explicit
     and manual.

   `permitsOnChainFallback` is kept as a named, always-false decision so a future
   change cannot quietly re-enable an unproven fallback. */


export const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/* Keep these names in sync with the constants in `api/call-service.js`.
   The code is the trustworthy indicator; the error string is only a detail. */
export const PRE_SETTLEMENT_CODE = "PRE_SETTLEMENT";
export const AUTHORIZATION_ALREADY_USED_CODE = "AUTHORIZATION_ALREADY_USED";
export const SETTLEMENT_REVERTED_CODE = "SETTLEMENT_REVERTED";

/* Keep this list in sync with the 402 responses in `api/call-service.js`.
   These errors are emitted before `callServiceWithAuthorization` is sent.
   `Nonce already used` is deliberately absent: a consumed authorization may
   have settled earlier, so it cannot prove that no payment occurred. */
const PRE_SETTLEMENT_402_ERRORS: ReadonlySet<string> = new Set([
  "Signature mismatch",
  "Authorization not yet valid",
  "Authorization expired",
  "Authorization 'to' must be the PayPerCall contract",
  "Provider not active",
  "Authorization value must equal provider pricePerCall",
]);

/* The 402 schema emitted by the API. Any extra field may describe settlement,
   so it makes the response uncertain instead of fallback-eligible. */
const PRE_SETTLEMENT_402_KEYS: ReadonlySet<string> = new Set([
  "error",
  "code",
  "x402Version",
  "accepts",
]);

/* The success schema emitted by the API. An unknown field is not trusted. */
const SETTLEMENT_KEYS: ReadonlySet<string> = new Set([
  "success",
  "error",
  "txHash",
  "demo",
  "settled",
  "callId",
  "blockNumber",
  "message",
]);

/* The exact terminal reverted schema. Unknown fields make the response
   uncertain instead of extending this allowlist silently. */
const SETTLEMENT_REVERTED_KEYS: ReadonlySet<string> = new Set([
  "success",
  "code",
  "error",
  "txHash",
  "operationId",
]);

function isTxHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && TX_HASH_RE.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(record).every(key => allowed.has(key));
}

function errorDetail(record: Record<string, unknown>): string {
  return typeof record.error === "string" ? record.error.trim() : "";
}

export type FacilitatorBody = {
  success?: boolean;
  error?: string;
  code?: string;
  txHash?: string | null;
  demo?: boolean;
  settled?: boolean;
  callId?: string | null;
  blockNumber?: number | null;
  message?: string;
  operationId?: string;
};

export type FacilitatorOutcome =
  | { kind: "settled"; txHash: `0x${string}` }
  | { kind: "reverted"; txHash: `0x${string}` }
  | { kind: "uncertain"; detail: string };

/** No response body can authorise a second, on-chain payment. Always false. */
export function permitsOnChainFallback(_outcome: FacilitatorOutcome): boolean {
  return false;
}

export function classifyFacilitatorResult(input: {
  reached: boolean;
  status: number;
  body: FacilitatorBody | null;
}): FacilitatorOutcome {
  if (!input.reached) {
    return {
      kind: "uncertain",
      detail: "The facilitator request failed before it returned a response.",
    };
  }

  if (input.status === 402) {
    const body = asRecord(input.body);
    if (!body) {
      return {
        kind: "uncertain",
        detail: "The facilitator returned HTTP 402 without a readable response. No automatic fallback was sent.",
      };
    }

    if (body.error !== undefined && typeof body.error !== "string") {
      return {
        kind: "uncertain",
        detail: "The facilitator returned HTTP 402 with a malformed error field. No automatic fallback was sent.",
      };
    }
    if (body.code !== undefined && typeof body.code !== "string") {
      return {
        kind: "uncertain",
        detail: "The facilitator returned HTTP 402 with a malformed settlement code. No automatic fallback was sent.",
      };
    }

    const error = errorDetail(body);
    const code = typeof body.code === "string" ? body.code : "";
    const nonceUsed = error === "Nonce already used" || code === AUTHORIZATION_ALREADY_USED_CODE;

    if (nonceUsed) {
      return {
        kind: "uncertain",
        detail: "The facilitator returned HTTP 402 (Nonce already used). The authorization nonce is already in use, so an earlier settlement may exist. No automatic fallback was sent.",
      };
    }

    if (error && PRE_SETTLEMENT_402_ERRORS.has(error) && code === PRE_SETTLEMENT_CODE
        && hasOnlyKeys(body, PRE_SETTLEMENT_402_KEYS)) {
      /* Shaped like a pre-settlement rejection, but the claim is not proof.
         The guard stays and no fallback starts. */
      return {
        kind: "uncertain",
        detail: `The facilitator reported "${error}" with its pre-settlement code. That response is not authenticated and the signed authorization may still be settleable, so it is not proof that no payment occurred. No automatic fallback was sent.`,
      };
    }

    if (error) {
      return {
        kind: "uncertain",
        detail: `The facilitator returned HTTP 402 (${error}) without a trustworthy pre-settlement code. No automatic fallback was sent.`,
      };
    }
    return {
      kind: "uncertain",
      detail: "The facilitator returned HTTP 402 without a known pre-settlement error. No automatic fallback was sent.",
    };
  }

  if (input.status === 409) {
    const body = asRecord(input.body);
    if (body && body.code === SETTLEMENT_REVERTED_CODE) {
      if (body.success !== false) {
        return {
          kind: "uncertain",
          detail: "The facilitator returned a reverted settlement without a false success flag.",
        };
      }
      if (typeof body.error !== "string" || !body.error.trim()) {
        return {
          kind: "uncertain",
          detail: "The facilitator returned a reverted settlement without a readable error.",
        };
      }
      if (body.operationId !== undefined && typeof body.operationId !== "string") {
        return {
          kind: "uncertain",
          detail: "The facilitator returned a reverted settlement with a malformed operation id.",
        };
      }
      if (!hasOnlyKeys(body, SETTLEMENT_REVERTED_KEYS)) {
        return {
          kind: "uncertain",
          detail: "The facilitator returned a reverted settlement with an unknown field.",
        };
      }
      if (!isTxHash(body.txHash)) {
        return {
          kind: "uncertain",
          detail: "The facilitator returned a reverted settlement without a valid transaction hash.",
        };
      }
      return { kind: "reverted", txHash: body.txHash };
    }
  }

  const httpOk = input.status >= 200 && input.status < 300;
  const httpBody = asRecord(input.body);
  if (!httpOk) {
    return {
      kind: "uncertain",
      detail: (httpBody && errorDetail(httpBody)) || `The facilitator returned HTTP ${input.status}.`,
    };
  }

  if (!httpBody) {
    return {
      kind: "uncertain",
      detail: "The facilitator returned an unreadable success response.",
    };
  }

  if (!hasOnlyKeys(httpBody, SETTLEMENT_KEYS)) {
    return {
      kind: "uncertain",
      detail: "The facilitator returned success with an unknown settlement field. No automatic fallback was sent.",
    };
  }

  if (httpBody.error !== undefined) {
    return {
      kind: "uncertain",
      detail: "The facilitator returned success together with an error field. The result is contradictory.",
    };
  }

  if (httpBody.success !== true) {
    return {
      kind: "uncertain",
      detail: errorDetail(httpBody) || "The facilitator did not return a confirmed settlement.",
    };
  }

  if (httpBody.demo !== undefined && typeof httpBody.demo !== "boolean") {
    return {
      kind: "uncertain",
      detail: "The facilitator returned a malformed demo flag. No automatic fallback was sent.",
    };
  }
  if (httpBody.settled !== undefined && typeof httpBody.settled !== "boolean") {
    return {
      kind: "uncertain",
      detail: "The facilitator returned a malformed settled flag. No automatic fallback was sent.",
    };
  }
  if (httpBody.callId !== undefined && httpBody.callId !== null
      && typeof httpBody.callId !== "string") {
    return {
      kind: "uncertain",
      detail: "The facilitator returned a malformed call id.",
    };
  }
  if (httpBody.blockNumber !== undefined && httpBody.blockNumber !== null
      && (typeof httpBody.blockNumber !== "number" || !Number.isInteger(httpBody.blockNumber))) {
    return {
      kind: "uncertain",
      detail: "The facilitator returned a malformed block number.",
    };
  }
  if (httpBody.txHash !== undefined && httpBody.txHash !== null
      && (typeof httpBody.txHash !== "string" || !isTxHash(httpBody.txHash))) {
    return {
      kind: "uncertain",
      detail: "The facilitator reported success but returned no valid transaction hash.",
    };
  }

  const hash = isTxHash(httpBody.txHash) ? httpBody.txHash : null;
  const demo = httpBody.demo === true;
  const settledFalse = httpBody.settled === false;

  /* A transaction hash is stronger evidence than a demo/no-settlement flag.
     When they disagree, no conclusion is safe: keep the guard and do not
     start an on-chain fallback. */
  if (hash) {
    if (demo || settledFalse) {
      return {
        kind: "uncertain",
        detail: "The facilitator returned a transaction hash together with a demo or not-settled flag. The evidence is contradictory. No automatic fallback was sent.",
      };
    }
    return { kind: "settled", txHash: hash };
  }

  if (httpBody.blockNumber !== undefined && httpBody.blockNumber !== null) {
    return {
      kind: "uncertain",
      detail: "The facilitator returned a block number without a valid transaction hash. The evidence is contradictory.",
    };
  }

  if (demo && !settledFalse && httpBody.settled === true) {
    return {
      kind: "uncertain",
      detail: "The facilitator reported demo mode together with settled:true. The evidence is contradictory.",
    };
  }

  if (settledFalse && httpBody.callId !== undefined && httpBody.callId !== null && !demo) {
    return {
      kind: "uncertain",
      detail: "The facilitator reported a call id together with settled:false and no demo flag. The evidence is contradictory.",
    };
  }

  if (demo || settledFalse) {
    return {
      kind: "uncertain",
      detail: "The facilitator reported demo mode or settled:false. That claim is unauthenticated and cannot prove that no USDC moved. No automatic fallback was sent; the guard stays until the outcome is verified or explicitly acknowledged.",
    };
  }

  if (httpBody.txHash !== undefined) {
    return {
      kind: "uncertain",
      detail: "The facilitator reported success but returned no valid transaction hash.",
    };
  }

  return {
    kind: "uncertain",
    detail: "The facilitator reported success but returned no valid transaction hash.",
  };
}

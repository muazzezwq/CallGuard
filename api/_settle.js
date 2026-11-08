// api/_settle.js
// Shared helper for x402 gated demo endpoints. Vercel ignores files in api/
// whose name starts with "_", so this does NOT count against the 12-function
// Hobby limit.
//
// Previously the energy-data / premium-report endpoints only *verified* an
// EIP-3009 authorization but never consumed its nonce, so a single signed
// authorization could be replayed for unlimited data. Settling on-chain flips
// USDC's `authorizationState[from][nonce]` to true, making replay impossible.

import { ethers } from "ethers";
import { redact } from "./_redact.js";

const TRANSFER_ABI = [
  "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)",
];

/**
 * Settle an EIP-3009 authorization on-chain by submitting
 * transferWithAuthorization with the facilitator key. This consumes the nonce.
 *
 * `expectedTo` and `minValue` are required, not optional. The payment terms of a
 * route are the route's business; the signed authorization is whatever the
 * caller chose to sign. Both endpoints used to check the recipient and the
 * amount themselves, so a third endpoint that forgot settled an authorization
 * for an address it never configured. The checks belong here, next to the call
 * that moves the money.
 * @returns {Promise<{ok: true, txHash: string} | {ok: false, error: string}>}
 */
export async function settleEip3009({ auth, signature, usdcAddress, rpcUrl, expectedTo, minValue }) {
  const key = process.env.FACILITATOR_PRIVATE_KEY;
  if (!key) return { ok: false, error: "settlement not configured" };
  if (!rpcUrl) return { ok: false, error: "RPC not configured" };
  if (!usdcAddress) return { ok: false, error: "USDC address not configured" };
  if (!expectedTo) return { ok: false, error: "expected recipient not configured" };
  if (minValue === undefined || minValue === null) {
    return { ok: false, error: "minimum value not configured" };
  }

  let value;
  let validAfter;
  let validBefore;
  try {
    value = BigInt(auth.value);
    validAfter = BigInt(auth.validAfter);
    validBefore = BigInt(auth.validBefore);
  } catch {
    return { ok: false, error: "malformed authorization" };
  }

  if (String(auth.to || "").toLowerCase() !== String(expectedTo).toLowerCase()) {
    return { ok: false, error: "payment recipient mismatch" };
  }
  if (value < BigInt(minValue)) {
    return { ok: false, error: "payment amount too low" };
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (validAfter > now || validBefore < now) {
    return { ok: false, error: "authorization not currently valid" };
  }

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(key, provider);
    const usdc = new ethers.Contract(usdcAddress, TRANSFER_ABI, wallet);
    const { v, r, s } = ethers.Signature.from(signature);
    const tx = await usdc.transferWithAuthorization(
      auth.from,
      auth.to,
      auth.value,
      auth.validAfter,
      auth.validBefore,
      auth.nonce,
      v,
      r,
      s,
      { gasLimit: 200000 }
    );
    const receipt = await tx.wait();
    return { ok: true, txHash: receipt.hash };
  } catch (e) {
    // Never leak RPC URL/token embedded in provider error messages.
    return { ok: false, error: redact(e.shortMessage || e.reason || e.name || "settlement failed") };
  }
}

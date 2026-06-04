import { makeFacilitator } from "../x402-facilitator/facilitator.js";
import { ethers } from "ethers";

const env = process.env;
let fac;
try { fac = makeFacilitator(env); } catch(e) { fac = null; }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const amountAtomic = "1000";
  const payTo = env.FACILITATOR_ADDRESS || (fac ? fac.facilitatorAddress : "0x0");

  if (req.method === "GET") {
    return res.status(402).json({
      status: 402,
      error: "Payment Required",
      accepts: [{
        scheme: "USDC",
        network: "base",
        maxAmountRequired: amountAtomic,
        resource: "/api/nano-service",
        description: "Nano service call",
        payTo,
        maxTimeoutSeconds: 30,
        asset: "USDC",
        extra: { verifyingContract: env.USDC_ADDRESS }
      }]
    });
  }

  if (req.method === "POST") {
    try {
      const sig = req.headers["payment-signature"];
      if (!sig) return res.status(402).json({ error: "No payment signature" });

      const payment = JSON.parse(Buffer.from(sig, "base64").toString());
      const verify = await fac.verify(payment);
      if (!verify.isValid) return res.status(402).json({ error: verify.reason });

      const settle = await fac.settle(payment);
      return res.json({ ok: true, payer: payment.authorization.from, tx: settle.txHash });
    } catch(e) {      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).end();
}

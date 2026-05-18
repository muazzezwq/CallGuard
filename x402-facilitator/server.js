import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { makeFacilitator } from "./facilitator.js";

dotenv.config();
const env = process.env;
const app = express();
app.use(cors());
app.use(express.json());

const fac = makeFacilitator(env);
console.log("Facilitator cuzdani:", fac.facilitatorAddress);

// Bu ornek "korunan kaynak" — gercekte ArcSLA provider endpoint'i olur
const PRICE = "1000000"; // 1 USDC (6 ondalik)
const PAY_TO = fac.facilitatorAddress; // demo: facilitator kendine alir

function paymentRequirements() {
  return {
    scheme: "exact",
    network: "arc-testnet",
    maxAmountRequired: PRICE,
    asset: env.USDC_ADDRESS,
    payTo: PAY_TO,
    resource: "/api/service",
    description: "ArcSLA korumali servis cagrisi",
    maxTimeoutSeconds: 120,
  };
}

// ---- Korunan kaynak: X-PAYMENT yoksa 402 doner ----
app.get("/api/service", async (req, res) => {
  const header = req.headers["x-payment"];
  if (!header) {
    return res.status(402).json({
      x402Version: 1,
      accepts: [paymentRequirements()],
      error: "Payment Required",
    });
  }
  try {
    const payment = JSON.parse(Buffer.from(header, "base64").toString());
    const v = await fac.verify(payment, paymentRequirements());
    if (!v.isValid) return res.status(402).json({ error: v.reason });

    const s = await fac.settle(payment);
    res.setHeader("X-PAYMENT-RESPONSE",
      Buffer.from(JSON.stringify(s)).toString("base64"));
    return res.json({ ok: true, data: "pong", payment: s });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ---- Facilitator API (baska servisler de kullanabilir) ----
app.post("/verify", async (req, res) => {
  try {
    res.json(await fac.verify(req.body.payment, req.body.requirements));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/settle", async (req, res) => {
  try {
    res.json(await fac.settle(req.body.payment));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/health", (_, res) =>
  res.json({ ok: true, facilitator: fac.facilitatorAddress }));

app.listen(env.PORT || 4021, () =>
  console.log(`x402 facilitator :${env.PORT || 4021}`));

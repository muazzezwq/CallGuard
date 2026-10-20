/**
 * /api/energy-data — Arkreen Energy Data Provider Endpoint
 *
 * CallGuard provider endpoint for SLA-guaranteed energy data.
 *
 * x402 payment verification: the X-Payment header is checked.
 * Fetches real kWh data from the Arkreen API (or returns a testnet mock).
 */

import { V7 } from './_contracts.js';
import { settleEip3009 } from './_settle.js';
import { getRpcUrl } from './_rpc.js';
import { logError, safeLogValue } from './_redact.js';

// Canonical v7 USDC and chain; facilitator/seller remain runtime configuration.
const USDC_ADDR   = V7.USDC;
const FACILITATOR = process.env.FACILITATOR_ADDRESS  || '';
const SELLER      = process.env.SELLER_ADDRESS       || '';
const CHAIN_ID    = V7.CHAIN_ID;
const PRICE_ATOMIC = '10000'; // 0.01 USDC in 6-decimal units

const PAYMENT_TERMS = {
  accepts: [
    {
      scheme:   'exact',
      network:  'eip155:5042002',
      asset:    USDC_ADDR,
      payTo:    FACILITATOR,
      maxAmountRequired: '10000', // 0.01 USDC in 6-decimal units
      resource:    'https://arcsla.vercel.app/api/energy-data',
      description: 'Arkreen kWh energy data — SLA guaranteed via CallGuard',
      mimeType:    'application/json',
      outputSchema: {
        type: 'object',
        properties: {
          timestamp:  { type: 'number', description: 'Unix timestamp' },
          wh:         { type: 'number', description: 'Watt-hours generated' },
          minerAddr:  { type: 'string', description: 'Arkreen miner address' },
          network:    { type: 'string' },
          source:     { type: 'string' },
        }
      }
    }
  ]
};

async function fetchArkreenData(minerAddr) {
  const ARKREEN_API = process.env.ARKREEN_API_URL;
  // Validate the miner address before interpolating it into the upstream URL
  // to prevent path/query injection into the Arkreen API.
  if (ARKREEN_API && minerAddr && /^0x[0-9a-fA-F]{40}$/.test(minerAddr)) {
    try {
      const res = await fetch(`${ARKREEN_API}/miner/${minerAddr}/latest`);
      if (res.ok) return await res.json();
    } catch (e) {
      logError('Arkreen API error', e);
    }
  }

  // Testnet simulated data — realistic solar curve based on time of day
  const timeOfDay = new Date().getHours();
  const solarMultiplier = (timeOfDay >= 6 && timeOfDay <= 18)
    ? Math.sin(((timeOfDay - 6) / 12) * Math.PI)
    : 0;
  const baseWh = 450 + Math.floor(Math.random() * 200);

  return {
    timestamp:   Math.floor(Date.now() / 1000),
    wh:          Math.floor(baseWh * solarMultiplier),
    minerAddr:   minerAddr || SELLER,
    network:     'Arc Testnet',
    source:      'Arkreen DePIN (testnet simulated)',
    pv_voltage:  (220 + Math.random() * 30).toFixed(1),
    pv_current:  (2.1 + Math.random() * 0.8).toFixed(2),
    temperature: (28 + Math.random() * 5).toFixed(1),
    dataQuality: 'verified',
    arec_eligible: true,
  };
}

async function verifyPaymentHeader(req) {
  const xPayment = req.headers['x-payment'];
  if (!xPayment) return { ok: false };
  try {
    const decoded = Buffer.from(xPayment, 'base64').toString('utf8');
    const payment = JSON.parse(decoded);
    const auth = payment.authorization || payment;
    if (!auth?.from || !auth?.to || !auth?.value || !auth?.nonce) return { ok: false };
    const sigBytes = payment.signature;
    if (!sigBytes || !USDC_ADDR || !FACILITATOR) return { ok: false };

    // Real EIP-3009 verification — recipient, amount and expiry enforced.
    const { ethers } = await import('ethers');
    const domain = { name: 'USDC', version: '2', chainId: CHAIN_ID, verifyingContract: USDC_ADDR };
    const types = { TransferWithAuthorization: [
      { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
    ]};
    const recovered = ethers.verifyTypedData(domain, types, auth, sigBytes);
    if (recovered.toLowerCase() !== String(auth.from).toLowerCase()) return { ok: false };
    if (String(auth.to).toLowerCase() !== FACILITATOR.toLowerCase()) return { ok: false };
    if (BigInt(auth.value) < BigInt(PRICE_ATOMIC)) return { ok: false };
    const now = Math.floor(Date.now() / 1000);
    if (Number(auth.validAfter) > now || Number(auth.validBefore) < now) return { ok: false };
    return { ok: true, auth, signature: sigBytes };
  } catch {
    return { ok: false };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Payment, X-Machine-Id, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // No payment header → return 402 + terms (BoAT reads these)
  if (!req.headers['x-payment']) {
    return res.status(402).json({
      ...PAYMENT_TERMS,
      error:   'Payment Required',
      message: 'Send X-Payment header with base64-encoded EIP-3009 authorization.',
    });
  }

  const verification = await verifyPaymentHeader(req);
  if (!verification.ok) {
    return res.status(402).json({
      ...PAYMENT_TERMS,
      error:   'Invalid Payment',
      message: 'X-Payment header missing or malformed.',
    });
  }

  // Consume the nonce by settling on-chain — without this the same signed
  // authorization could be replayed for unlimited data.
  const settlement = await settleEip3009({
    auth: verification.auth,
    signature: verification.signature,
    usdcAddress: USDC_ADDR,
    rpcUrl: getRpcUrl(),
  });
  if (!settlement.ok) {
    logError('[energy-data] settlement failed', { message: settlement.error });
    return res.status(503).json({ error: 'Payment settlement unavailable' });
  }

  const body      = req.body || {};
  const payload   = body.payload   || req.query.payload || 'kwh_now';
  const minerAddr = body.minerAddr || req.query.miner   || SELLER;
  const machineId = req.headers['x-machine-id'] || 'unknown';
  const payloadLog = typeof payload === 'string' ? `len=${payload.length}` : 'non-string';

  // Never log the request payload contents: they can carry caller data and
  // newline injection lets a caller forge additional log lines.
  console.log(`[energy-data] machine=${safeLogValue(machineId, 64)} payload=${payloadLog} miner=${safeLogValue(minerAddr, 64)}`);

  const data = await fetchArkreenData(minerAddr);

  return res.status(200).json({
    success: true,
    data,
    sla: {
      respondedAt:  Math.floor(Date.now() / 1000),
      provider:     'Arkreen via CallGuard',
      guarantee:    '30s SLA window',
      slashOnMiss:  '50%',
      settlement:   'Arc Testnet on-chain',
    },
    meta: {
      machineId,
      payload,
      settlementTx: settlement.txHash,
      callguardContract: V7.PAY_PER_CALL,
    }
  });
}

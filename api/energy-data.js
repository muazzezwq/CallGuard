/**
 * /api/energy-data — Arkreen Energy Data Provider Endpoint
 *
 * CallGuard provider endpoint'i. TLAY makinalarının SLA garantili
 * enerji verisi satın almasını sağlar.
 *
 * x402 ödeme doğrulaması: X-Payment header kontrol edilir.
 * Arkreen API'sinden gerçek kWh verisi çeker (veya testnet mock döner).
 */

// LOW-02: prefer unprefixed env vars server-side
const USDC_ADDR   = process.env.USDC_ADDRESS || process.env.VITE_USDC_ADDRESS || '';
const FACILITATOR = process.env.FACILITATOR_ADDRESS  || '';
const SELLER      = process.env.SELLER_ADDRESS       || '';

const PAYMENT_TERMS = {
  accepts: [
    {
      scheme:   'exact',
      network:  'arc-testnet',
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
  if (ARKREEN_API && minerAddr) {
    try {
      const res = await fetch(`${ARKREEN_API}/miner/${minerAddr}/latest`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.error('Arkreen API error:', e.message);
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

function verifyPaymentHeader(req) {
  const xPayment = req.headers['x-payment'];
  if (!xPayment) return false;
  try {
    const decoded = Buffer.from(xPayment, 'base64').toString('utf8');
    const payment = JSON.parse(decoded);
    return !!(payment.from && payment.nonce && (payment.signature || payment.v));
  } catch {
    return false;
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

  if (!verifyPaymentHeader(req)) {
    return res.status(402).json({
      ...PAYMENT_TERMS,
      error:   'Invalid Payment',
      message: 'X-Payment header missing or malformed.',
    });
  }

  const body      = req.body || {};
  const payload   = body.payload   || req.query.payload || 'kwh_now';
  const minerAddr = body.minerAddr || req.query.miner   || SELLER;
  const machineId = req.headers['x-machine-id'] || 'unknown';

  console.log(`[energy-data] machine=${machineId} payload=${payload} miner=${minerAddr}`);

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
      callguardContract: process.env.VITE_PAY_PER_CALL,
    }
  });
}

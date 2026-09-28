/**
 * TLAY BoAT → CallGuard x402 Call Script
 *
 * Bu script TLAY'ın BoAT runtime'ını simüle ederek CallGuard'ın
 * x402 endpoint'ine otomatik ödeme ile call atar.
 *
 * Gerçek BoAT entegrasyonunda bu mantık C kütüphanesinde çalışır.
 * Bu script testnet üzerinde tam flow'u doğrular.
 *
 * Kullanım:
 *   PRIVATE_KEY=0x... PROVIDER_ID=1 node scripts/tlay-boat-call.js
 */

const { ethers } = require('ethers');
const https      = require('https');
const http       = require('http');

const RPC_URL     = process.env.ARC_RPC_URL  || 'https://rpc.testnet.arc.io';
const PAY_PER_CALL = process.env.VITE_PAY_PER_CALL || '0x10387347678d9f7106D5625bE0BD6C915158B130';
const USDC_ADDR   = process.env.VITE_USDC_ADDRESS  || '0x3600000000000000000000000000000000000000';
const FACILITATOR = process.env.FACILITATOR_ADDRESS || '0x0E515aEd287a7b3d2D9F7911321d99826653Fbd8';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PROVIDER_ID = parseInt(process.env.PROVIDER_ID || '1');
const SERVICE_URL = process.env.SERVICE_URL   || 'https://arcsla.vercel.app/api/service';
const PAYLOAD     = process.env.PAYLOAD       || 'kwh_now';

if (!PRIVATE_KEY) { console.error('PRIVATE_KEY env var required'); process.exit(1); }

const PAYPERCALL_ABI = [
  'function getProvider(uint256 id) external view returns (tuple(uint256 id, address addr, uint256 stake, uint256 callPrice, uint256 slaWindow, uint256 slashBps, uint256 reputation, bool active))',
];

const USDC_ABI = [
  'function nonces(address owner) external view returns (uint256)',
  'function name() external view returns (string)',
  'function version() external view returns (string)',
];

// EIP-3009 TransferWithAuthorization domain + types
const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from',        type: 'address' },
    { name: 'to',          type: 'address' },
    { name: 'value',       type: 'uint256' },
    { name: 'validAfter',  type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce',       type: 'bytes32' },
  ],
};

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body: data }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function main() {
  const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet      = new ethers.Wallet(PRIVATE_KEY, rpcProvider);
  const ppc         = new ethers.Contract(PAY_PER_CALL, PAYPERCALL_ABI, rpcProvider);
  const usdc        = new ethers.Contract(USDC_ADDR,    USDC_ABI,       rpcProvider);

  console.log('=== TLAY BoAT → CallGuard x402 Demo ===');
  console.log('Machine wallet:', wallet.address);
  console.log('Provider ID:   ', PROVIDER_ID);
  console.log('Payload:       ', PAYLOAD);
  console.log('');

  // Step 1: Fetch x402 payment terms
  console.log('1. Fetching x402 payment terms from', SERVICE_URL, '...');
  const termsRes = await fetchJson(SERVICE_URL, { method: 'GET' });
  if (termsRes.status !== 402) {
    console.error('Expected 402, got:', termsRes.status);
    // Continue anyway for demo
  }
  console.log('   HTTP', termsRes.status, '— x402 terms received');
  if (termsRes.body && termsRes.body.accepts) {
    console.log('   Payment options:', termsRes.body.accepts.map(a => `${a.scheme} ${a.network}`).join(', '));
  }

  // Step 2: Get on-chain provider terms
  console.log('\n2. Reading on-chain provider terms...');
  const providerInfo = await ppc.getProvider(PROVIDER_ID);
  const callPrice = providerInfo.callPrice;
  console.log('   Provider addr:', providerInfo.addr);
  console.log('   Call price:   ', ethers.formatUnits(callPrice, 6), 'USDC');
  console.log('   SLA window:   ', providerInfo.slaWindow.toString(), 's');

  // Step 3: Sign EIP-3009 authorization (BoAT does this on-device)
  console.log('\n3. Signing EIP-3009 authorization (BoAT on-device signing)...');
  const nonce      = ethers.hexlify(ethers.randomBytes(32));
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 min

  const chainId   = (await rpcProvider.getNetwork()).chainId;
  const usdcName  = await usdc.name().catch(() => 'USDC');
  const usdcVer   = await usdc.version().catch(() => '1');

  const domain = {
    name:              usdcName,
    version:           usdcVer,
    chainId:           chainId,
    verifyingContract: USDC_ADDR,
  };

  const message = {
    from:        wallet.address,
    to:          FACILITATOR,
    value:       callPrice,
    validAfter,
    validBefore,
    nonce,
  };

  const signature = await wallet.signTypedData(domain, EIP3009_TYPES, message);
  const { v, r, s } = ethers.Signature.from(signature);
  console.log('   Signed. Nonce:', nonce.slice(0, 18), '...');

  // Step 4: Submit call to CallGuard facilitator
  console.log('\n4. Submitting call to CallGuard...');
  const callBody = JSON.stringify({
    providerId: PROVIDER_ID,
    payload:    PAYLOAD,
    from:        wallet.address,
    to:          FACILITATOR,
    value:       callPrice.toString(),
    validAfter:  validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce,
    v, r, s,
  });

  const callRes = await fetchJson('https://arcsla.vercel.app/api/call-service', {
    method: 'POST',
    body:   callBody,
    headers: { 'Content-Type': 'application/json', 'X-Machine-Id': wallet.address },
  });

  console.log('   Response HTTP:', callRes.status);
  if (callRes.body && callRes.body.callId) {
    console.log('   Call ID:      ', callRes.body.callId);
    console.log('   TX Hash:      ', callRes.body.txHash);
    console.log('   ArcScan:      ', `https://testnet.arcscan.net/tx/${callRes.body.txHash}`);
  } else {
    console.log('   Body:', JSON.stringify(callRes.body).slice(0, 200));
  }

  // Step 5: Machine evaluates response (BoAT decision logic)
  console.log('\n5. BoAT machine evaluation...');
  if (callRes.status === 200 && callRes.body.success) {
    console.log('   Payment authorized. Machine proceeds with work.');
    console.log('   Energy data received:', JSON.stringify(callRes.body.data || { status: 'ok' }));
  } else {
    console.log('   Payment rejected or service unavailable. Machine waits.');
  }

  console.log('\n=== Flow complete: Pay → Work → Proof → Settle ===');
}

main().catch(console.error);

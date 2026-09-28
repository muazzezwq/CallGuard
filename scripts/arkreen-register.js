/**
 * Arkreen Node → CallGuard Provider Registration Script
 *
 * Bu script bir Arkreen node operatörünün CallGuard'a provider olarak
 * kayıt olmasını sağlar. Arkreen kWh verisi veya AREC fiyatı gibi
 * bir servisi SLA garantisiyle satışa sunar.
 *
 * Kullanım:
 *   PRIVATE_KEY=0x... node scripts/arkreen-register.js
 */

const { ethers } = require('ethers');

const RPC_URL       = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.io';
const SERVICE_REG   = process.env.VITE_SERVICE_REGISTRY || '0xea00f898C0eA249de7226b283e93C13eFa7BbcFF';
const USDC_ADDR     = process.env.VITE_USDC_ADDRESS     || '0x3600000000000000000000000000000000000000';
const PRIVATE_KEY   = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) { console.error('PRIVATE_KEY env var required'); process.exit(1); }

const REGISTRY_ABI = [
  'function register(uint256 stakeAmount, uint256 callPrice, uint256 slaWindow, uint256 slashBps, string calldata endpoint, string calldata metadata) external',
  'function getProvider(address addr) external view returns (tuple(uint256 id, address addr, uint256 stake, uint256 callPrice, uint256 slaWindow, uint256 slashBps, uint256 reputation, string endpoint, string metadata, bool active))',
];

const USDC_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address owner) external view returns (uint256)',
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
  const registry = new ethers.Contract(SERVICE_REG, REGISTRY_ABI, wallet);
  const usdc     = new ethers.Contract(USDC_ADDR,   USDC_ABI,     wallet);

  console.log('Wallet:', wallet.address);

  const balance = await usdc.balanceOf(wallet.address);
  console.log('USDC balance:', ethers.formatUnits(balance, 6));

  // Arkreen servis parametreleri
  const stakeAmount = ethers.parseUnits('1.0', 6);   // 1 USDC stake
  const callPrice   = ethers.parseUnits('0.01', 6);  // 0.01 USDC / call
  const slaWindow   = 30;                             // 30 saniye SLA
  const slashBps    = 5000;                           // %50 slash on timeout

  // Arkreen'in kWh veri endpoint'i — kendi node URL'nizi yazın
  const endpoint = process.env.ARKREEN_ENDPOINT || 'https://your-arkreen-node.example.com/api/energy';

  // Metadata: caller'lara servis hakkında bilgi
  const metadata = JSON.stringify({
    name:        'Arkreen Energy Data',
    description: 'Real-time kWh generation data from Arkreen DePIN node. Returns current solar output in Wh.',
    version:     '1.0.0',
    schema: {
      request:  { type: 'string', example: 'kwh_now' },
      response: { type: 'object', fields: ['timestamp', 'wh', 'minerAddr', 'signature'] }
    },
    tags: ['energy', 'depin', 'arkreen', 'solar', 'arec'],
    network: 'Arc Testnet',
    settlementToken: 'USDC',
  });

  console.log('\nRegistering Arkreen provider on CallGuard...');
  console.log('  Stake:     ', ethers.formatUnits(stakeAmount, 6), 'USDC');
  console.log('  Call price:', ethers.formatUnits(callPrice, 6), 'USDC');
  console.log('  SLA window:', slaWindow, 'seconds');
  console.log('  Slash:     ', slashBps / 100, '%');
  console.log('  Endpoint:  ', endpoint);

  // 1. Approve USDC for stake
  console.log('\n1. Approving USDC...');
  const approveTx = await usdc.approve(SERVICE_REG, stakeAmount);
  await approveTx.wait();
  console.log('   Approved:', approveTx.hash);

  // 2. Register
  console.log('2. Registering...');
  const registerTx = await registry.register(
    stakeAmount, callPrice, slaWindow, slashBps, endpoint, metadata
  );
  await registerTx.wait();
  console.log('   Registered:', registerTx.hash);

  // 3. Confirm
  const info = await registry.getProvider(wallet.address);
  console.log('\nProvider registered successfully!');
  console.log('  Provider ID:', info.id.toString());
  console.log('  ArcScan:   ', `https://testnet.arcscan.net/tx/${registerTx.hash}`);
}

main().catch(console.error);

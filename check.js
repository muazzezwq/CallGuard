#!/usr/bin/env node
// CallGuard environment check — run before starting the app
// Usage: node check.js

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

function ok(msg) { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function err(msg) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${YELLOW}!${RESET} ${msg}`); }
function section(title) { console.log(`\n${BOLD}${title}${RESET}`); }

let exitCode = 0;

// Load .env
const envPath = resolve(process.cwd(), '.env');
let env = {};
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim();
  });
  ok('.env file found');
} else {
  warn('.env not found — copy .env.example to .env');
}

section('Required environment variables');

const required = [
  { key: 'FACILITATOR_PRIVATE_KEY', desc: 'Facilitator wallet private key (0x...)', secret: true },
  { key: 'ARC_RPC_URL', desc: 'Arc RPC endpoint', example: 'https://rpc.testnet.arc.io' },
  { key: 'VITE_PAY_PER_CALL', desc: 'PayPerCall contract address', example: '0x51bbd776d01bbb99b5425c701f00b2c516215e2e' },
  { key: 'VITE_SERVICE_REGISTRY', desc: 'ServiceRegistry contract address', example: '0xea00f898C0eA249de7226b283e93C13eFa7BbcFF' },
  { key: 'VITE_USDC_ADDRESS', desc: 'USDC address (Arc native)', example: '0x3600000000000000000000000000000000000000' },
  { key: 'VITE_CHAIN_ID', desc: 'Chain ID', example: '5042002' },
];

const optional = [
  { key: 'SELLER_PRIVATE_KEY', desc: 'Auto-receipt provider private key', secret: true },
  { key: 'AGENT_PRIVATE_KEY', desc: 'Agent wallet hot key', secret: true },
  { key: 'AGENT_WALLET_ADDRESS', desc: 'AgentWallet contract address' },
  { key: 'PROVIDER_1_WEBHOOK', desc: 'Auto-receipt webhook URL', example: 'https://arcsla.vercel.app/api/auto-receipt' },
  { key: 'VITE_SLA_ATTESTATION_BRIDGE', desc: 'SLAAttestationBridge address', example: '0x62a63a94a41601fdb8e9d60ed7e56b1e4c4c5da7' },
];

let missingRequired = [];
required.forEach(({ key, desc, example, secret }) => {
  const val = env[key] || process.env[key];
  if (!val) {
    err(`${key} — ${desc}${example ? `\n       Example: ${key}=${example}` : ''}`);
    missingRequired.push(key);
    exitCode = 1;
  } else {
    const display = secret ? '***' : val.length > 30 ? val.slice(0, 12) + '…' + val.slice(-6) : val;
    ok(`${key} = ${display}`);
  }
});

section('Optional environment variables');
optional.forEach(({ key, desc, example, secret }) => {
  const val = env[key] || process.env[key];
  if (!val) {
    warn(`${key} — ${desc} (optional)${example ? `\n       Example: ${key}=${example}` : ''}`);
  } else {
    const display = secret ? '***' : val.length > 30 ? val.slice(0, 12) + '…' + val.slice(-6) : val;
    ok(`${key} = ${display}`);
  }
});

section('Contract address validation');
const contracts = {
  VITE_PAY_PER_CALL: '0x51bbd776d01bbb99b5425c701f00b2c516215e2e',
  VITE_SERVICE_REGISTRY: '0xea00f898C0eA249de7226b283e93C13eFa7BbcFF',
  VITE_USDC_ADDRESS: '0x3600000000000000000000000000000000000000',
};
Object.entries(contracts).forEach(([key, expected]) => {
  const val = (env[key] || process.env[key] || '').toLowerCase();
  if (val && val !== expected.toLowerCase()) {
    warn(`${key} does not match expected testnet address\n       Got: ${val}\n       Expected: ${expected}`);
  } else if (val) {
    ok(`${key} matches testnet address`);
  }
});

section('Summary');
if (missingRequired.length === 0) {
  console.log(`\n  ${GREEN}${BOLD}All required variables set. You're good to go!${RESET}`);
  console.log(`  ${DIM}Run: bun run dev${RESET}\n`);
} else {
  console.log(`\n  ${RED}${BOLD}${missingRequired.length} required variable(s) missing.${RESET}`);
  console.log(`  ${DIM}1. Get testnet USDC: https://faucet.circle.com`);
  console.log(`  2. Copy .env.example to .env and fill in the values`);
  console.log(`  3. Run: node check.js to verify${RESET}\n`);
}

process.exit(exitCode);

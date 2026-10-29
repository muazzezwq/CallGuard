#!/usr/bin/env node
// CallGuard environment check — run before starting the app
// Usage: node check.js
//
// Validates the env vars the code actually reads (api/, x402-facilitator/,
// scripts/). Unprefixed server vars are preferred; VITE_* accepted as fallback
// wherever the code supports it.

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

// Load .env (strip surrounding quotes)
const envPath = resolve(process.cwd(), '.env');
let env = {};
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    // `source .env` does NOT export vars — remind once
    env[k] = v;
  });
  ok('.env file found');
} else {
  warn('.env not found — copy .env.example to .env');
}

const get = (key) => env[key] || process.env[key] || '';

// A var counts as set if the primary OR any accepted fallback is set.
function getAny(...keys) {
  for (const k of keys) {
    const v = get(k);
    if (v) return { key: k, val: v };
  }
  return { key: keys[0], val: '' };
}

// Active v8 pair (AGENTS.md) — used for address validation.
const V8 = {
  SERVICE_REGISTRY: '0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3',
  PAY_PER_CALL: '0xedce61eF5be31DC22cEfE342692622A26919a7EF',
  SLA_KEEPER: '0xBe897043e4c21cFe9A6532e43542CA48EaD83CB7',
  DISPUTE_V4: '0xECDb019F1E92Ad35324cc7bBDf1D56b9e70B305B',
  EVIDENCE_V2: '0x64872c29A19dF8E471103d0708397BAb96A311FC',
  USDC: '0x3600000000000000000000000000000000000000',
  CHAIN_ID: '5042002',
};

// Retired 24 Oct 2026: deployed, readable, no locked funds, no route defaults to it.
const V7 = {
  SERVICE_REGISTRY: '0x9ca97010464e8e6de6e27cf25eae9b939fbd7333',
  PAY_PER_CALL: '0x5fb41dd22c44e1de08f37d98c2995a62d6220540',
};

section('Required environment variables');

const required = [
  { keys: ['ARC_RPC_URL', 'ARC_TESTNET_RPC_URL', 'RPC_URL'], desc: 'Arc RPC endpoint', example: 'https://rpc.testnet.arc.io' },
  { keys: ['PAY_PER_CALL_V8', 'VITE_PAY_PER_CALL_V8'], desc: 'PayPerCallV8 address (the active call path)', example: V8.PAY_PER_CALL },
  { keys: ['SERVICE_REGISTRY_V8', 'VITE_SERVICE_REGISTRY_V8'], desc: 'ServiceRegistryV8 address (the active registry)', example: V8.SERVICE_REGISTRY },
  { keys: ['USDC_ADDRESS', 'VITE_USDC_ADDRESS'], desc: 'USDC address (Arc native)', example: V8.USDC },
  { keys: ['CHAIN_ID', 'VITE_CHAIN_ID'], desc: 'Chain ID', example: V8.CHAIN_ID },
  { keys: ['SELLER_PRIVATE_KEY'], desc: 'Auto-receipt signer (or PROVIDER_<id>_KEY)', secret: true },
  { keys: ['PROVIDER_WEBHOOK_SECRET', 'AUTO_RECEIPT_SECRET'], desc: 'Webhook HMAC secret (x-webhook-secret)', secret: true },
  { keys: ['FACILITATOR_PRIVATE_KEY'], desc: 'x402 settlement signer (else call-service = demo mode)', secret: true },
  { keys: ['NANO_API_KEY'], desc: 'Gates POST /api/nano-call (fail-closed)', secret: true },
  { keys: ['SELLER_ADDRESS'], desc: 'Nano-call recipient + energy-data default miner' },
];

let missingRequired = [];
required.forEach(({ keys, desc, example, secret }) => {
  const { key, val } = getAny(...keys);
  if (!val) {
    err(`${keys.join(' | ')} — ${desc}${example ? `\n       Example: ${keys[0]}=${example}` : ''}`);
    missingRequired.push(keys[0]);
    exitCode = 1;
  } else {
    const display = secret ? '***' : val.length > 30 ? val.slice(0, 12) + '…' + val.slice(-6) : val;
    const via = key !== keys[0] ? ` (via ${key})` : '';
    ok(`${keys[0]} = ${display}${via}`);
  }
});

section('Optional environment variables');
const optional = [
  { keys: ['BUYER_PRIVATE_KEY'], desc: 'Nano-call custodial buyer', secret: true },
  { keys: ['FACILITATOR_ADDRESS', 'VITE_FACILITATOR_ADDRESS'], desc: 'x402 payTo address' },
  { keys: ['AGENT_PRIVATE_KEY'], desc: 'Agent wallet hot key', secret: true },
  { keys: ['AGENT_WALLET_ADDRESS'], desc: 'AgentWallet contract address' },
  { keys: ['CIRCLE_API_KEY'], desc: 'Enables Circle refund relay in auto-receipt', secret: true },
  { keys: ['UPTIME_ORACLE_PRIVATE_KEY'], desc: 'DePIN oracle bot key', secret: true },
  { keys: ['GATEWAY_BATCH_URL', 'GATEWAY_BATCH_API_KEY'], desc: 'Circle Gateway nano batching' },
  { keys: ['VITE_CLIENT_KEY'], desc: 'Circle modular-wallet client key (public, bundle-safe)' },
  { keys: ['PROVIDER_1_WEBHOOK'], desc: 'Auto-receipt webhook URL', example: 'https://arcsla.vercel.app/api/auto-receipt' },
];
optional.forEach(({ keys, desc, example, secret }) => {
  const { key, val } = getAny(...keys);
  if (!val) {
    warn(`${keys[0]} — ${desc} (optional)${example ? `\n       Example: ${keys[0]}=${example}` : ''}`);
  } else {
    const display = secret ? '***' : val.length > 30 ? val.slice(0, 12) + '…' + val.slice(-6) : val;
    ok(`${keys[0]} = ${display}`);
  }
});

section('Contract address validation (v8)');
const addrChecks = [
  { keys: ['PAY_PER_CALL_V8', 'VITE_PAY_PER_CALL_V8'], expected: V8.PAY_PER_CALL, label: 'PayPerCallV8' },
  { keys: ['SERVICE_REGISTRY_V8', 'VITE_SERVICE_REGISTRY_V8'], expected: V8.SERVICE_REGISTRY, label: 'ServiceRegistryV8' },
  { keys: ['USDC_ADDRESS', 'VITE_USDC_ADDRESS'], expected: V8.USDC, label: 'USDC' },
  { keys: ['CHAIN_ID', 'VITE_CHAIN_ID'], expected: V8.CHAIN_ID, label: 'chain ID', numeric: true },
  { keys: ['SLA_KEEPER_V8', 'VITE_SLA_KEEPER'], expected: V8.SLA_KEEPER, label: 'SLAKeeper', optional: true },
  { keys: ['DISPUTE_V2', 'VITE_DISPUTE_V4'], expected: V8.DISPUTE_V4, label: 'DisputeV4', optional: true },
  { keys: ['SLA_EVIDENCE_V2', 'VITE_SLA_EVIDENCE_V2'], expected: V8.EVIDENCE_V2, label: 'SLAEvidenceRegistryV2', optional: true },
];
addrChecks.forEach(({ keys, expected, label, numeric, optional }) => {
  const { val } = getAny(...keys);
  const same = numeric ? val === expected : val.toLowerCase() === expected.toLowerCase();
  if (!val) {
    if (!optional) warn(`${keys[0]} is not set — ${label} reads will fall back to the retired v7 deployment`);
  } else if (!same) {
    warn(`${keys[0]} does not match the deployed ${label}\n       Got: ${val}\n       Expected: ${expected}`);
  } else {
    ok(`${keys[0]} matches ${label}`);
  }
});

// v7 is still deployed and readable, but nothing new should point at it. A value
// here is not an error: V7Cleanup writes to it until the escrow is released.
const legacySet = ['SERVICE_REGISTRY', 'PAY_PER_CALL', 'VITE_SERVICE_REGISTRY', 'VITE_PAY_PER_CALL'].filter((k) => get(k));
if (legacySet.length) {
  warn(`retired v7 addresses set: ${legacySet.join(', ')} — only V7Cleanup uses them`);
}

section('Summary');
if (missingRequired.length === 0) {
  console.log(`\n  ${GREEN}${BOLD}All required variables set. You're good to go!${RESET}`);
  console.log(`  ${DIM}Run: bun run dev${RESET}\n`);
} else {
  console.log(`\n  ${RED}${BOLD}${missingRequired.length} required variable(s) missing.${RESET}`);
  console.log(`  ${DIM}NOTE: Vercel env vars are NOT exported by \`source .env\` — use \`export $(cat .env | xargs)\`.`);
  console.log(`  1. Get testnet USDC: https://faucet.circle.com`);
  console.log(`  2. Copy .env.example to .env and fill in the values`);
  console.log(`  3. Run: node check.js to verify${RESET}\n`);
}

process.exit(exitCode);

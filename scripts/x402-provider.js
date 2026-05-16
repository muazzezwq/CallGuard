#!/usr/bin/env node
/**
 * ArcSLA x402 Provider Server
 * 
 * Implements HTTP 402 Payment Required flow:
 * 1. GET /service (no header) → 402 + payment instructions
 * 2. GET /service (with X-Payment) → verify → callService() → respond
 * 
 * Usage:
 *   npm run x402:provider
 *   # Server listens on http://localhost:3000
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

// =====================================================================
// Configuration
// =====================================================================
const CONFIG = {
  port: process.env.PORT || 3000,
  arcRpc: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network',
  usdc: '0x3600000000000000000000000000000000000000',
  payPerCall: '0x1A64e531Dc7498931A658F14AD6801108F372ed8',
  providerId: parseInt(process.env.PROVIDER_ID || '1', 10),
  pricePerCall: ethers.parseUnits('1', 6), // 1 USDC
  maxTimeoutSeconds: 30,
};

const PAY_PER_CALL_ABI = [
  "function callService(uint256 providerId, bytes32 requestHash) external returns (bytes32 callId)",
];

function build402Response(providerId, payTo, amount, asset) {
  return {
    version: "0.1",
    accepts: [{
      scheme: "exact",
      network: "arc-testnet",
      maxAmountRequired: amount.toString(),
      resource: `http://localhost:${CONFIG.port}/service`,
      description: "ArcSLA provider service call",
      mimeType: "application/json",
      payTo,
      maxTimeoutSeconds: CONFIG.maxTimeoutSeconds,
      asset,
      extra: { providerId },
    }],
  };
}

// =====================================================================
// Express Server
// =====================================================================
const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', protocol: 'x402', network: 'arc-testnet' });
});

app.get('/service', async (req, res) => {
  const xPayment = req.headers['x-payment'];

  // ── CASE 1: No payment → 402 ──────────────────────────────────────
  if (!xPayment) {
    console.log(`🔐 [402] Payment required from ${req.ip}`);
    return res.status(402).json(
      build402Response(
        CONFIG.providerId,
        CONFIG.payPerCall,
        CONFIG.pricePerCall,
        CONFIG.usdc
      )
    );
  }

  // ── CASE 2: X-Payment present → verify + execute ──────────────────
  console.log(`✅ [200] Payment proof received, verifying...`);

  try {
    let paymentProof;
    try {
      const decoded = Buffer.from(xPayment, 'base64').toString('utf-8');
      paymentProof = JSON.parse(decoded);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid X-Payment header format' });
    }

    if (
      paymentProof.scheme !== 'exact' ||
      paymentProof.network !== 'arc-testnet' ||
      !paymentProof.payload?.txHash ||
      !paymentProof.payload?.amount
    ) {
      return res.status(400).json({ error: 'Invalid payment proof schema' });
    }

    const paidAmount = BigInt(paymentProof.payload.amount);
    if (paidAmount < CONFIG.pricePerCall) {
      return res.status(402).json({
        error: 'Insufficient payment',
        required: CONFIG.pricePerCall.toString(),
        received: paidAmount.toString(),
      });
    }

    if (paymentProof.payload.asset?.toLowerCase() !== CONFIG.usdc.toLowerCase()) {
      return res.status(400).json({ error: 'Invalid asset' });
    }

    // ── Call ArcSLA contract ─────────────────────────────────────────
    const provider = new ethers.JsonRpcProvider(CONFIG.arcRpc);
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const requestHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'uint256'],
        [paymentProof.payload.txHash, BigInt(CONFIG.providerId)]
      )
    );

    const payPerCall = new ethers.Contract(CONFIG.payPerCall, PAY_PER_CALL_ABI, signer);
    console.log(`🚀 callService(providerId=${CONFIG.providerId}, requestHash=${requestHash})`);

    const tx = await payPerCall.callService(CONFIG.providerId, requestHash);
    const receipt = await tx.wait();

    const callStartedEvent = receipt.logs.find(log => {
      try {
        const parsed = payPerCall.interface.parseLog(log);
        return parsed?.name === 'CallStarted';
      } catch { return false; }
    });
    const callId = callStartedEvent
      ? payPerCall.interface.parseLog(callStartedEvent).args.callId
      : ethers.keccak256(ethers.toUtf8Bytes(tx.hash));

    console.log(`✅ SLA call opened: callId=${callId}, tx=${tx.hash}`);

    return res.json({
      result: 'pong',
      callId,
      txHash: tx.hash,
      message: 'SLA clock started on Arc Testnet',
      deadline: Math.floor(Date.now() / 1000) + CONFIG.maxTimeoutSeconds,
    });

  } catch (err) {
    console.error('❌ x402 execution error:', err);
    if (err.reason?.includes('revert')) {
      return res.status(400).json({ error: 'Contract call reverted', details: err.reason });
    }
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.listen(CONFIG.port, () => {
  console.log(`⚡ ArcSLA x402 Provider running on http://localhost:${CONFIG.port}`);
  console.log(`   Provider ID: ${CONFIG.providerId}`);
  console.log(`   Price per call: ${ethers.formatUnits(CONFIG.pricePerCall, 6)} USDC`);
  console.log(`   Test: curl http://localhost:${CONFIG.port}/service`);
});

// Canonical Arc Testnet v7 contracts for server routes.
// The frontend hardcodes the same values in src/lib/config.ts.
// Do not read VITE_* here: those are build-time variables and the deployed
// server environment still carries retired addresses.
export const V7 = Object.freeze({
  SERVICE_REGISTRY: "0x9ca97010464e8e6de6e27cf25eae9b939fbd7333",
  PAY_PER_CALL: "0x5fb41dd22c44e1de08f37d98c2995a62d6220540",
  USDC: "0x3600000000000000000000000000000000000000",
  CHAIN_ID: 5042002,
  NETWORK: "eip155:5042002",
});

// Optional v8 availability core. Server env only: these are read at request
// time, so a deployment can flip the active pair without rebuilding the bundle.
export const V8 = Object.freeze({
  SERVICE_REGISTRY: process.env.SERVICE_REGISTRY_V8 || "",
  PAY_PER_CALL: process.env.PAY_PER_CALL_V8 || "",
  SLA_KEEPER: process.env.SLA_KEEPER_V8 || "",
  DISPUTE: process.env.DISPUTE_V2 || "",
  USDC: V7.USDC,
  CHAIN_ID: V7.CHAIN_ID,
  NETWORK: V7.NETWORK,
});

export const V8_ACTIVE = Boolean(V8.SERVICE_REGISTRY && V8.PAY_PER_CALL);
export const ACTIVE = V8_ACTIVE ? V8 : V7;

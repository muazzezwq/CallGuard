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

// Shared Arc Testnet RPC resolution.
//
// `.env.example` documents three public aliases and an optional provisioned
// proxy. Every API route must resolve them the same way; otherwise an endpoint
// that is configured correctly for one route fails on another. The proxy token
// is a credential and is percent-encoded so it cannot change the URL shape.

export function getRpcUrl(env = process.env) {
  const base = env.RPC_PROXY_BASE_URL;
  const token = env.RPC_PROXY_TOKEN;
  const chains = (env.RPC_PROXY_CHAINS || "")
    .split(",")
    .map((chain) => chain.trim());

  if (base && chains.includes("Arc_Testnet")) {
    const cleanBase = base.replace(/\/+$/, "");
    const suffix = token ? `?_rpc_token=${encodeURIComponent(token)}` : "";
    return `${cleanBase}/api/rpc/Arc_Testnet${suffix}`;
  }

  return env.ARC_RPC_URL || env.ARC_TESTNET_RPC_URL || env.RPC_URL || null;
}

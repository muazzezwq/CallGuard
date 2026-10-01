import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://arcsla.vercel.app";
const SUBGRAPH_URL = process.env.SUBGRAPH_URL || "https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/1.4.2/gn";

const server = new McpServer({
  name: "callguard",
  version: "1.0.0",
});

// Tool 1: list_providers
server.tool(
  "list_providers",
  "List active CallGuard service providers on Arc Testnet. Returns provider ID, owner, price per call, and reputation score.",
  { limit: z.number().optional().default(10) },
  async ({ limit }) => {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{ providers(first: ${limit}, orderBy: id, orderDirection: asc, where: { active: true }) { id owner stake pricePerCall completedCalls slashedCalls } }`
      })
    });
    const data = await res.json();
    const providers = data.data?.providers || [];
    const text = providers.map(p => {
      const completed = Number(p.completedCalls || 0);
      const slashed = Number(p.slashedCalls || 0);
      const total = completed + slashed;
      const rep = total > 0 ? Math.round((completed + 2) * 100 / (total + 3)) : 66;
      const price = (Number(p.pricePerCall) / 1e6).toFixed(4);
      return `Provider #${p.id} | Owner: ${p.owner.slice(0,10)}... | Price: ${price} USDC/call | Reputation: ${rep} | Calls: ${completed} completed, ${slashed} slashed`;
    }).join("\n");
    return { content: [{ type: "text", text: text || "No active providers found." }] };
  }
);

// Tool 2: get_provider_health
server.tool(
  "get_provider_health",
  "Check if a provider's endpoint is live and responding.",
  { providerId: z.number() },
  async ({ providerId }) => {
    try {
      const res = await fetch(`${FACILITATOR_URL}/ping?providerId=${providerId}`);
      const data = await res.json();
      const status = data.ok ? `🟢 Live (${data.ms}ms)` : `🔴 Down`;
      return { content: [{ type: "text", text: `Provider #${providerId}: ${status}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Provider #${providerId}: ❌ Error — ${e.message}` }] };
    }
  }
);

// Tool 3: nanopay
server.tool(
  "nanopay",
  "Send a gasless 0.001 USDC nanopayment via Circle Gateway to call the CallGuard nano service.",
  {},
  async () => {
    try {
      const res = await fetch(`${FACILITATOR_URL}/nano/call`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        return { content: [{ type: "text", text: `✅ Nanopayment successful! Paid: ${data.amount} USDC via Circle Gateway.` }] };
      } else {
        return { content: [{ type: "text", text: `❌ Nanopayment failed: ${data.error}` }] };
      }
    } catch (e) {
      return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
    }
  }
);

// Tool 4: get_network_stats
server.tool(
  "get_network_stats",
  "Get CallGuard network statistics: total providers, calls, and recent activity.",
  {},
  async () => {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{ providers(first: 1000) { id active } callStarteds(first: 1000) { id } }`
      })
    });
    const data = await res.json();
    const providers = data.data?.providers || [];
    const calls = data.data?.callStarteds || [];
    const active = providers.filter(p => p.active).length;
    return {
      content: [{
        type: "text",
        text: `CallGuard Network Stats:\n- Total providers: ${providers.length}\n- Active providers: ${active}\n- Total calls indexed: ${calls.length}\n- Network: Arc Testnet\n- dApp: https://callguard.vercel.app/app`
      }]
    };
  }
);

// Tool 5: get_leaderboard
server.tool(
  "get_leaderboard",
  "Get the top providers by reputation score on CallGuard.",
  { limit: z.number().optional().default(5) },
  async ({ limit }) => {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{ providers(first: 1000, where: { active: true }) { id owner completedCalls slashedCalls pricePerCall } }`
      })
    });
    const data = await res.json();
    const providers = (data.data?.providers || []).map(p => {
      const completed = Number(p.completedCalls || 0);
      const slashed = Number(p.slashedCalls || 0);
      const total = completed + slashed;
      const rep = total > 0 ? Math.round((completed + 2) * 100 / (total + 3)) : 66;
      return { ...p, rep };
    }).sort((a, b) => b.rep - a.rep).slice(0, limit);

    const medals = ["🥇","🥈","🥉","4.","5."];
    const text = providers.map((p, i) =>
      `${medals[i] || (i+1)+"."} Provider #${p.id} | Rep: ${p.rep} | Price: ${(Number(p.pricePerCall)/1e6).toFixed(4)} USDC/call`
    ).join("\n");
    return { content: [{ type: "text", text: text || "No providers found." }] };
  }
);

// Tool 6: auto_route — best provider seç + otonom call yap
server.tool(
  "auto_route",
  "Automatically select the best CallGuard provider by reputation+price score and make a service call. Fully autonomous — no human approval needed. Requires AGENT_WALLET_ADDRESS and AGENT_PRIVATE_KEY env vars.",
  {
    payload: z.string().describe("Request payload to send to the provider (JSON string or plain text)"),
    maxPrice: z.number().optional().default(1).describe("Maximum price per call in USDC (default: 1)"),
  },
  async ({ payload, maxPrice }) => {
    try {
      const agentWalletAddr = process.env.AGENT_WALLET_ADDRESS;
      const agentPrivKey    = process.env.AGENT_PRIVATE_KEY;
      if (!agentWalletAddr || !agentPrivKey) {
        return { content: [{ type: "text", text: "❌ AGENT_WALLET_ADDRESS and AGENT_PRIVATE_KEY env vars required for autonomous calls." }] };
      }

      // 1. Fetch providers
      const res = await fetch(SUBGRAPH_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `{ providers(first: 50, where: { active: true }) { id owner pricePerCall completedCalls slashedCalls stake } }` })
      });
      const data = await res.json();
      const providers = (data.data?.providers || []).filter(p => {
        const price = Number(p.pricePerCall) / 1e6;
        return price <= maxPrice;
      }).map(p => {
        const completed = Number(p.completedCalls || 0);
        const slashed   = Number(p.slashedCalls || 0);
        const total     = completed + slashed;
        const honor     = total > 0 ? completed / total : 0.66;
        const price     = Number(p.pricePerCall) / 1e6;
        const stake     = Number(p.stake) / 1e6;
        const score     = honor * 0.5 + (1 / (price + 0.001)) * 0.2 + Math.min(stake / 1000, 1) * 0.3;
        return { ...p, score, price, honor };
      }).sort((a, b) => b.score - a.score);

      if (!providers.length) {
        return { content: [{ type: "text", text: `❌ No providers found under ${maxPrice} USDC/call.` }] };
      }

      const best = providers[0];

      // 2. Call via AgentWallet
      const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || "https://rpc.testnet.arc.network");
      const agentSigner = new ethers.Wallet(agentPrivKey, provider);
      const AGENT_WALLET_ABI = [
        "function agentCall(uint256 providerId, bytes32 requestHash, uint256 amount, bytes calldata extraData) returns (bytes32 callId)",
        "function getStats() view returns (uint256 balance, uint256 spentToday, uint256 remainingToday, uint256 totalSpent, uint256 totalCalls)",
      ];
      const agentWallet = new ethers.Contract(agentWalletAddr, AGENT_WALLET_ABI, agentSigner);
      const requestHash = ethers.keccak256(ethers.toUtf8Bytes(payload));
      const amount = BigInt(Math.round(best.price * 1e6));

      const stats = await agentWallet.getStats();
      if (stats.remainingToday < amount) {
        return { content: [{ type: "text", text: `❌ Daily limit reached. Remaining today: ${Number(stats.remainingToday) / 1e6} USDC` }] };
      }

      const tx = await agentWallet.agentCall(Number(best.id), requestHash, amount, "0x");
      const rc = await tx.wait();
      return {
        content: [{
          type: "text",
          text: `✅ Autonomous call completed!\n• Provider: #${best.id} (score: ${best.score.toFixed(2)})\n• Paid: ${best.price.toFixed(4)} USDC\n• Honor rate: ${(best.honor * 100).toFixed(1)}%\n• TX: ${tx.hash}\n• Block: ${rc.blockNumber}\n• Request hash: ${requestHash}`
        }]
      };
    } catch (e) {
      return { content: [{ type: "text", text: `❌ Auto-route failed: ${e.message}` }] };
    }
  }
);

// Tool 7: agent_wallet_stats
server.tool(
  "agent_wallet_stats",
  "Get AgentWallet stats: balance, daily spend, remaining limit, lifetime totals.",
  {},
  async () => {
    try {
      const agentWalletAddr = process.env.AGENT_WALLET_ADDRESS;
      if (!agentWalletAddr) return { content: [{ type: "text", text: "❌ AGENT_WALLET_ADDRESS env var not set." }] };
      const rpcProvider = new ethers.JsonRpcProvider(process.env.RPC_URL || "https://rpc.testnet.arc.network");
      const aw = new ethers.Contract(agentWalletAddr, [
        "function getStats() view returns (uint256 balance, uint256 spentToday, uint256 remainingToday, uint256 totalSpent, uint256 totalCalls)",
        "function dailyLimit() view returns (uint256)",
        "function maxPerCall() view returns (uint256)",
        "function paused() view returns (bool)",
        "function agent() view returns (address)",
      ], rpcProvider);
      const [stats, dailyLimit, maxPerCall, paused, agent] = await Promise.all([
        aw.getStats(), aw.dailyLimit(), aw.maxPerCall(), aw.paused(), aw.agent()
      ]);
      return {
        content: [{
          type: "text",
          text: `🤖 AgentWallet Stats\n• Balance: ${Number(stats.balance)/1e6} USDC\n• Spent today: ${Number(stats.spentToday)/1e6} USDC\n• Remaining today: ${Number(stats.remainingToday)/1e6} USDC\n• Daily limit: ${Number(dailyLimit)/1e6} USDC\n• Max per call: ${Number(maxPerCall)/1e6} USDC\n• Total spent (lifetime): ${Number(stats.totalSpent)/1e6} USDC\n• Total calls: ${Number(stats.totalCalls)}\n• Agent address: ${agent}\n• Paused: ${paused}`
        }]
      };
    } catch (e) {
      return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
    }
  }
);

// Tool 8: call_service_direct (full EIP-712 autonomous call)
server.tool(
  "call_service",
  "Make a direct CallGuard service call to a specific provider. Signs EIP-712 authorization and submits on-chain. Requires AGENT_WALLET_ADDRESS and AGENT_PRIVATE_KEY.",
  {
    providerId: z.number().describe("Provider ID to call"),
    payload: z.string().describe("Request payload"),
  },
  async ({ providerId, payload }) => {
    try {
      const agentWalletAddr = process.env.AGENT_WALLET_ADDRESS;
      const agentPrivKey    = process.env.AGENT_PRIVATE_KEY;
      if (!agentWalletAddr || !agentPrivKey) {
        return { content: [{ type: "text", text: "❌ AGENT_WALLET_ADDRESS and AGENT_PRIVATE_KEY env vars required." }] };
      }

      // Get provider price
      const res = await fetch(SUBGRAPH_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `{ provider(id: "${providerId}") { pricePerCall active } }` })
      });
      const data = await res.json();
      const p = data.data?.provider;
      if (!p?.active) return { content: [{ type: "text", text: `❌ Provider #${providerId} not found or inactive.` }] };

      const rpcProvider = new ethers.JsonRpcProvider(process.env.RPC_URL || "https://rpc.testnet.arc.network");
      const agentSigner = new ethers.Wallet(agentPrivKey, rpcProvider);
      const aw = new ethers.Contract(agentWalletAddr, [
        "function agentCall(uint256 providerId, bytes32 requestHash, uint256 amount, bytes calldata extraData) returns (bytes32 callId)",
      ], agentSigner);

      const requestHash = ethers.keccak256(ethers.toUtf8Bytes(payload));
      const amount = BigInt(p.pricePerCall);
      const tx = await aw.agentCall(providerId, requestHash, amount, "0x");
      const rc = await tx.wait();

      return {
        content: [{
          type: "text",
          text: `✅ Service call made!\n• Provider: #${providerId}\n• Paid: ${Number(amount)/1e6} USDC\n• TX: ${tx.hash}\n• Block: ${rc.blockNumber}`
        }]
      };
    } catch (e) {
      return { content: [{ type: "text", text: `❌ Call failed: ${e.message}` }] };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("CallGuard MCP Server running...");

// Tool 6: search_arc_docs
server.tool(
  "arc_docs_search",
  "Search Arc Network official documentation for any topic — ERC standards, USDC, CCTP, oracle, App Kit etc.",
  { query: z.string() },
  async ({ query }) => {
    try {
      const res = await fetch("https://docs.arc.io/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_arc_docs", arguments: { query } } })
      });
      const raw = await res.text();
      const dataLine = raw.split('\n').find(l => l.startsWith('data: '));
      const data = dataLine ? JSON.parse(dataLine.slice(6)) : {};
      const text = data.result?.content?.[0]?.text || "No results found.";
      return { content: [{ type: "text", text }] };
    } catch(e) {
      return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
    }
  }
);

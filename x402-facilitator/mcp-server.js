import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://arcsla-eu.onrender.com";
const SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/1.2.0/gn";

const server = new McpServer({
  name: "arcsla",
  version: "1.0.0",
});

// Tool 1: list_providers
server.tool(
  "list_providers",
  "List active ArcSLA service providers on Arc Testnet. Returns provider ID, owner, price per call, and reputation score.",
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
  "Send a gasless 0.001 USDC nanopayment via Circle Gateway to call the ArcSLA nano service.",
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
  "Get ArcSLA network statistics: total providers, calls, and recent activity.",
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
        text: `ArcSLA Network Stats:\n- Total providers: ${providers.length}\n- Active providers: ${active}\n- Total calls indexed: ${calls.length}\n- Network: Arc Testnet\n- dApp: https://arcsla.vercel.app/app`
      }]
    };
  }
);

// Tool 5: get_leaderboard
server.tool(
  "get_leaderboard",
  "Get the top providers by reputation score on ArcSLA.",
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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("ArcSLA MCP Server running...");

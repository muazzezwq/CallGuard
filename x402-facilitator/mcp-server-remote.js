import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://callguard-eu.onrender.com";
const SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/callguard/1.2.0/gn";
const PORT = process.env.MCP_PORT || 4022;

const app = express();
app.use(cors());
app.use(express.json());

function createMcpServer() {
  const server = new McpServer({ name: "callguard", version: "1.0.0" });

  server.tool("list_providers", "List active CallGuard service providers on Arc Testnet.",
    { limit: z.number().optional().default(10) },
    async ({ limit }) => {
      const res = await fetch(SUBGRAPH_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `{ providers(first: ${limit}, orderBy: id, orderDirection: asc, where: { active: true }) { id owner stake pricePerCall completedCalls slashedCalls } }` })
      });
      const data = await res.json();
      const providers = data.data?.providers || [];
      const text = providers.map(p => {
        const completed = Number(p.completedCalls || 0);
        const slashed = Number(p.slashedCalls || 0);
        const total = completed + slashed;
        const rep = total > 0 ? Math.round((completed + 2) * 100 / (total + 3)) : 66;
        const price = (Number(p.pricePerCall) / 1e6).toFixed(4);
        return `Provider #${p.id} | Price: ${price} USDC/call | Rep: ${rep} | Calls: ${completed} completed, ${slashed} slashed`;
      }).join("\n");
      return { content: [{ type: "text", text: text || "No active providers found." }] };
    }
  );

  server.tool("get_leaderboard", "Get top providers by reputation score.",
    { limit: z.number().optional().default(5) },
    async ({ limit }) => {
      const res = await fetch(SUBGRAPH_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `{ providers(first: 1000, where: { active: true }) { id owner completedCalls slashedCalls pricePerCall } }` })
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

  server.tool("get_network_stats", "Get CallGuard network statistics.", {},
    async () => {
      const res = await fetch(SUBGRAPH_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `{ providers(first: 1000) { id active } callStarteds(first: 1000) { id } }` })
      });
      const data = await res.json();
      const providers = data.data?.providers || [];
      const calls = data.data?.callStarteds || [];
      const active = providers.filter(p => p.active).length;
      return { content: [{ type: "text", text: `CallGuard Network:\n- Total providers: ${providers.length}\n- Active: ${active}\n- Total calls: ${calls.length}\n- dApp: https://callguard.vercel.app/app` }] };
    }
  );

  server.tool("nanopay", "Send a gasless 0.001 USDC nanopayment via Circle Gateway.", {},
    async () => {
      try {
        const res = await fetch(`${FACILITATOR_URL}/nano/call`, { method: "POST" });
        const data = await res.json();
        if (res.ok) return { content: [{ type: "text", text: `✅ Paid: ${data.amount} USDC via Circle Gateway.` }] };
        return { content: [{ type: "text", text: `❌ Failed: ${data.error}` }] };
      } catch (e) {
        return { content: [{ type: "text", text: `❌ Error: ${e.message}` }] };
      }
    }
  );

  server.tool("get_provider_health", "Check if a provider's endpoint is live.",
    { providerId: z.number() },
    async ({ providerId }) => {
      try {
        const res = await fetch(`${FACILITATOR_URL}/ping?providerId=${providerId}`);
        const data = await res.json();
        return { content: [{ type: "text", text: `Provider #${providerId}: ${data.ok ? `🟢 Live (${data.ms}ms)` : "🔴 Down"}` }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Provider #${providerId}: ❌ ${e.message}` }] };
      }
    }
  );

  return server;
}

const transports = {};

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  res.on("close", () => delete transports[transport.sessionId]);
  const server = createMcpServer();
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (!transport) return res.status(404).json({ error: "Session not found" });
  await transport.handlePostMessage(req, res);
});

app.get("/health", (_, res) => res.json({ ok: true, server: "CallGuard MCP Remote", version: "1.0.0" }));

app.listen(PORT, () => console.log(`CallGuard MCP Remote Server on :${PORT}`));

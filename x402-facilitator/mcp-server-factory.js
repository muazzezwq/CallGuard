import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/callguard/1.2.0/gn";
const FACILITATOR_URL = "https://callguard-eu.onrender.com";

export default function createArcslaServer() {
  const server = new McpServer({ name: "callguard", version: "1.0.0" });

  server.tool("list_providers", "List active CallGuard providers.",
    { limit: z.number().optional().default(10) },
    async ({ limit }) => {
      const res = await fetch(SUBGRAPH_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: `{ providers(first: ${limit}, where: { active: true }) { id owner pricePerCall completedCalls slashedCalls } }` })
      });
      const data = await res.json();
      const providers = data.data?.providers || [];
      const text = providers.map(p => {
        const c = Number(p.completedCalls||0), sl = Number(p.slashedCalls||0), t = c+sl;
        const rep = t > 0 ? Math.round((c+2)*100/(t+3)) : 66;
        return `#${p.id} | ${(Number(p.pricePerCall)/1e6).toFixed(4)} USDC | Rep: ${rep}`;
      }).join("\n");
      return { content: [{ type: "text", text: text || "No providers." }] };
    }
  );

  server.tool("get_network_stats", "CallGuard network statistics.", {}, async () => {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `{ providers(first:1000){id active} callStarteds(first:1000){id} }` })
    });
    const data = await res.json();
    const ps = data.data?.providers||[], cs = data.data?.callStarteds||[];
    return { content: [{ type: "text", text: `Providers: ${ps.length} (${ps.filter(p=>p.active).length} active) | Calls: ${cs.length}` }] };
  });

  server.tool("nanopay", "Send 0.001 USDC nanopayment via Circle Gateway.", {}, async () => {
    try {
      const res = await fetch(`${FACILITATOR_URL}/nano/call`, { method: "POST" });
      const data = await res.json();
      return { content: [{ type: "text", text: res.ok ? `✅ Paid: ${data.amount} USDC` : `❌ ${data.error}` }] };
    } catch(e) { return { content: [{ type: "text", text: `❌ ${e.message}` }] }; }
  });

  server.tool("get_leaderboard", "Top providers by reputation.", { limit: z.number().optional().default(5) }, async ({ limit }) => {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `{ providers(first:1000,where:{active:true}){id pricePerCall completedCalls slashedCalls} }` })
    });
    const data = await res.json();
    const providers = (data.data?.providers||[]).map(p => {
      const c = Number(p.completedCalls||0), sl = Number(p.slashedCalls||0), t = c+sl;
      return { ...p, rep: t>0?Math.round((c+2)*100/(t+3)):66 };
    }).sort((a,b)=>b.rep-a.rep).slice(0,limit);
    const medals = ["🥇","🥈","🥉","4.","5."];
    const text = providers.map((p,i) => `${medals[i]||i+1} #${p.id} | Rep: ${p.rep} | ${(Number(p.pricePerCall)/1e6).toFixed(4)} USDC`).join("\n");
    return { content: [{ type: "text", text: text || "No providers." }] };
  });

  return server;
}

// === ArcSLA Premium Subgraph Connector ===
const SG_URL = "https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/1.2.0/gn";

// 1. CSS'i Sayfaya Enjekte Et (Sitenin CSS'ini bozmaz)
const style = document.createElement("style");
style.textContent = `
  .arc-sg-container { font-family: 'Inter', system-ui, sans-serif; max-width: 1000px; margin: 2rem auto; padding: 0 1rem; }
  .arc-sg-grid-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
  @media (max-width: 640px) { .arc-sg-grid-stats, .arc-sg-grid-cols { grid-template-columns: 1fr !important; } }
  .arc-sg-card { background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 1.25rem; backdrop-filter: blur(12px); transition: transform 0.2s; }
  .arc-sg-card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.15); }
  .arc-sg-stat-val { font-size: 1.8rem; font-weight: 700; background: linear-gradient(135deg, #60a5fa, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .arc-sg-stat-label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
  .arc-sg-grid-cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1.5rem; }
  .arc-sg-header { font-size: 1rem; font-weight: 600; color: #e2e8f0; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
  .arc-sg-list { max-height: 320px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #334155 transparent; }
  .arc-sg-item { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.85rem; color: #94a3b8; }
  .arc-sg-item:last-child { border-bottom: none; }
  .arc-sg-badge { padding: 3px 10px; border-radius: 9999px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.03em; }
  .bg-started { background: rgba(250, 204, 21, 0.15); color: #facc15; }
  .bg-completed { background: rgba(52, 211, 153, 0.15); color: #34d399; }
  .bg-slashed { background: rgba(248, 113, 113, 0.15); color: #f87171; }
  .arc-sg-address { font-family: monospace; color: #cbd5e1; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 6px; }
`;
document.head.appendChild(style);

// 2. Yardımcı Fonksiyonlar
const truncate = (a) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "";
const timeAgo = (ts) => {
  if(!ts) return "";
  const s = Math.floor(Date.now()/1000 - ts);
  if(s < 60) return "şimdi";
  if(s < 3600) return `${Math.floor(s/60)} dk önce`;
  if(s < 86400) return `${Math.floor(s/3600)} saat önce`;
  return `${Math.floor(s/86400)} gün önce`;
};

// 3. Veri Çek ve UI Oluştur
async function initSubgraphUI() {
  const container = document.getElementById("arc-sg-root");
  if (!container) return;

  try {
    const res = await fetch(SG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: `{ providers { id } calls { id status } slashed: calls(where: {status: SLASHED}) { id } top: providers(first: 5, orderBy: completedCalls, orderDirection: desc) { id owner completedCalls slashedCalls } recent: calls(first: 8, orderBy: createdAt, orderDirection: desc) { id caller status createdAt provider { id } } }` })
    });
    const { providers, calls, slashed, top, recent } = await res.json().then(r => r.data);

    container.innerHTML = `
      <div class="arc-sg-container">
        <div class="arc-sg-grid-stats">
          <div class="arc-sg-card">
            <div class="arc-sg-stat-val">${providers.length}</div>
            <div class="arc-sg-stat-label">Aktif Provider</div>
          </div>
          <div class="arc-sg-card">
            <div class="arc-sg-stat-val">${calls.length}</div>
            <div class="arc-sg-stat-label">Toplam Çağrı</div>
          </div>
          <div class="arc-sg-card">
            <div class="arc-sg-stat-val" style="background: linear-gradient(135deg, #f87171, #fb923c); -webkit-background-clip: text;">${slashed.length}</div>
            <div class="arc-sg-stat-label">SLA İhlali (Slash)</div>
          </div>
        </div>
        
        <div class="arc-sg-grid-cols">
          <div class="arc-sg-card">
            <div class="arc-sg-header">📡 Son İşlemler</div>
            <div class="arc-sg-list">
              ${recent.map(c => `
                <div class="arc-sg-item">
                  <div>
                    <span class="arc-sg-badge bg-${c.status.toLowerCase()}">${c.status}</span>
                    <span class="arc-sg-address" style="margin-left:8px;">${truncate(c.caller)}</span>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:0.75rem;">Prov #${c.provider?.id}</div>
                    <div style="font-size:0.7rem; color:#475569;">${timeAgo(c.createdAt)}</div>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="arc-sg-card">
            <div class="arc-sg-header">🏆 Liderlik Tablosu</div>
            <div class="arc-sg-list">
              ${top.map((p, i) => `
                <div class="arc-sg-item">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span style="color:${i===0?'#facc15':'#475569'}; font-weight:bold;">#${i+1}</span>
                    <div>
                      <div class="arc-sg-address">${truncate(p.owner)}</div>
                      <div style="font-size:0.7rem; color:#475569;">Provider #${p.id}</div>
                    </div>
                  </div>
                  <div style="text-align:right;">
                    <span style="color:#34d399; font-weight:600;">${p.completedCalls} ✅</span>
                    <span style="color:#f87171; margin-left:6px; font-weight:600;">${p.slashedCalls} ❌</span>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    console.error("Subgraph UI Error:", e);
    container.innerHTML = `<div style="text-align:center; color:#64748b; padding:2rem;">Subgraph verileri yüklenemedi.</div>`;
  }
}

// Sayfa yüklendiğinde başlat
window.addEventListener("DOMContentLoaded", () => {
  initSubgraphUI();
  // Opsiyonel: Her 30 saniyede bir güncelle
  setInterval(initSubgraphUI, 30000);
});

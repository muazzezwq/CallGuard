// ArcSLA Subgraph Connector
const SUBGRAPH_URL = "https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/1.2.0/gn";

async function fetchSubgraph() {
  const query = `
  {
    _meta { block { number } }
    providers { id }
    calls { id status }
    slashed: calls(where: { status: SLASHED }) { id }
    topProviders: providers(first: 10, orderBy: completedCalls, orderDirection: desc) {
      id
      owner
      completedCalls
      slashedCalls
      pricePerCall
    }
    recentCalls: calls(first: 10, orderBy: createdAt, orderDirection: desc) {
      id
      caller
      status
      amount
      createdAt
      provider { id owner }
    }
  }`;

  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  
  const data = await res.json();
  return data.data;
}

function formatTimestamp(ts) {
  if (!ts) return "N/A";
  return new Date(ts * 1000).toLocaleString();
}

function truncateAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function getStatusColor(status) {
  if (status === "COMPLETED") return "#10b981"; // Yeşil
  if (status === "SLASHED") return "#ef4444";  // Kırmızı
  return "#f59e0b"; // Sarı (Started)
}

// Bu fonksiyonu HTML içinde çağıracaksınız
async function loadSubgraphUI() {
  try {
    console.log("Subgraph'a bağlanılıyor...");
    const data = await fetchSubgraph();
    
    // 1. GENEL İSTATİSTİKLER
    const totalProviders = data.providers.length;
    const totalCalls = data.calls.length;
    const totalSlashed = data.slashed.length;
    
    // Eğer sayfada bu ID'lere sahip elementler varsa içlerini doldur
    const elProviders = document.getElementById("sg-providers");
    const elCalls = document.getElementById("sg-calls");
    const elSlashes = document.getElementById("sg-slashes");
    
    if(elProviders) elProviders.innerText = totalProviders;
    if(elCalls) elCalls.innerText = totalCalls;
    if(elSlashes) elSlashes.innerText = totalSlashed;

    // 2. SON İŞLEMLER (AKTİVİTE AKIŞI)
    const feedContainer = document.getElementById("sg-activity-feed");
    if (feedContainer) {
      feedContainer.innerHTML = ""; // Eski verileri temizle
      data.recentCalls.forEach(call => {
        const div = document.createElement("div");
        div.style.cssText = "padding: 8px; border-bottom: 1px solid #333; font-size: 13px; display: flex; justify-content: space-between;";
        div.innerHTML = `
          <span>
            <strong style="color:${getStatusColor(call.status)}">${call.status}</strong> 
            by ${truncateAddress(call.caller)} on Provider #${call.provider?.id}
          </span>
          <span style="color: #888; font-size: 11px;">${formatTimestamp(call.createdAt)}</span>
        `;
        feedContainer.appendChild(div);
      });
    }

    // 3. LİDERLİK TABLOSU
    const leaderboardContainer = document.getElementById("sg-leaderboard");
    if (leaderboardContainer) {
      leaderboardContainer.innerHTML = ""; // Eski verileri temizle
      data.topProviders.forEach(p => {
        const div = document.createElement("div");
        div.style.cssText = "padding: 8px; border-bottom: 1px solid #333; font-size: 13px; display: flex; justify-content: space-between;";
        div.innerHTML = `
          <span>Provider #${p.id} (${truncateAddress(p.owner)})</span>
          <span>
            <span style="color:#10b981">✅ ${p.completedCalls}</span> / 
            <span style="color:#ef4444">❌ ${p.slashedCalls}</span>
          </span>
        `;
        leaderboardContainer.appendChild(div);
      });
    }

    console.log(`Subgraph güncellendi: ${totalProviders} Provider, ${totalCalls} Call`);
  } catch (err) {
    console.error("Subgraph Hatası:", err);
  }
}

// Sayfa yüklendiğinde otomatik çalışması için
window.addEventListener("DOMContentLoaded", () => {
  loadSubgraphUI();
  // Her 15 saniyede bir güncelle (Opsiyonel)
  setInterval(loadSubgraphUI, 15000);
});

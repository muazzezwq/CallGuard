

                (function() {
                  const ua = navigator.userAgent;
                  const isMac = /Mac/.test(ua);
                  const isWin = /Win/.test(ua);
                  const isLinux = /Linux/.test(ua) && !/Android/.test(ua);
                  const label = isMac ? 'macOS detected' : isWin ? 'Windows detected' : isLinux ? 'Linux detected' : 'select your OS';
                  const el = document.getElementById('mcpOsDetected');
                  if (el) el.textContent = label;
                  ['mcpMac','mcpWin','mcpLinux'].forEach(id => {
                    const div = document.getElementById(id);
                    if (div) div.style.opacity = '0.5';
                  });
                  const highlight = isMac ? 'mcpMac' : isWin ? 'mcpWin' : isLinux ? 'mcpLinux' : null;
                  if (highlight) {
                    const div = document.getElementById(highlight);
                    if (div) { div.style.opacity = '1'; div.style.background = 'var(--accent-bg)'; div.style.borderRadius = '6px'; div.style.padding = '6px 8px'; }
                  }
                })();
              

      // -------- Config --------
      const CONFIG = {
        chainId: 5042002,
        chainIdHex: "0x4CEF52",
        chainName: "Arc Testnet",
        rpcUrl: "https://rpc.testnet.arc.network",
        explorerBase: "https://testnet.arcscan.app",
        registry: "0xea00f898C0eA249de7226b283e93C13eFa7BbcFF",
        payPerCall: "0x10387347678d9f7106D5625bE0BD6C915158B130",
        registerWithNFT: "0x0aBC433356754Cd269bEF9A46273d7a152a0F169",
        identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
        usdc: "0x3600000000000000000000000000000000000000",
        facilitatorUrl: window.location.origin,
        subgraphUrl: "https://api.goldsky.com/api/public/project_cmqryheeji1m801sy3dhe6jhk/subgraphs/arcsla/1.4.1/gn",
        bandOracle: "0x8c064bCf7C0DA3B3b090BAbFE8f3323534D84d68",
        eurc: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
        usyc: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C",
        memo: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
        multicall3From: "0x522fAf9A91c41c443c66765030741e4AaCe147D0",
        usyc: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C",
        memo: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
        usyc: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C",
        memo: "0x5294E9927c3306DcBaDb03fe70b92e01cCede505",
        agenticCommerce: "0x0747EEf0706327138c69792bF28Cd525089e4583",
      };

      // -------- ABIs (minimal — only what we call) --------
      const ERC20_ABI = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
        "function allowance(address, address) view returns (uint256)",
        "function approve(address, uint256) returns (bool)",
      ];

      const REGISTRY_ABI = [
        "function register(address signer, uint256 stakeAmount, uint256 pricePerCall, uint32 maxResponseTime, uint32 slashBps, string endpoint) returns (uint256)",
        "function providerIdOf(address) view returns (uint256)",
        "function getProvider(uint256) view returns (tuple(address owner, address signer, uint256 stake, uint256 pricePerCall, uint32 maxResponseTime, uint32 slashBps, bool active))",
        "function getEndpoint(uint256) view returns (string)",
        "function pendingCalls(uint256) view returns (uint32)",
        "function nextProviderId() view returns (uint256)",
        "function getReputationScore(uint256) view returns (uint8)",
        "function completedCalls(uint256) view returns (uint32)",
        "function slashedCalls(uint256) view returns (uint32)",
        "event ProviderRegistered(uint256 indexed providerId, address indexed owner, address signer, uint256 stake, uint256 pricePerCall, uint32 maxResponseTime, uint32 slashBps, string endpoint)",
        "event ReputationUpdated(uint256 indexed providerId, uint32 completedCalls, uint32 slashedCalls)",
      ];

      const PAY_ABI = [
        "function callService(uint256 providerId, bytes32 requestHash) returns (bytes32)",
        "function callServiceWithAuthorization(uint256 providerId, bytes32 requestHash, address from, uint256 validAfter, uint256 validBefore, bytes32 authNonce, uint8 v, bytes32 r, bytes32 s) returns (bytes32)",
        "function submitReceipt(bytes32 callId, bytes32 responseHash, bytes signature)",
        "function claimTimeout(bytes32 callId)",
        "function getCall(bytes32) view returns (tuple(uint256 providerId, address caller, uint256 amount, uint32 startedAt, uint32 deadline, bytes32 requestHash, bytes32 responseHash, uint8 status))",
        "function nonce() view returns (uint256)",
        "event CallStarted(bytes32 indexed callId, uint256 indexed providerId, address indexed caller, uint256 amount, bytes32 requestHash, uint32 deadline)",
        "event ReceiptSubmitted(bytes32 indexed callId, bytes32 responseHash)",
        "event CallSlashed(bytes32 indexed callId, uint256 refunded, uint256 slashed)",
      ];

      const JOBS_ABI = [
        "function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256 jobId)",
        "function setBudget(uint256 jobId, uint256 amount, bytes optParams)",
        "function fund(uint256 jobId, bytes optParams)",
        "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
        "function complete(uint256 jobId, bytes32 reason, bytes optParams)",
        "function getJob(uint256 jobId) view returns (tuple(uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook))",
        "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
      ];

      // ================================================================
      // GLOBAL STATE — single source of truth
      // All data sourced from contract state or contract events only.
      // No localStorage. No fake confirmations.
      // ================================================================
      const state = {
        // Wallet / connection
        provider: null,       // ethers.BrowserProvider
        signer: null,
        address: null,
        chainId: null,        // current connected chain ID
        // Contracts
        usdc: null,
        registry: null,
        payPerCall: null,
        usdcDecimals: 6,
        // On-chain data
        myCalls: new Map(),   // callId → call obj (sourced from chain events)
        providerInfo: null,   // { id, data } — sourced from registry contract
        seenEvents: new Set(),// dedupe: `${txHash}:${logIndex}`
        myActivity: [],       // unified activity log: {type, label, icon, time, txHash, detail}
        x402TxHashes: new Set(),  // tx hashes done via x402 this session
        cctpTxHashes: new Set(),  // tx hashes done via CCTP this session
        allProviders: [],     // full provider directory from contract
        networkStats: null,   // aggregate metrics from contract events
        actionsInitialized: false,
        // UX
        loading: false,       // global loading state — disables buttons
        // Polling fallback (in case event listener misses an event)
        lastSyncBlock: 0,
        pollInterval: null,
      };

      // -------- Loading state helpers --------
      function setLoading(on) {
        state.loading = on;
        // Disable/enable all primary action buttons
        document.querySelectorAll(".btn-primary, .btn-danger").forEach(btn => {
          if (on) {
            btn.setAttribute("data-was-disabled", btn.disabled ? "1" : "0");
            btn.disabled = true;
          } else {
            if (btn.getAttribute("data-was-disabled") !== "1") btn.disabled = false;
            btn.removeAttribute("data-was-disabled");
          }
        });
      }

      // -------- Tab title counter (unseen events) --------
      const titleBase = "CallGuard · Arc Testnet";
      let unseenCount = 0;
      function bumpUnseen() {
        if (!document.hidden) return;
        unseenCount++;
        document.title = `(${unseenCount}) ${titleBase} · New activity`;
      }
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          unseenCount = 0;
          document.title = titleBase;
        }
      });

      // -------- UI helpers --------
      const $ = (id) => document.getElementById(id);

      const toast = ({ title, detail, kind = "info", link, timeout = 6000 }) => {
        const el = document.createElement("div");
        el.className = `toast ${kind}`;
        const body = document.createElement("div");
        body.className = "toast-body";
        body.innerHTML = `<div class="title">${title}</div>${
          detail ? `<div class="detail">${detail}</div>` : ""
        }${
          link
            ? `<div class="detail"><a href="${link}" target="_blank" rel="noreferrer">view on arcscan →</a></div>`
            : ""
        }`;
        el.appendChild(body);
        $("toasts").appendChild(el);
        if (timeout) {
          setTimeout(() => el.remove(), timeout);
        }
        return el;
      };

      const short = (a, n = 4) =>
        a ? `${a.slice(0, n + 2)}…${a.slice(-n)}` : "";

      const txLink = (hash) => `${CONFIG.explorerBase}/tx/${hash}`;
      const addrLink = (a) => `${CONFIG.explorerBase}/address/${a}`;

      /**
       * Arc RPC returns HTTP 413 for wide eth_getLogs windows. We scan the
       * last LOG_SCAN_BLOCKS in chunks of CHUNK_SIZE, merging the results.
       * If any chunk still fails we halve the chunk for retry — up to 3 levels.
       */
      const LOG_SCAN_BLOCKS = 5000;
      const CHUNK_SIZE = 500;
      const MIN_CHUNK = 50;

      async function scanRange(contract, filter, from, to, size = CHUNK_SIZE) {
        const results = [];
        let cursor = from;

        while (cursor <= to) {
          const end = Math.min(cursor + size - 1, to);

          try {
            const logs = await contract.queryFilter(filter, cursor, end);

            for (const l of logs) {
              results.push(l);
            }

            cursor = end + 1;

            // RPC rate limit koruması
            await new Promise(r => setTimeout(r, 300));

          } catch (e) {

            if (size > MIN_CHUNK) {
              const half = Math.floor(size / 2);
              const inner = await scanRange(
                contract,
                filter,
                cursor,
                end,
                half
              );

              results.push(...inner);
              cursor = end + 1;

            } else {
              console.warn(
                `[scanRange skipped ${cursor}-${end}]`,
                e.message
              );

              cursor = end + 1;
            }
          }
        }

        return results;
      }

      const safeQueryCache = new Map();

      async function safeQuery(contract, eventName, extraFilter) {
        try {
          const key = eventName + JSON.stringify(extraFilter ?? {});
          const cached = safeQueryCache.get(key);

          if (cached && Date.now() - cached.time < 60000) {
            return cached.value;
          }

          // Arc RPC eth_getLogs rate limit protection
          // Goldsky index is source of truth. Skip direct RPC log scanning.
          console.log(`[safeQuery] skipped RPC scan for ${eventName}, using indexed data`);

          const result = [];

          safeQueryCache.set(key, {
            value: result,
            time: Date.now()
          });

          return result;

        } catch (e) {
          console.warn(`safeQuery(${eventName}) failed:`, e.message);
          return [];
        }
      }

      // ================================================================
      // WALLET CONNECTION
      // Single entry point — cleans up old listeners, validates chain,
      // initialises contracts, syncs on-chain state.
      // ================================================================
      async function connect() {
        if (!window.ethereum) {
          toast({ kind: "err", title: "No wallet detected", detail: "Install MetaMask to continue." });
          return;
        }
        setLoading(true);
        try {
          state.provider = new ethers.BrowserProvider(window.ethereum);
          state.provider.polling = false; // Disable auto-polling to avoid rate limits

          // Force the MetaMask approval prompt on every connect, even if the
          // site was connected before. wallet_requestPermissions re-opens the
          // account-selection / permission dialog so the user always confirms.
          try {
            await window.ethereum.request({
              method: "wallet_requestPermissions",
              params: [{ eth_accounts: {} }],
            });
          } catch (permErr) {
            // 4001 = user rejected the permission prompt
            if (permErr.code === 4001) throw permErr;
            // Any other error (e.g. method unsupported by the wallet) —
            // fall through to eth_requestAccounts below.
          }
          await window.ethereum.request({ method: "eth_requestAccounts" });

          state.signer  = await state.provider.getSigner();
          state.address = await state.signer.getAddress();

          // Enforce Arc Testnet — switch or add if needed
          await ensureArcNetwork();

          const net = await state.provider.getNetwork();
          state.chainId = Number(net.chainId);

          // Instantiate contracts with signer
          state.usdc      = new ethers.Contract(CONFIG.usdc,      ERC20_ABI,    state.signer);
          state.registry  = new ethers.Contract(CONFIG.registry,  REGISTRY_ABI, state.signer);
          state.payPerCall = new ethers.Contract(CONFIG.payPerCall, PAY_ABI,     state.signer);

          try { state.usdcDecimals = Number(await state.usdc.decimals()); } catch { state.usdcDecimals = 6; }

          showConnected();
          updateWelcomeBox().catch(() => {});

          // Initial full data sync from chain
          setLoading(false);
          await refreshAll();
          await loadMyCalls();
          await loadActivity();
          await updateWelcomeBox();

          // Real-time event listeners
          stopEventListeners(); // clean up any stale listeners first
          subscribeToEvents();
          startPollingFallback();

          // Reload on wallet change or network switch
          window.ethereum.removeAllListeners?.("accountsChanged");
          window.ethereum.removeAllListeners?.("chainChanged");
          window.ethereum.on?.("accountsChanged", () => location.reload());
          window.ethereum.on?.("chainChanged", () => { if (!window._cctpFlowActive) location.reload(); });

        } catch (e) {
          console.error("connect() failed:", e);
          const msg = e.code === 4001 ? "Wallet connection rejected by user."
                    : e.code === -32002 ? "Wallet request already pending — check MetaMask."
                    : e.message || "Unknown error";
          toast({ kind: "err", title: "Connect failed", detail: msg });
        } finally {
          setLoading(false);
        }
      }

      // -------- Listener cleanup --------
      function stopEventListeners() {
        try {
          if (state.payPerCall) state.payPerCall.removeAllListeners();
          if (state.registry)   state.registry.removeAllListeners();
        } catch {}
        if (state.pollInterval) { clearInterval(state.pollInterval); state.pollInterval = null; }
      }

      // -------- Polling fallback (fires every 15s, syncs if chain advanced) --------
      function startPollingFallback() {
        if (state.pollInterval) clearInterval(state.pollInterval);
        state.pollInterval = setInterval(async () => {
          if (!state.address || !state.payPerCall) return;
          try {
            const latest = await state.provider.getBlockNumber();
            if (latest > state.lastSyncBlock) {
              state.lastSyncBlock = latest;
              await Promise.all([
                refreshNetworkStats(),
                refreshAllProviders(),
              ]);
              await refreshLeaderboard(); // needs allProviders populated
            }
          } catch {}
        }, 5_000);
      }

      async function ensureArcNetwork() {
        // Re-create provider snapshot to get current chainId reliably
        const snap = new ethers.BrowserProvider(window.ethereum);
        const net  = await snap.getNetwork();
        if (Number(net.chainId) === CONFIG.chainId) return; // already on Arc Testnet

        try {
          // Try switching first — works if the network was added before
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: CONFIG.chainIdHex }],
          });
        } catch (switchErr) {
          if (switchErr.code === 4902 || switchErr.code === -32603) {
            // Network not yet in wallet — add it
            try {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [{
                  chainId: CONFIG.chainIdHex,
                  chainName: CONFIG.chainName,
                  rpcUrls: [CONFIG.rpcUrl],
                  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
                  blockExplorerUrls: [CONFIG.explorerBase],
                }],
              });
              // After adding, switch to it explicitly
              await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: CONFIG.chainIdHex }],
              }).catch(() => {}); // MetaMask auto-switches after add — ignore if fails
            } catch (addErr) {
              if (addErr.code === 4001) {
                throw new Error("You must approve adding Arc Testnet to MetaMask to continue.");
              }
              throw addErr;
            }
          } else if (switchErr.code === 4001) {
            throw new Error("You must switch to Arc Testnet in MetaMask to continue.");
          } else {
            throw switchErr;
          }
        }
        // Refresh provider/signer after network switch
        state.provider = new ethers.BrowserProvider(window.ethereum);
        state.signer   = await state.provider.getSigner();
        state.address  = await state.signer.getAddress();
      }

      function showConnected() {
        $("disconnectedView").classList.add("hidden");
        $("connectedView").classList.remove("hidden");
        $("connectBtn").classList.add("hidden");
        $("addrPill").classList.remove("hidden");
        $("addrText").textContent = short(state.address, 6);
        $("balanceBox").classList.remove("hidden");
        $("netLabel").textContent = CONFIG.chainName;
        $("netDot").classList.add("ok");
        $("btnResetMM").classList.remove("hidden");
        startLiveClock();
      }

      // Ticking clock — updates every second while connected
      let clockInterval = null;
      function startLiveClock() {
        if (clockInterval) return;
        const tick = () => {
          const now = new Date();
          const hh = String(now.getHours()).padStart(2, "0");
          const mm = String(now.getMinutes()).padStart(2, "0");
          const ss = String(now.getSeconds()).padStart(2, "0");
          const el = $("liveClock");
          if (el) el.textContent = `${hh}:${mm}:${ss}`;
        };
        tick();
        clockInterval = setInterval(tick, 1000);
      }

      // Update SLA gauge based on honor rate (receipts / calls)
      function updateGauge(honorRate) {
        const arc = $("gaugeArc");
        const val = $("gaugeValue");
        if (!arc || !val) return;
        const pct = Math.max(0, Math.min(100, honorRate));
        // Arc total length ~157 (half-circle radius 50)
        const CIRCUMFERENCE = 157;
        const offset = CIRCUMFERENCE - (CIRCUMFERENCE * pct) / 100;
        arc.setAttribute("stroke-dashoffset", offset);
        val.textContent = `${pct.toFixed(1)}%`;
        // Color shift based on value
        if (pct >= 90) val.style.color = "var(--accent)";
        else if (pct >= 70) val.style.color = "var(--warn)";
        else val.style.color = "var(--danger)";
      }

      function showDisconnected() {
        $("netLabel").textContent = "Disconnected";
        $("netDot").className = "net-dot";
        $("connectBtn").classList.remove("hidden");
        $("addrPill").classList.add("hidden");
        $("balanceBox").classList.add("hidden");
      }

      // -------- Refresh data --------
      // ----------------------------------------------------------------
      // INITIAL DATA SYNC — fetches all on-chain state after connect
      // or after any contract event fires.
      // ----------------------------------------------------------------
      async function refreshAll() {
        try {
          // First wave: sequential RPC reads to avoid Arc rate limits
          await refreshBalance();
          fetchUsdcUsdRate();
          fetchUsdcUsdRate();
          await new Promise(r => setTimeout(r, 1000));

          await refreshProvider();
          await new Promise(r => setTimeout(r, 1000));

          await refreshAllProviders();
          await new Promise(r => setTimeout(r, 1000));

          await refreshHero();
          await new Promise(r => setTimeout(r, 1000));

          await refreshNetworkStats();
          await new Promise(r => setTimeout(r, 1000));

          await refreshActivityChart();

          // Second wave: leaderboard (needs state.allProviders)
          await refreshLeaderboard();

          // Third wave: provider dashboard (needs state.providerInfo)
          await refreshProviderDashboard();

          // Update sync block
          try {
            const b = await state.provider?.getBlockNumber();
            if (b) state.lastSyncBlock = b;
          } catch {}

        } finally {
          refreshRunning = false;
        }
      }

      // Load existing calls for the connected wallet from on-chain event logs.
      // Called once on connect so the countdown is visible even for calls opened
      // before this session.
      async function loadMyCalls() {
        try {
          // Fast path: load caller calls from Goldsky first
          if (CONFIG.subgraphUrl) {
            try {
              const res = await fetch(CONFIG.subgraphUrl, {
                method: "POST",
                headers: {"Content-Type":"application/json"},
                body: JSON.stringify({
                  query: `{ calls(first:100, orderBy: startedAt, orderDirection: desc, where:{caller: "${state.address.toLowerCase()}"}) {
                    id
                    callId
                    providerId
                    caller
                    amount
                    startedAt
                    deadline
                    status
                  }}`
                })
              });

              const data = await res.json();
              const calls = data.data?.calls || [];

              for (const c of calls) {
                const callId = c.callId || c.id;

                if (!state.myCalls.has(callId)) {
                  state.myCalls.set(callId, {
                    callId,
                    providerId: c.providerId,
                    caller: c.caller,
                    amount: BigInt(c.amount || 0),
                    deadline: Number(c.deadline || 0),
                    startedAt: Number(c.startedAt || 0),
                    totalSec: 120,
                    status: Number(c.status || 1)
                  });
                }
              }

              console.log("[GOLDSKY CALLS]", calls.length);
            } catch(e) {
              console.warn("[Goldsky calls failed]", e.message);
            }
          }

          // RPC fallback

          const myFilter = state.payPerCall.filters.CallStarted(null, null, state.address);
          // Run log queries sequentially to avoid RPC rate limits
          const startedLogs = await safeQuery(
            state.payPerCall,
            "CallStarted",
            myFilter
          );

          await new Promise(r => setTimeout(r, 1000));

          const receiptLogs = await safeQuery(
            state.payPerCall,
            "ReceiptSubmitted"
          );

          await new Promise(r => setTimeout(r, 1000));

          const slashedLogs = await safeQuery(
            state.payPerCall,
            "CallSlashed"
          );

          const receiptSet = new Set(receiptLogs.map((l) => l.args.callId));
          const slashedSet = new Set(slashedLogs.map((l) => l.args.callId));

          for (const l of startedLogs) {
            const callId = l.args.callId;
            if (state.myCalls.has(callId)) continue;
            const deadlineNum = Number(l.args.deadline);
            let status = 1;
            if (receiptSet.has(callId)) status = 2;
            else if (slashedSet.has(callId)) status = 3;

            // Skip sequential getCall() RPC calls — use deadline arithmetic instead
            const totalSec = 60;
            const startedAt = deadlineNum - totalSec;

            state.myCalls.set(callId, {
              callId,
              providerId: l.args.providerId,
              caller: l.args.caller,
              amount: l.args.amount,
              deadline: deadlineNum,
              startedAt,
              totalSec,
              status,
            });
          }

          if (state.myCalls.size > 0) {
            renderCalls();
            const pending = Array.from(state.myCalls.values()).filter(c => c.status === 1);
            if (pending.length > 0) {
              const latest = pending[pending.length - 1];
              $("rcpCallId").value = latest.callId;
              $("toCallId").value = latest.callId;
            }
          }
        } catch (e) {
          console.warn("loadMyCalls failed:", e);
        }
      }

      async function refreshBalance() {
        try {
          if (!state.usdc || !state.address) return;
          // Ensure decimals are fetched (fallback to 6 for Arc USDC)
          if (!state.usdcDecimals) {
            try { state.usdcDecimals = Number(await state.usdc.decimals()); }
            catch { state.usdcDecimals = 6; }
          }
          const b = await state.usdc.connect(state.provider).balanceOf(state.address);
          const formatted = ethers.formatUnits(b, state.usdcDecimals);
          // Show up to 4 decimal places
          $("usdcBal").textContent = parseFloat(formatted).toFixed(4).replace(/\.?0+$/, "") || "0";

          // EURC balance
          try {
            const eurc = new ethers.Contract(CONFIG.eurc, ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"], state.provider);
            const eurcDecimals = await eurc.decimals().catch(() => 6);
            const eurcBal = await eurc.balanceOf(state.address);
            const eurcFormatted = ethers.formatUnits(eurcBal, eurcDecimals);
            const eurcEl = $("eurcBal");
            const eurcBox = $("eurcBalBox");
            if (eurcEl) eurcEl.textContent = parseFloat(eurcFormatted).toFixed(4).replace(/\.?0+$/, "") || "0";
            if (eurcBox) eurcBox.classList.remove("hidden");
          } catch(e) { console.warn("EURC balance failed:", e.message); }

          // USYC balance
          try {
            const usyc = new ethers.Contract(CONFIG.usyc, ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"], state.provider);
            const usycDecimals = await usyc.decimals().catch(() => 6);
            const usycBal = await usyc.balanceOf(state.address);
            const usycFormatted = ethers.formatUnits(usycBal, usycDecimals);
            const usycEl = $("usycBal");
            const usycBox = $("usycBalBox");
            if (usycEl) usycEl.textContent = parseFloat(usycFormatted).toFixed(4).replace(/\.?0+$/, "") || "0";
            if (usycBox && parseFloat(usycFormatted) > 0) usycBox.classList.remove("hidden");
          } catch(e) { console.warn("USYC balance failed:", e.message); }
        } catch (e) {
          console.warn("refreshBalance failed:", e.message);
          $("usdcBal").textContent = "—";
        }
      }

      async function refreshProvider() {
        try {
          const id = Number(await state.registry.providerIdOf(state.address));
          const regBtn = $("btnRegister");
          const actionRegister = $("actionRegister");
          const actionCall = $("actionCall");

          if (id === 0) {
            state.providerInfo = null;
            $("providerBox").innerHTML = `
              <div class="empty-state">not registered — use the left panel to stake</div>
            `;
            if (regBtn) {
              regBtn.disabled = false;
              regBtn.textContent = "Stake & register";
              regBtn.style.opacity = "1";
              regBtn.style.cursor = "pointer";
            }
            // Guide new users to register first. Only auto-open on the very
            // first refresh so we don't fight with user interaction.
            if (!state.actionsInitialized) {
              if (actionRegister) actionRegister.open = true;
              if (actionCall) actionCall.open = false;
              state.actionsInitialized = true;
            }
            return;
          }
          const data = await state.registry.getProvider(id);
          const endpoint = await state.registry.getEndpoint(id);
          const pending = Number(await state.registry.pendingCalls(id));
          state.providerInfo = { id, data, endpoint, pending };
          renderProvider();

          // Disable register button once registered — one provider per address
          if (regBtn) {
            regBtn.disabled = true;
            regBtn.textContent = `Already registered as #${id}`;
            regBtn.style.opacity = "0.5";
            regBtn.style.cursor = "not-allowed";
          }
          const regV2Btn = $("btnRegisterV2");
          if (regV2Btn) {
            regV2Btn.disabled = true;
            regV2Btn.textContent = `Already registered as #${id}`;
            regV2Btn.style.opacity = "0.5";
            regV2Btn.style.cursor = "not-allowed";
          }

          // Once registered, guide to the next natural step.
          if (!state.actionsInitialized) {
            if (actionRegister) actionRegister.open = false;
            if (actionCall) actionCall.open = true;
            state.actionsInitialized = true;
          }
        } catch (e) {
          console.error(e);
        }
      }

      function renderProvider() {
        if (!state.providerInfo) return;
        const { id, data, endpoint, pending } = state.providerInfo;
        const d = state.usdcDecimals;
        $("providerBox").innerHTML = `
          <dl class="kv">
            <dt>Provider ID</dt>
            <dd>#${id}</dd>
            <dt>Status</dt>
            <dd>${data.active ? `<span style="color: var(--accent)">● active</span>` : `<span style="color: var(--danger)">● inactive</span>`}</dd>
            <dt>Signer</dt>
            <dd>${short(data.signer, 6)}${data.signer.toLowerCase() === state.address.toLowerCase()
              ? ` <span style="color:var(--accent);font-size:11px">✓ matches your wallet</span>`
              : ` <span style="color:var(--danger);font-size:11px">⚠ does not match your wallet — you cannot submit receipts with this wallet</span>`
            }</dd>
            <dt>Stake</dt>
            <dd>${ethers.formatUnits(data.stake, d)} USDC</dd>
            <dt>Price / call</dt>
            <dd>${ethers.formatUnits(data.pricePerCall, d)} USDC</dd>
            <dt>Max response</dt>
            <dd>${data.maxResponseTime}s</dd>
            <dt>Slash</dt>
            <dd>${Number(data.slashBps) / 100}%</dd>
            <dt>Pending calls</dt>
            <dd>${pending}</dd>
            <dt>Endpoint</dt>
            <dd style="word-break: break-all">${endpoint || "—"}</dd>
          </dl>
        `;
      }

      async function refreshHero() {
        try {
          if (CONFIG.subgraphUrl) {
            const res = await fetch(CONFIG.subgraphUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query: `{ providers(first:1000){ id } }`
              })
            });

            const data = await res.json();
            const count = data.data?.providers?.length || 0;

            if (count > 0) {
              $("heroProviders").textContent = count.toString();
              console.log("[HERO] Goldsky providers:", count);
              return;
            }
          }

          const next = Number(await state.registry.nextProviderId());
          $("heroProviders").textContent = (next - 1).toString();
        } catch {}
      }

      // -------- All providers (public list) --------
      async function refreshAllProviders() {
        try {
          let total = 0;

          // Goldsky subgraph is the source of truth
          let subgraphLoaded = false;
          if (CONFIG.subgraphUrl) {
            try {
              const gql = await fetch(CONFIG.subgraphUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: `{
                  providers(first: 1000, orderBy: id, orderDirection: asc) {
                    id
                    owner
                    signer
                    stake
                    pricePerCall
                    active
                    completedCalls
                    slashedCalls
                  }
                }` })
              });
              const gdata = await gql.json();
              console.log("[GOLDSKY DEBUG]", JSON.stringify(gdata.data?.providers?.slice(0,3)));

              if (gdata.data && gdata.data.providers && gdata.data.providers.length > 0) {
                state.allProviders = gdata.data.providers.map(p => {
                  const completed = Number(p.completedCalls ?? 0);
                  const slashed = Number(p.slashedCalls ?? 0);
                  const total = completed + slashed;
                  const reputation = Math.round((completed + 2) / (total + 3) * 100);
                  return {
                    id: Number(p.id),
                    owner: p.owner,
                    signer: p.signer || p.owner,
                    stake: BigInt(p.stake ?? 0),
                    pricePerCall: BigInt(p.pricePerCall ?? 0),
                    maxResponseTime: 30,
                    slashBps: 2000,
                    active: p.active !== undefined ? p.active : true,
                    endpoint: "",
                    reputation,
                    completedCalls: completed,
                    slashedCalls: slashed,
                  };
                });
                console.log("[MAP RESULT]", state.allProviders.length);

                // Cache Goldsky providers for callService fallback
                window.__providers = state.allProviders;

                subgraphLoaded = true;
                console.log("[AFTER MAP CHECK]", state.allProviders.length);
                console.log("[subgraph] Loaded", state.allProviders.length, "providers from Goldsky");
                console.log("[REP DEBUG]", state.allProviders.slice(0,5).map(p => ({
                  id: p.id,
                  completed: p.completedCalls,
                  slashed: p.slashedCalls,
                  reputation: p.reputation
                })));
              }
            } catch (e) {
              console.warn("[subgraph] Failed, falling back to RPC:", e.message);
            }
          }

          if (false && !subgraphLoaded && total > 0) {
          console.log("[RPC FALLBACK] loading providers from chain");
          // Fetch all providers and their reputation scores in parallel
          const ids = [];
          for (let i = 1; i <= total; i++) ids.push(i);
          const [providers, endpoints, scores] = await Promise.all([
            Promise.all(ids.map((i) => state.registry.getProvider(i))),
            Promise.all(ids.map((i) => state.registry.getEndpoint(i).catch(() => ""))),
            Promise.all(ids.map((i) => state.registry.getReputationScore(i).catch(() => 0))),
          ]);

          state.allProviders = ids.map((id, i) => {
            const p = providers[i];
            return {
              id,
              owner: p.owner,
              signer: p.signer,
              stake: p.stake,
              pricePerCall: p.pricePerCall,
              maxResponseTime: p.maxResponseTime,
              slashBps: p.slashBps,
              active: p.active !== undefined ? p.active : true,
              endpoint: endpoints[i],
              reputation: Number(scores[i]),
            };
          });
          }

          renderAllProviders();
        } catch (e) {
          console.error("refreshAllProviders failed:", e);
        }
      }

      function renderAllProviders() {
        renderAllProvidersFiltered();
      }

      // -------- Network stats (on-chain aggregate) --------
      async function refreshNetworkStats() {
        try {
          // Providers and total calls come from contract state (cumulative, all-time).
          // Receipts/slashes still use event scan ("recent activity" only) since the
          // contract doesn't expose counters for those (would cost storage gas per tx).
          const res = await fetch(CONFIG.subgraphUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: `{ 
                providers(first:1000) {
                  completedCalls
                  slashedCalls
                }
                calls(first:1000) {
                  id
                }
              }`
            })
          });

          const json = await res.json();

          const providers = json.data?.providers || [];
          const calls = json.data?.calls || [];

          const totalCompleted = providers.reduce(
            (sum, p) => sum + Number(p.completedCalls || 0),
            0
          );

          const totalSlashed = providers.reduce(
            (sum, p) => sum + Number(p.slashedCalls || 0),
            0
          );

          state.networkStats = {
            providers: providers.length,
            calls: calls.length,
            receipts: totalCompleted,
            slashed: totalSlashed,
            slashedAmount: 0n,
          };

          const d = state.usdcDecimals;
          $("statProviders").textContent = state.networkStats.providers.toString();
          $("statCalls").textContent = state.networkStats.calls.toString();
          $("statReceipts").textContent = state.networkStats.receipts.toString();
          $("statSlashed").textContent = ethers.formatUnits(state.networkStats.slashedAmount, d);

          // Honor rate: only meaningful when we have receipts in scope.
          // If no receipts visible but calls exist, show "—" instead of misleading 0%.
          let honorRate;
          let honorLabel;
          if (state.networkStats.receipts === 0 && totalCalls === 0) {
            honorRate = null;
            honorLabel = "no activity yet";
          } else if (state.networkStats.receipts === 0) {
            // We have calls cumulatively but no receipts in recent window
            honorRate = null;
            honorLabel = "no recent receipts";
          } else {
            // Calculate honor rate using receipts vs (receipts + slashes) — the
            // closed calls in our window. This is the meaningful ratio.
            const closedInWindow = state.networkStats.receipts + state.networkStats.slashed;
            honorRate = closedInWindow > 0
              ? Math.round((state.networkStats.receipts / closedInWindow) * 100)
              : 100;
            honorLabel = `${honorRate}% honor rate (recent)`;
          }
          $("statReceiptsSub").textContent = honorLabel;
          if (honorRate !== null) {
            updateGauge(honorRate);
          } else {
            // Show neutral/empty gauge
            updateGauge(0);
            const val = $("gaugeValue");
            if (val) {
              val.textContent = "—";
              val.style.color = "var(--text-faint)";
            }
          }
          $("statSlashedSub").textContent = `${state.networkStats.slashed} slash${state.networkStats.slashed === 1 ? "" : "es"} (recent)`;

          // Also update hero (disconnected view)
          $("heroCalls").textContent = state.networkStats.calls.toString();
          $("heroSlashes").textContent = state.networkStats.slashed.toString();
        } catch (e) {
          console.error("refreshNetworkStats failed:", e);
        }
      }

      // -------- Provider Dashboard --------
      async function refreshProviderDashboard() {
        if (!state.providerInfo) return;
        const panel = $("providerDashPanel");
        if (panel) panel.style.display = "";
        const box = $("providerDashBox");
        if (!box) return;
        try {
          const { id } = state.providerInfo;
          const d = state.usdcDecimals;
          const [completed, slashed, score] = await Promise.all([
            state.registry.completedCalls(id).catch(() => 0n),
            state.registry.slashedCalls(id).catch(() => 0n),
            state.registry.getReputationScore(id).catch(() => 66),
          ]);
          const comp = Number(completed);
          const slash = Number(slashed);
          const rep = Number(score);
          const total = comp + slash;
          const honorRate = total > 0 ? ((comp / total) * 100).toFixed(1) : "—";

          // Estimate earned USDC from CompletedCalls * pricePerCall
          const price = state.providerInfo.data.pricePerCall;
          const earnedRaw = price * BigInt(comp);
          const earned = parseFloat(ethers.formatUnits(earnedRaw, d)).toFixed(4);

          // Mini reputation history sparkline (simulate last 8 points from completed/slashed ratio)
          const sparkBars = Array.from({length: 8}, (_, i) => {
            const frac = Math.max(0.1, Math.min(1, (comp + 2) / Math.max(1, total + 3 - (7-i))));
            return `<div class="rep-bar" style="height:${Math.round(frac*32)}px" title="rep ~${Math.round(frac*100)}"></div>`;
          }).join("");

          const repColor = rep >= 80 ? "var(--accent)" : rep >= 50 ? "var(--warn)" : "var(--danger)";

          box.innerHTML = `
            <div class="dash-grid">
              <div class="dash-cell">
                <div class="d-label">Earned (est.)</div>
                <div class="d-value" style="color:var(--accent)">${earned}</div>
                <div class="d-sub">USDC from ${comp} calls</div>
              </div>
              <div class="dash-cell">
                <div class="d-label">Honor rate</div>
                <div class="d-value">${honorRate}%</div>
                <div class="d-sub">${comp} honored · ${slash} slashed</div>
              </div>
              <div class="dash-cell">
                <div class="d-label">Reputation</div>
                <div class="d-value" style="color:${repColor}">${rep}</div>
                <div class="d-sub">score / 100</div>
              </div>
            </div>
            <div style="margin-top:4px">
              <div style="font-size:11px;color:var(--text-faint);margin-bottom:6px;font-family:var(--font-mono);letter-spacing:0.06em;text-transform:uppercase">Reputation trend (estimated)</div>
              <div class="rep-sparkline">${sparkBars}</div>
            </div>
          `;

          const upd = $("dashLastUpdate");
          if (upd) upd.textContent = `updated ${new Date().toLocaleTimeString("en-US",{hour12:false})}`;
        } catch(e) {
          console.error("refreshProviderDashboard failed:", e);
        }
      }

      // -------- Leaderboard (top providers by reputation) --------
      async function refreshLeaderboard() {
        try {
          const providers = state.allProviders ?? [];
          if (providers.length === 0) {
            $("leaderboardBox").innerHTML = `<div class="empty-state">no providers yet</div>`;
            return;
          }
          // Sort by reputation desc, then by stake desc as tiebreaker
          const ranked = [...providers]
            .sort((a, b) => {
              const rep = (b.reputation ?? 0) - (a.reputation ?? 0);
              if (rep !== 0) return rep;
              return Number(b.stake - a.stake);
            })
            .slice(0, 10);

          const myAddr = state.address?.toLowerCase();
          const rows = ranked
            .map((p, i) => {
              const rank = i + 1;
              const rep = p.reputation ?? 0;
              const isSelf = myAddr && p.owner?.toLowerCase() === myAddr;
              const topClass = rank <= 3 ? ` top-${rank}` : "";
              const selfClass = isSelf ? " is-self" : "";
              const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
              const fillClass = rep >= 80 ? "" : rep >= 50 ? "warn" : "crit";
              const callsTotal = (state.networkStats?.receipts ?? 0);
              return `
                <div class="lb-row${topClass}${selfClass}" data-pid="${p.id}">
                  <div class="lb-rank">${medal}</div>
                  <div class="lb-owner">
                    <span>#${p.id} · ${short(p.owner, 4)}</span>
                    ${isSelf ? `<span class="self-tag">you</span>` : ""}
                  </div>
                  <div class="lb-bar"><div class="lb-bar-fill ${fillClass}" style="width: ${rep}%"></div></div>
                  <div class="lb-score">${rep}<span style="font-size:9px;color:var(--text-faint);font-weight:400;margin-left:4px">${(p.completedCalls||0)+(p.slashedCalls||0) > 0 ? Math.round((p.completedCalls||0)/((p.completedCalls||0)+(p.slashedCalls||0))*100)+'%' : ''}</span></div>
                </div>
              `;
            })
            .join("");

          $("leaderboardBox").innerHTML = `<div class="leaderboard">${rows}</div>`;

          $("leaderboardBox")
            .querySelectorAll(".lb-row[data-pid]")
            .forEach((row) => {
              row.addEventListener("click", () =>
                openProviderModal(Number(row.dataset.pid)),
              );
            });
        } catch (e) {
          console.error("refreshLeaderboard failed:", e);
        }
      }

      // -------- Activity chart (hourly buckets, last 24h) --------
      async function refreshActivityChart() {
        try {
          // Try Goldsky first
          if (CONFIG.subgraphUrl) {
            try {
              const gRes = await fetch(CONFIG.subgraphUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: `{ calls(first:500, orderBy:createdAt, orderDirection:desc) { createdAt status } }` })
              });
              const gJson = await gRes.json();
              if (gJson.data?.calls?.length > 0) {
                const now0 = Math.floor(Date.now() / 1000);
                const cutoff0 = now0 - 86400;
                const buckets0 = Array.from({ length: 24 }, () => ({ calls: 0, slashes: 0 }));
                for (const c of gJson.data.calls) {
                  const t = Number(c.createdAt);
                  if (t < cutoff0) continue;
                  const idx = Math.min(23, Math.floor((t - cutoff0) / 3600));
                  if (c.status === "SLASHED") buckets0[idx].slashes++;
                  else buckets0[idx].calls++;
                }
                const max0 = Math.max(1, ...buckets0.map(b => b.calls));
                const bars0 = buckets0.map((b, i) => {
                  const h = (b.calls / max0) * 100;
                  const tip = (23-i) + "h ago · " + b.calls + " calls";
                  return '<div class="chart-bar" style="height:' + Math.max(h, 2) + '%" data-tip="' + tip + '"></div>';
                }).join("");
                $("activityChartBox").innerHTML = '<div class="activity-chart">' + bars0 + '</div>';
                return;
              }
            } catch(ge) { console.warn("[chart] goldsky:", ge.message); }
          }
          // Fallback RPC
          const [startedLogs, slashedLogs] = await Promise.all([
            safeQuery(state.payPerCall, "CallStarted"),
            safeQuery(state.payPerCall, "CallSlashed"),
          ]);

          // Get current block and estimate timestamps backwards.
          // Arc testnet has ~2s block time; last 24h ~= 43200 blocks.
          const provider = state.payPerCall.runner.provider;
          const latestBlock = await provider.getBlockNumber();
          const latestBlockInfo = await provider.getBlock(latestBlock);
          const now = latestBlockInfo ? Number(latestBlockInfo.timestamp) : Math.floor(Date.now() / 1000);
          const cutoff = now - 24 * 3600;
          const BLOCK_TIME_SEC = 2;

          // For each log, estimate its timestamp from (latestBlock - log.blockNumber) * blockTime
          // This avoids N getBlock() calls which are expensive.
          const ts = (log) => now - (latestBlock - log.blockNumber) * BLOCK_TIME_SEC;

          // Bucket into 24 hourly slots
          const buckets = Array.from({ length: 24 }, () => ({ calls: 0, slashes: 0 }));
          for (const log of startedLogs) {
            const t = ts(log);
            if (t < cutoff) continue;
            const idx = Math.min(23, Math.floor((t - cutoff) / 3600));
            buckets[idx].calls++;
          }
          for (const log of slashedLogs) {
            const t = ts(log);
            if (t < cutoff) continue;
            const idx = Math.min(23, Math.floor((t - cutoff) / 3600));
            buckets[idx].slashes++;
          }

          const maxCount = Math.max(1, ...buckets.map((b) => b.calls));
          const bars = buckets
            .map((b, i) => {
              const height = (b.calls / maxCount) * 100;
              const slashPct = b.calls > 0 ? (b.slashes / b.calls) * 100 : 0;
              const hourAgo = 23 - i;
              const tip = b.calls === 0
                ? `${hourAgo}h ago · no calls`
                : `${hourAgo}h ago · ${b.calls} call${b.calls === 1 ? "" : "s"}${b.slashes ? ` · ${b.slashes} slashed` : ""}`;
              const slashClass = b.slashes > 0 ? "has-slash" : "";
              return `<div class="chart-bar ${slashClass}" style="height: ${Math.max(height, 2)}%; --slash-pct: ${slashPct}%" data-tip="${tip}"></div>`;
            })
            .join("");

          // Build slash rate trend line (% of calls slashed per hour)
          const slashRates = buckets.map(b => b.calls > 0 ? (b.slashes / b.calls) * 100 : 0);
          const maxRate = Math.max(1, ...slashRates);
          // SVG polyline points (w=100%, h=32px chart overlay)
          const pts = slashRates.map((r, i) => {
            const x = (i / 23) * 100;
            const y = 32 - (r / maxRate) * 28;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(" ");

          const totalSlashPct = buckets.reduce((a,b) => a + b.calls, 0) > 0
            ? ((buckets.reduce((a,b) => a + b.slashes, 0) / buckets.reduce((a,b) => a + b.calls, 0)) * 100).toFixed(1)
            : "0.0";

          $("activityChartBox").innerHTML = `
            <div class="activity-chart" style="position:relative">${bars}
              <svg viewBox="0 0 100 32" preserveAspectRatio="none"
                style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;opacity:0.7">
                <polyline points="${pts}" fill="none" stroke="var(--danger)" stroke-width="0.8" stroke-dasharray="2,1"/>
              </svg>
            </div>
            <div class="chart-legend" style="justify-content:space-between">
              <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-faint)">24h slash rate: <strong style="color:${parseFloat(totalSlashPct)>20?'var(--danger)':parseFloat(totalSlashPct)>5?'var(--warn)':'var(--accent)'}">${totalSlashPct}%</strong></span>
              <div style="display:flex;gap:16px">
                <div class="chart-legend-item">
                  <div class="chart-legend-swatch" style="background: var(--accent-dim)"></div>
                  <span>calls</span>
                </div>
                <div class="chart-legend-item">
                  <div class="chart-legend-swatch" style="background: var(--danger)"></div>
                  <span>slashes</span>
                </div>
                <div class="chart-legend-item">
                  <div style="width:16px;height:2px;border-top:2px dashed var(--danger);margin-top:4px"></div>
                  <span>slash rate</span>
                </div>
              </div>
            </div>
          `;
        } catch (e) {
          console.error("refreshActivityChart failed:", e);
        }
      }

      // -------- Provider detail modal --------
      async function openProviderModal(providerId) {
        const root = $("modalRoot");
        root.innerHTML = `
          <div class="modal-backdrop" id="modalBackdrop">
            <div class="modal" onclick="event.stopPropagation()">
              <div class="modal-head">
                <h2>Provider #${providerId}</h2>
                <button class="modal-close" id="modalCloseBtn">×</button>
              </div>
              <div class="modal-body">
                <div class="empty-state">loading provider details…</div>
              </div>
            </div>
          </div>
        `;

        $("modalBackdrop").addEventListener("click", closeModal);
        $("modalCloseBtn").addEventListener("click", closeModal);

        // Helper: get the current modal-body, or null if the modal has been closed.
        const getBody = () => root.querySelector(".modal-body");

        try {
          const [provider, endpoint, pending, onChainScore, completedCount, slashedCount] = await Promise.all([
            state.registry.getProvider(providerId),
            state.registry.getEndpoint(providerId),
            state.registry.pendingCalls(providerId),
            state.registry.getReputationScore(providerId),
            state.registry.completedCalls(providerId),
            state.registry.slashedCalls(providerId),
          ]);

          // Fetch all calls for this provider by filtering CallStarted events
          const startedLogs = await safeQuery(
            state.payPerCall,
            "CallStarted",
            state.payPerCall.filters.CallStarted(null, providerId),
          );
          const receiptLogs = await safeQuery(state.payPerCall, "ReceiptSubmitted");
          const slashedLogs = await safeQuery(state.payPerCall, "CallSlashed");

          const receiptSet = new Set(receiptLogs.map((l) => l.args.callId));
          const slashedSet = new Set(slashedLogs.map((l) => l.args.callId));

          const calls = startedLogs.map((l) => {
            const cid = l.args.callId;
            let status = "pending";
            if (receiptSet.has(cid)) status = "completed";
            else if (slashedSet.has(cid)) status = "slashed";
            return {
              callId: cid,
              caller: l.args.caller,
              amount: l.args.amount,
              deadline: Number(l.args.deadline),
              blockNumber: l.blockNumber,
              status,
              txHash: l.transactionHash,
            };
          });

          // Use on-chain values as source of truth — event log fallback for display only
          const completed = Number(completedCount);
          const slashed = Number(slashedCount);
          const total = completed + slashed + calls.filter((c) => c.status === "pending").length;
          const honorRate = completed + slashed > 0 ? Math.round((completed / (completed + slashed)) * 100) : 100;

          // Reputation comes from the contract (Bayesian formula α=2, β=1)
          const reputation = Number(onChainScore);
          const repClass = reputation >= 80 ? "" : reputation >= 50 ? "low" : "crit";

          const isSelf = provider.owner.toLowerCase() === state.address?.toLowerCase();
          const d = state.usdcDecimals;

          const recentCallsHtml = calls
            .slice(-8)
            .reverse()
            .map((c) => {
              const dotClass =
                c.status === "completed"
                  ? "status-completed"
                  : c.status === "slashed"
                  ? "status-slashed"
                  : "status-pending";
              return `
                <div class="mini-call">
                  <span class="status-dot ${dotClass}"></span>
                  <div>
                    <span class="call-hash">${short(c.callId, 5)}</span>
                    <span class="call-time">by ${short(c.caller, 4)}</span>
                  </div>
                  <span class="call-amount">${ethers.formatUnits(c.amount, d)} USDC</span>
                </div>
              `;
            })
            .join("");

          const body = getBody();
          if (!body) return; // modal closed during async load
          body.innerHTML = `
            <div class="section-title">Reputation</div>
            <div class="provider-metrics">
              <div class="metric-cell">
                <div class="metric-label">Score</div>
                <div class="metric-value ${reputation >= 80 ? "accent" : reputation >= 50 ? "" : "danger"}">${reputation}</div>
                <div class="rep-meter">
                  <div class="rep-fill ${repClass}" style="width: ${reputation}%"></div>
                </div>
              </div>
              <div class="metric-cell">
                <div class="metric-label">Honor rate</div>
                <div class="metric-value accent">${honorRate}%</div>
                <div class="metric-sub">${completed} of ${completed + slashed || 0}</div>
              </div>
              <div class="metric-cell">
                <div class="metric-label">Total calls</div>
                <div class="metric-value">${total}</div>
                <div class="metric-sub">${pending} pending</div>
              </div>
              <div class="metric-cell">
                <div class="metric-label">Slashed</div>
                <div class="metric-value ${slashed > 0 ? "danger" : ""}">${slashed}</div>
                <div class="metric-sub">${slashed > 0 ? '<span id="modalSlashDetail" style="cursor:pointer;text-decoration:underline dotted;color:var(--danger)">view reasons ↓</span>' : "no violations"}</div>
              </div>
            </div>

            <div class="section-title">Performance</div>
            <dl class="kv" id="modalPerfStats">
              <dt>Avg response time</dt><dd id="modalAvgResp">calculating…</dd>
              <dt>Fastest</dt><dd id="modalFastResp">—</dd>
              <dt>Slowest</dt><dd id="modalSlowResp">—</dd>
            </dl>

            <div class="section-title">Terms</div>
            <dl class="kv">
              <dt>Owner</dt>
              <dd>${provider.owner}${isSelf ? `<span class="self-tag">you</span>` : ""}</dd>
              <dt>Signer</dt>
              <dd>${provider.signer}</dd>
              <dt>Status</dt>
              <dd>${provider.active ? `<span style="color: var(--accent)">● active</span>` : `<span style="color: var(--danger)">● inactive</span>`}</dd>
              <dt>Stake</dt>
              <dd>${ethers.formatUnits(provider.stake, d)} USDC</dd>
              <dt>Price / call</dt>
              <dd>${ethers.formatUnits(provider.pricePerCall, d)} USDC</dd>
              <dt>Max response</dt>
              <dd>${provider.maxResponseTime}s</dd>
              <dt>Slash</dt>
              <dd>${Number(provider.slashBps) / 100}%</dd>
              <dt>Endpoint</dt>
              <dd style="word-break: break-all">${endpoint || "—"}</dd>
            </dl>

            ${
              calls.length > 0
                ? `
              <div class="section-title">Recent calls (${calls.length} total)</div>
              <div>${recentCallsHtml}</div>
            `
                : `<div class="section-title">No calls yet</div>`
            }

            <div id="modalGoldskyStats" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
              <div class="section-title">On-chain analytics</div>
              <div style="font-size:12px;color:var(--text-faint)">loading from Goldsky…</div>
            </div>

            ${
              provider.active
                ? `
              <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; gap: 8px; justify-content: flex-end; flex-wrap:wrap">
                <button class="btn btn-sm btn-nano" id="modalNanoBtn" data-nano-provider="${providerId}">
                  ⚡ Nanopay 0.001 USDC
                </button>
                ${!isSelf ? `<button class="btn btn-sm" id="modalCallBtn">Call this provider</button>` : ""}
              </div>
            `
                : ""
            }
          `;

          // Compute average response time from CallStarted vs ReceiptSubmitted events
          (async () => {
            try {
              const startMap = new Map();
              for (const l of startedLogs) {
                startMap.set(l.args.callId, l.blockNumber);
              }
              const receiptFull = await safeQuery(state.payPerCall, "ReceiptSubmitted");
              const BLOCK_TIME = 2; // Arc ~2s
              const diffs = [];
              for (const r of receiptFull) {
                const startBlock = startMap.get(r.args.callId);
                if (startBlock != null) {
                  diffs.push((r.blockNumber - startBlock) * BLOCK_TIME);
                }
              }
              const avgEl = document.getElementById("modalAvgResp");
              const fastEl = document.getElementById("modalFastResp");
              const slowEl = document.getElementById("modalSlowResp");
              if (diffs.length === 0) {
                if (avgEl) avgEl.textContent = "no data yet";
                if (fastEl) fastEl.textContent = "—";
                if (slowEl) slowEl.textContent = "—";
              } else {
                const avg = (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(1);
                const fast = Math.min(...diffs);
                const slow = Math.max(...diffs);
                if (avgEl) avgEl.textContent = `~${avg}s (${diffs.length} receipts)`;
                if (fastEl) fastEl.textContent = `${fast}s`;
                if (slowEl) slowEl.textContent = `${slow}s`;
              }
            } catch {}
          })();

          // Slash reason timeline
          if (slashed > 0) {
            const slashDetail = document.getElementById("modalSlashDetail");
            if (slashDetail) {
              slashDetail.addEventListener("click", () => {
                const existing = document.getElementById("slashTimeline");
                if (existing) { existing.remove(); return; }
                const timeline = document.createElement("div");
                timeline.id = "slashTimeline";
                timeline.className = "dispute-timeline";
                timeline.style.marginTop = "8px";

                const slashItems = calls.filter(c => c.status === "slashed");
                if (slashItems.length === 0) {
                  timeline.innerHTML = `<div style="color:var(--text-faint);font-size:12px">No slash events found in recent scan window.</div>`;
                } else {
                  timeline.innerHTML = slashItems.map(c => {
                    const when = c.deadline ? new Date(c.deadline * 1000).toLocaleString() : "unknown time";
                    return `<div class="dispute-timeline-item">
                      <div class="dispute-dot danger"></div>
                      <div>
                        <div style="font-family:var(--font-mono);font-size:11px;color:var(--text)">${short(c.callId, 8)}</div>
                        <div style="color:var(--text-faint);font-size:11px">Deadline: ${when} · by ${short(c.caller, 4)}</div>
                      </div>
                    </div>`;
                  }).join("");
                }
                slashDetail.closest(".metric-cell").appendChild(timeline);
              });
            }
          }

          // Load Goldsky analytics for this provider
          (async () => {
            const statsEl = document.getElementById("modalGoldskyStats");
            if (!statsEl || !CONFIG.subgraphUrl) return;
            try {
              const res = await fetch(CONFIG.subgraphUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: `{
                  provider(id: "${providerId}") {
                    completedCalls slashedCalls pricePerCall stake
                  }
                  recentCalls: calls(first: 10, where: {providerId: "${providerId}"}, orderBy: createdAt, orderDirection: desc) {
                    id amount timestamp
                  }
                }` })
              });
              const data = await res.json();
              const p = data.data?.provider;
              const recent = data.data?.recentCalls || [];
              if (!p) { statsEl.innerHTML = '<div class="section-title">On-chain analytics</div><div style="font-size:12px;color:var(--text-faint)">No data indexed yet</div>'; return; }
              const completed = Number(p.completedCalls ?? 0);
              const slashed = Number(p.slashedCalls ?? 0);
              const total = completed + slashed;
              const honor = total > 0 ? Math.round(completed/total*100) : 100;
              const barColor = honor >= 80 ? "var(--accent)" : honor >= 50 ? "var(--warn)" : "var(--danger)";
              const vol = recent.reduce((a,c) => a + Number(c.amount||0), 0) / 1e6;
              statsEl.innerHTML = `
                <div class="section-title">On-chain analytics <span style="font-size:10px;color:var(--text-faint);font-weight:400">via Goldsky</span></div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
                  <div style="background:var(--bg-2);border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:18px;font-weight:700;color:${barColor}">${honor}%</div>
                    <div style="font-size:10px;color:var(--text-faint)">Honor rate</div>
                  </div>
                  <div style="background:var(--bg-2);border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:18px;font-weight:700;color:var(--text)">${total}</div>
                    <div style="font-size:10px;color:var(--text-faint)">Total calls</div>
                  </div>
                  <div style="background:var(--bg-2);border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:18px;font-weight:700;color:var(--accent)">${vol.toFixed(2)}</div>
                    <div style="font-size:10px;color:var(--text-faint)">USDC vol (10)</div>
                  </div>
                </div>
                <div style="background:var(--bg-2);border-radius:6px;padding:6px;height:8px;margin-bottom:8px">
                  <div style="height:100%;width:${honor}%;background:${barColor};border-radius:4px;transition:width .5s"></div>
                </div>
              `;
            } catch(e) {
              const statsEl2 = document.getElementById("modalGoldskyStats");
              if (statsEl2) statsEl2.innerHTML = '<div class="section-title">On-chain analytics</div>';
            }
          })();

          // Load Goldsky analytics for this provider
          (async () => {
            const statsEl = document.getElementById("modalGoldskyStats");
            if (!statsEl || !CONFIG.subgraphUrl) return;
            try {
              const res = await fetch(CONFIG.subgraphUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: `{
                  provider(id: "${providerId}") {
                    completedCalls slashedCalls pricePerCall stake
                  }
                  recentCalls: calls(first: 10, where: {providerId: "${providerId}"}, orderBy: createdAt, orderDirection: desc) {
                    id amount timestamp
                  }
                }` })
              });
              const data = await res.json();
              const p = data.data?.provider;
              const recent = data.data?.recentCalls || [];
              if (!p) { statsEl.innerHTML = '<div class="section-title">On-chain analytics</div><div style="font-size:12px;color:var(--text-faint)">No data indexed yet</div>'; return; }
              const completed = Number(p.completedCalls ?? 0);
              const slashed = Number(p.slashedCalls ?? 0);
              const total = completed + slashed;
              const honor = total > 0 ? Math.round(completed/total*100) : 100;
              const barColor = honor >= 80 ? "var(--accent)" : honor >= 50 ? "var(--warn)" : "var(--danger)";
              const vol = recent.reduce((a,c) => a + Number(c.amount||0), 0) / 1e6;
              statsEl.innerHTML = `
                <div class="section-title">On-chain analytics <span style="font-size:10px;color:var(--text-faint);font-weight:400">via Goldsky</span></div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
                  <div style="background:var(--bg-2);border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:18px;font-weight:700;color:${barColor}">${honor}%</div>
                    <div style="font-size:10px;color:var(--text-faint)">Honor rate</div>
                  </div>
                  <div style="background:var(--bg-2);border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:18px;font-weight:700;color:var(--text)">${total}</div>
                    <div style="font-size:10px;color:var(--text-faint)">Total calls</div>
                  </div>
                  <div style="background:var(--bg-2);border-radius:6px;padding:8px;text-align:center">
                    <div style="font-size:18px;font-weight:700;color:var(--accent)">${vol.toFixed(2)}</div>
                    <div style="font-size:10px;color:var(--text-faint)">USDC vol (10)</div>
                  </div>
                </div>
                <div style="background:var(--bg-2);border-radius:6px;padding:6px;height:8px;margin-bottom:8px">
                  <div style="height:100%;width:${honor}%;background:${barColor};border-radius:4px;transition:width .5s"></div>
                </div>
              `;
            } catch(e) {
              const statsEl2 = document.getElementById("modalGoldskyStats");
              if (statsEl2) statsEl2.innerHTML = '<div class="section-title">On-chain analytics</div>';
            }
          })();

          const callBtn = document.getElementById("modalCallBtn");
          if (callBtn) {
            callBtn.addEventListener("click", () => {
              $("callProviderId").value = providerId.toString();
              $("callProviderId").dispatchEvent(new Event("blur"));
              closeModal();
              $("actionCall").open = true;
              $("actionCall").scrollIntoView({ behavior: "smooth", block: "center" });
            });
          }

          const nanoBtn = document.getElementById("modalNanoBtn");
          if (nanoBtn) {
            nanoBtn.addEventListener("click", async () => {
              const origText = nanoBtn.textContent;
              nanoBtn.disabled = true;
              nanoBtn.textContent = "Processing…";
              try {
                const res = await fetch(CONFIG.facilitatorUrl + "/nano/call", { method: "POST" });
                const data = await res.json();
                if (res.ok) {
                  toast({ kind: "ok", title: "⚡ Nanopayment sent", detail: data.amount + " USDC to Provider #" + providerId, timeout: 5000 });
                  nanoBtn.textContent = "✓ Paid " + data.amount + " USDC";
                  setTimeout(() => { nanoBtn.textContent = origText; nanoBtn.disabled = false; }, 3000);
                } else {
                  throw new Error(data.error || "HTTP " + res.status);
                }
              } catch (e) {
                toast({ kind: "err", title: "Nanopayment failed", detail: e.message, timeout: 5000 });
                nanoBtn.textContent = origText;
                nanoBtn.disabled = false;
              }
            });
          }
        } catch (e) {
          console.error(e);
          const body = getBody();
          if (!body) return;
          body.innerHTML = `
            <div class="empty-state" style="color: var(--danger)">
              failed to load: ${e.message}
            </div>
          `;
        }
      }

      function closeModal() {
        $("modalRoot").innerHTML = "";
      }

      // Escape to close modal
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeModal();
      });

      // -------- Actions: register --------
      async function doRegister() {
        // Network guard — reject if not on Arc Testnet
        if (state.chainId && state.chainId !== CONFIG.chainId) {
          toast({ kind: "err", title: "Wrong network", detail: `Switch to Arc Testnet (chain ID ${CONFIG.chainId}) to continue.`, timeout: 8000 });
          return;
        }
        const signerAddr = $("regSigner").value.trim() || state.address;
        const stake = $("regStake").value.trim();
        const price = $("regPrice").value.trim();
        const maxResp = parseInt($("regMaxResp").value.trim() || "120", 10);
        const slashPct = parseFloat($("regSlashPct").value.trim() || "10");
        const endpoint = $("regEndpoint").value.trim();

        if (!stake || !price || isNaN(maxResp) || isNaN(slashPct)) {
          toast({ kind: "err", title: "Fill in all fields" });
          return;
        }

        // Client-side sanity checks that mirror the contract's require()s.
        // These give a clear message before the user wastes gas.
        if (state.providerInfo && state.providerInfo.id) {
          toast({
            kind: "err",
            title: "Already registered",
            detail: `You are already provider #${state.providerInfo.id}. Each address can only register one provider.`,
            timeout: 8000,
          });
          return;
        }

        const stakeNum = parseFloat(stake);
        if (stakeNum < 10) {
          toast({
            kind: "err",
            title: "Stake too low",
            detail: "Minimum stake is 10 USDC.",
            timeout: 6000,
          });
          return;
        }

        if (maxResp < 10) {
          toast({
            kind: "err",
            title: "Response time too short",
            detail: "Minimum maxResponseTime is 10 seconds.",
            timeout: 6000,
          });
          return;
        }

        if (slashPct < 0 || slashPct > 100) {
          toast({
            kind: "err",
            title: "Slash % out of range",
            detail: "Slash percentage must be between 0 and 100.",
            timeout: 6000,
          });
          return;
        }

        const btn = $("btnRegister");
        if (btn.disabled) return;
        setLoading(true);
        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = "Processing…";

        try {
          const stakeWei = ethers.parseUnits(stake, state.usdcDecimals);
          const priceWei = ethers.parseUnits(price, state.usdcDecimals);
          const slashBps = Math.round(slashPct * 100);

          // Step 1: approve — skip if allowance already sufficient
          document.querySelectorAll(".toast.info").forEach(t => t.remove());
          const existingAllowance = await state.usdc.allowance(state.address, CONFIG.registry);
          if (existingAllowance < stakeWei) {
            const tApprove = toast({
              kind: "info",
              title: "Approving USDC…",
              detail: `<span class="spinner"></span> Waiting for MetaMask signature`,
              timeout: 60000,
            });
            let txA;
            try {
              txA = await state.usdc.approve(CONFIG.registry, ethers.MaxUint256);
            } catch (approveErr) {
              tApprove.remove();
              throw approveErr;
            }
            tApprove.querySelector(".title").textContent = "Approval sent";
            tApprove.querySelector(".detail").innerHTML = `tx ${short(txA.hash, 6)}`;
            await txA.wait();
            tApprove.remove();
            toast({ kind: "ok", title: "USDC approved ✓", link: txLink(txA.hash), detail: short(txA.hash, 8) });
          }

          // Step 2: register
          const tReg = toast({
            kind: "info",
            title: "Registering provider…",
            detail: `<span class="spinner"></span> Waiting for MetaMask signature`,
            timeout: 60000,
          });
          let tx;
          try {
            tx = await state.registry.register(signerAddr, stakeWei, priceWei, maxResp, slashBps, endpoint);
          } catch (regErr) {
            tReg.remove();
            throw regErr;
          }
          await tx.wait();
          tReg.remove();
          toast({
            kind: "ok",
            title: "Provider registered",
            link: txLink(tx.hash),
            detail: `stake: ${stake} usdc`,
          });
          pushActivity({
            type: "register",
            icon: "🏗️",
            label: "Registered as provider",
            detail: `${stake} USDC staked`,
            txHash: tx.hash,
          });
          await refreshAll();
          $("actionRegister").open = false;
          $("actionCall").open = true;
        } catch (e) {
          console.error(e);
          toast({ kind: "err", title: "Register failed", detail: friendlyError(e) });
        } finally {
          setLoading(false);
          btn.disabled = false;
          btn.textContent = origText;
        }
      }

      // Map known contract error selectors to human messages.
      // The signatures are keccak256(errorName()) and these are the first 4 bytes.
      const ERROR_SELECTORS = {
        "0x3a81d6fc": "Already registered (one provider per address).",
        "0x5b0a6366": "Stake too low (minimum 10 USDC).",
        "0x9067f0fa": "Response time too short (minimum 10 seconds).",
        "0xe2c7a6fe": "Slash % too high (maximum 100%).",
        "0x8579befe": "Signer cannot be the zero address.",
        "0x2a38b8d8": "Unknown provider.",
        "0x82b42900": "Caller is not the owner of this provider.",
        "0x1d4c9010": "Cannot unstake while calls are pending.",
        "0x8a65b01f": "Cooldown period has not passed yet.",
        "0x025dbdd4": "Invalid signature on receipt.",
        "0x00b8b8a3": "Call not in expected status.",
        "0x46ecc9cb": "Deadline has already passed.",
        "0x42b1e36b": "Deadline has not been reached yet.",
        "0x559895a3": "Invalid signature — make sure you are signing with the registered provider signer.",
        "0x8baa579f": "SLA deadline has passed — the provider missed the response window.",
        "0xb3b42b14": "Call ID collision — please try again.",
        "0xac4e7849": "Provider is not active.",
      };

      function friendlyError(e) {
        if (!e) return "unknown error";
        // User rejected
        if (e.code === "ACTION_REJECTED" || e.code === 4001)
          return "Transaction rejected by user.";
        // Wallet request already pending
        if (e.code === -32002)
          return "MetaMask is already waiting for a response — check the extension.";
        // Network / RPC error
        if (e.code === -32603)
          return "RPC error — check your network connection and try again.";
        // Try custom contract error selector (first 4 bytes of revert data)
        const data = e.data || e.error?.data;
        if (typeof data === "string" && data.length >= 10) {
          const sel = data.slice(0, 10).toLowerCase();
          if (ERROR_SELECTORS[sel]) return ERROR_SELECTORS[sel];
        }
        // Ethers reason string
        if (e.reason) return e.reason;
        // Short message from ethers v6
        if (e.shortMessage) return e.shortMessage.slice(0, 200);
        return (e.message || "transaction reverted").slice(0, 200);
      }

      // -------- Actions: call service --------
      // ---- MetaMask pending tx guard ----
      // Returns true if safe to proceed, false if user chose to abort.
      async function checkNoPendingTx() {
        try {
          const pending   = await state.provider.send("eth_getTransactionCount", [state.address, "pending"]);
          const confirmed = await state.provider.send("eth_getTransactionCount", [state.address, "latest"]);
          const stuck = Number(pending) - Number(confirmed);
          if (stuck > 0) {
            toast({
              kind: "err",
              title: `⚠️ ${stuck} stuck transaction${stuck > 1 ? "s" : ""} in MetaMask`,
              detail: `New transactions will queue behind them and may hang.<br><strong>Fix:</strong> MetaMask &rarr; Activity &rarr; Speed Up or Cancel, or press the Reset button.`,
              timeout: 12000,
            });
            return window.confirm(
              "MetaMask has " + stuck + " unconfirmed transaction(s).\n" +
              "New transactions will queue and may appear stuck.\n\n" +
              "Fix: MetaMask \u2192 Activity \u2192 Speed Up or Cancel\n\n" +
              "Continue anyway?"
            );
          }
        } catch {}
        return true;
      }

      async function doCall() {
        // Network guard — reject if not on Arc Testnet
        if (state.chainId && state.chainId !== CONFIG.chainId) {
          toast({ kind: "err", title: "Wrong network", detail: `Switch to Arc Testnet (chain ID ${CONFIG.chainId}) to continue.`, timeout: 8000 });
          return;
        }
        const idStr = $("callProviderId").value.trim();
        const payload = $("callPayload").value;

        if (!idStr) {
          toast({ kind: "err", title: "Enter a provider ID" });
          return;
        }
        const providerId = BigInt(idStr);

        const btn = $("btnCall");
        if (btn.disabled) return;

        if (!await checkNoPendingTx()) return;

        setLoading(true);
        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = "Processing…";

        try {
          // Fetch SLA terms to know the price
          let p;
          try {
            p = await state.registry.getProvider(providerId);
          } catch (e) {
            console.warn("[REGISTRY FALLBACK] getProvider failed, using cached provider data", e);

            const fallbackProviders = window.__providers || [];
            p = fallbackProviders.find(
              x => BigInt(x.id) === providerId
            );

            if (!p) {
              throw e;
            }
          }
          if (!p.active) {
            toast({ kind: "err", title: "Provider is inactive" });
            throw new Error("provider inactive"); // use throw so finally runs
          }
          const price = p.pricePerCall;

          // Check session budget before proceeding
          const priceNum = parseFloat(ethers.formatUnits(price, state.usdcDecimals));
          if (!checkBudget(priceNum)) throw new Error("budget exceeded");
          // Approve only when needed — MaxUint256 = fires only once ever, no more double-TX
          const currentAllowance = await state.usdc.allowance(state.address, CONFIG.payPerCall);
          if (currentAllowance < price) {
            document.querySelectorAll(".toast.info").forEach(t => t.remove());
            const tA = toast({
              kind: "info",
              title: "Approving USDC…",
              detail: `<span class="spinner"></span> One-time approval — never asked again`,
              timeout: 60000,
            });
            let txA;
            try {
              txA = await state.usdc.approve(CONFIG.payPerCall, ethers.MaxUint256);
            } catch (approveErr) {
              tA.remove();
              throw approveErr;
            }
            await txA.wait();
            tA.remove();
            toast({ kind: "ok", title: "USDC approved ✓", detail: "Future calls go through in a single TX", link: txLink(txA.hash) });
          }

          // callService
          const requestHash = ethers.keccak256(ethers.toUtf8Bytes(payload));
          document.querySelectorAll(".toast.info").forEach(t => t.remove());
          const tC = toast({
            kind: "info",
            title: "Opening call…",
            detail: `<span class="spinner"></span> Waiting for MetaMask signature`,
            timeout: 60000,
          });
          console.log("CALL DEBUG", {
            providerId: providerId.toString(),
            requestHash,
            contract: CONFIG.payPerCall,
            account: state.address
          });

          const balance = await state.usdc.balanceOf(state.address);
          const allowance = await state.usdc.allowance(state.address, CONFIG.payPerCall);

          console.log("USDC DEBUG", {
            balance: ethers.formatUnits(balance, 6),
            allowance: ethers.formatUnits(allowance, 6)
          });

          let tx;
          try {
            tx = await state.payPerCall.callService(providerId, requestHash);
          } catch (callErr) {
            tC.remove();
            throw callErr;
          }
          const rc = await tx.wait();
          tC.remove();

          // Find CallStarted event to grab callId
          const parsed = rc.logs
            .map((l) => {
              try {
                return state.payPerCall.interface.parseLog(l);
              } catch {
                return null;
              }
            })
            .filter(Boolean)
            .find((x) => x.name === "CallStarted");

          if (parsed) {
            const callId = parsed.args.callId;
            toast({
              kind: "ok",
              title: "Call opened",
              detail: `call id ${short(callId, 8)}`,
              link: txLink(tx.hash),
            });
            pushActivity({
              type: "call",
              icon: "📞",
              label: `Call opened → provider #${providerId}`,
              detail: `${ethers.formatUnits(price, state.usdcDecimals)} USDC escrowed`,
              txHash: tx.hash,
            });
            // Auto-fill receipt/timeout fields for convenience
            $("rcpCallId").value = callId;
            $("toCallId").value = callId;
            // Record spend for session budget tracking
            recordSpend(priceNum);

            // Directly add to myCalls so "Your Calls" panel updates immediately
            // even if the event listener is slow or missed
            if (!state.myCalls.has(callId)) {
              const deadlineNum = Number(parsed.args.deadline);
              let startedAt = deadlineNum - Number(p.maxResponseTime || 60);
              let totalSec = Number(p.maxResponseTime || 60);
              try {
                const onChain = await state.payPerCall.getCall(callId);
                startedAt = Number(onChain.startedAt);
                totalSec = deadlineNum - startedAt;
              } catch {}
              state.myCalls.set(callId, {
                callId,
                providerId,
                caller: state.address,
                amount: price,
                deadline: deadlineNum,
                startedAt,
                totalSec,
                status: 1,
              });
              renderCalls();
            }
          }
          await refreshAll();
        } catch (e) {
          console.error(e);
          toast({ kind: "err", title: "Call failed", detail: friendlyError(e) });
        } finally {
          setLoading(false);
          btn.disabled = false;
          btn.textContent = origText;
        }
      }

      // -------- Actions: submit receipt --------
      async function doReceipt() {
        // Network guard — reject if not on Arc Testnet
        if (state.chainId && state.chainId !== CONFIG.chainId) {
          toast({ kind: "err", title: "Wrong network", detail: `Switch to Arc Testnet (chain ID ${CONFIG.chainId}) to continue.`, timeout: 8000 });
          return;
        }
        const callId = $("rcpCallId").value.trim();
        const payload = $("rcpPayload").value;

        if (!callId || callId.length !== 66) {
          toast({ kind: "err", title: "Enter a 32-byte call ID" });
          return;
        }

        const btn = $("btnReceipt");
        if (btn.disabled) return; // prevent double-click

        // Check signer matches before even trying
        if (state.providerInfo) {
          const registeredSigner = state.providerInfo.data.signer.toLowerCase();
          const connectedWallet = state.address.toLowerCase();
          if (registeredSigner !== connectedWallet) {
            toast({
              kind: "err",
              title: "Wrong wallet",
              detail: `Your provider's signer is ${short(state.providerInfo.data.signer, 8)} but you're connected as ${short(state.address, 8)}. Switch to the correct wallet to submit receipts.`,
              timeout: 10000,
            });
            return;
          }
        }

        // ⚠️ Check SLA time remaining before opening MetaMask
        const callObj = Array.from(state.myCalls.values()).find(c => c.callId === callId);
        if (callObj && callObj.deadline) {
          const secsRemaining = Math.round(callObj.deadline - Date.now() / 1000);
          if (secsRemaining <= 0) {
            toast({
              kind: "err",
              title: "SLA deadline already passed",
              detail: "This call has expired. Use 'Claim timeout' to get a refund.",
              timeout: 8000,
            });
            return; // safe: setLoading not yet called
          }
          if (secsRemaining <= 20) {
            toast({
              kind: "err",
              title: `🚨 Only ${secsRemaining}s left — too risky`,
              detail: "MetaMask needs ~10s to confirm. There is not enough time to safely submit this receipt.",
              timeout: 8000,
            });
            return; // safe: setLoading not yet called
          }
          if (secsRemaining <= 45) {
            const go = window.confirm(`⚠️ Only ${secsRemaining}s left on the SLA deadline.\n\nMetaMask needs ~10s to sign + confirm. This is tight — proceed only if you are quick.\n\nContinue?`);
            if (!go) return; // safe: setLoading not yet called
          }
        }

        if (!await checkNoPendingTx()) return;

        setLoading(true);
        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = "Processing…";

        try {
          const responseHash = ethers.keccak256(ethers.toUtf8Bytes(payload));

          // EIP-712 typed data signing — matches v2 PayPerCall contract.
          // Wallet will display structured Receipt fields (callId, responseHash)
          // instead of an opaque hex blob.
          const domain = {
            name: "CallGuard",
            version: "1",
            chainId: CONFIG.chainId,
            verifyingContract: CONFIG.payPerCall,
          };
          const types = {
            Receipt: [
              { name: "callId", type: "bytes32" },
              { name: "responseHash", type: "bytes32" },
            ],
          };
          const value = { callId, responseHash };

          document.querySelectorAll(".toast.info").forEach(t => t.remove());
          const tSign = toast({
            kind: "info",
            title: "Signing receipt…",
            detail: `<span class="spinner"></span> Sign in MetaMask`,
            timeout: 60000,
          });
          const signature = await state.signer.signTypedData(domain, types, value);
          tSign.remove();

          const tSub = toast({
            kind: "info",
            title: "Submitting receipt…",
            detail: `<span class="spinner"></span> Waiting for MetaMask signature`,
            timeout: 60000,
          });
          const tx = await state.payPerCall.submitReceipt(callId, responseHash, signature);
          await tx.wait();
          tSub.remove();
          toast({
            kind: "ok",
            title: "Receipt submitted",
            link: txLink(tx.hash),
            detail: "escrow released to provider",
          });
          pushActivity({
            type: "receipt",
            icon: "📝",
            label: "Receipt submitted",
            detail: `call ${short(callId, 6)} · escrow released`,
            txHash: tx.hash,
          });
          await refreshAll();
        } catch (e) {
          console.error(e);
          toast({ kind: "err", title: "Receipt failed", detail: friendlyError(e) });
        } finally {
          setLoading(false);
          btn.disabled = false;
          btn.textContent = origText;
        }
      }

      // -------- Actions: claim timeout --------
      async function doTimeout() {
        // Network guard — reject if not on Arc Testnet
        if (state.chainId && state.chainId !== CONFIG.chainId) {
          toast({ kind: "err", title: "Wrong network", detail: `Switch to Arc Testnet (chain ID ${CONFIG.chainId}) to continue.`, timeout: 8000 });
          return;
        }
        const callId = $("toCallId").value.trim();
        if (!callId || callId.length !== 66) {
          toast({ kind: "err", title: "Enter a 32-byte call ID" });
          return;
        }

        const btn = $("btnTimeout");
        if (btn.disabled) return;
        setLoading(true);
        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = "Processing…";

        try {
          document.querySelectorAll(".toast.info").forEach(t => t.remove());
          const tTO = toast({
            kind: "info",
            title: "Claiming timeout…",
            detail: `<span class="spinner"></span> Waiting for MetaMask signature`,
            timeout: 60000,
          });
          let tx;
          try {
            tx = await state.payPerCall.claimTimeout(callId);
          } catch (toErr) {
            tTO.remove();
            throw toErr;
          }
          await tx.wait();
          tTO.remove();
          toast({
            kind: "ok",
            title: "Timeout claimed — provider slashed",
            link: txLink(tx.hash),
          });
          pushActivity({
            type: "timeout",
            icon: "⚡",
            label: "Timeout claimed — provider slashed",
            detail: `call ${short(callId, 6)}`,
            txHash: tx.hash,
          });
          await refreshAll();
        } catch (e) {
          console.error(e);
          toast({ kind: "err", title: "Timeout failed", detail: friendlyError(e) });
        } finally {
          setLoading(false);
          btn.disabled = false;
          btn.textContent = origText;
        }
      }

      // ----------------------------------------------------------------
      // EVENT SUBSCRIPTION
      // Real-time contract event listeners.
      // stopEventListeners() is called before re-subscribing to avoid
      // duplicate handlers (memory leak prevention).
      // ----------------------------------------------------------------
      function subscribeToEvents() {
        // Guard: only subscribe if contracts are ready
        if (!state.payPerCall || !state.registry) return;

        let gotFirst = false;
        const clearEmpty = () => {
          if (gotFirst) return;
          gotFirst = true;
          $("feed").innerHTML = "";
        };

        const firstTime = (ev) => {
          const log = ev?.log ?? ev;
          if (!log?.transactionHash) return true;
          const key = `${log.transactionHash}:${log.index ?? log.logIndex ?? 0}`;
          if (state.seenEvents.has(key)) return false;
          state.seenEvents.add(key);
          return true;
        };

        // RPC event filters disabled.
      // Goldsky is used as the event indexer.
      console.log("[EVENTS] Goldsky mode active - RPC filters disabled");

      setInterval(async () => {
        try {
          await refreshAllProviders();
        } catch (e) {
          console.warn("[Goldsky refresh]", e.message);
        }
      }, 30000);
      }

      function addFeed({ tag, tagText, body, txHash }) {
        const row = document.createElement("div");
        row.className = "feed-row";
        const time = new Date().toLocaleTimeString("en-US", { hour12: false });
        row.innerHTML = `
          <span class="feed-time">${time}</span>
          <span class="feed-tag ${tag}">${tagText}</span>
          <span class="feed-body">${body}</span>
          ${txHash ? `<a class="feed-link" href="${txLink(txHash)}" target="_blank" rel="noreferrer" title="${txHash} — click to open in Arcscan">${short(txHash, 4)} ↗</a>` : ""}
        `;
        $("feed").prepend(row);
      }

      // Track which calls have already triggered deadline warnings to avoid repeat toasts
      const _warnedAt30 = new Set();
      const _warnedAt10 = new Set();

      function renderCalls() {
        const calls = Array.from(state.myCalls.values()).reverse();
        if (calls.length === 0) {
          $("callsBox").innerHTML = `<div class="empty-cta"><div class="ec-icon">📞</div><div class="ec-text">No calls yet.<br>Call a service to see the SLA lifecycle in action.</div><button class="ec-btn" id="ecCall">Call a service →</button></div>`;
          const ecc = document.getElementById("ecCall");
          if (ecc) ecc.addEventListener("click", () => { const a = $("actionCall"); if (a) { a.open = true; a.scrollIntoView({behavior:"smooth",block:"center"}); } });
          $("callsSummary").textContent = "";
          return;
        }

        const statusName = ["—", "pending", "completed", "slashed"];
        const statusClass = ["", "status-pending", "status-completed", "status-slashed"];
        const nowSec = Date.now() / 1000;

        $("callsBox").innerHTML = calls
          .map((c) => {
            const s = Number(c.status);
            const canSubmit = s === 1 && c.deadline > nowSec;
            const canTimeout = s === 1 && c.deadline <= nowSec;
            const secsLeft = c.deadline ? Math.round(c.deadline - nowSec) : null;

            // SLA progress bar — needs startedAt; fall back to deadline - maxResponseTime if not stored
            let barHtml = "";
            if (s === 1 && c.deadline && secsLeft !== null) {
              // Estimate total window: use provider's maxResponseTime if we stored it, else guess from deadline - startedAt
              const totalSec = c.totalSec || (c.startedAt ? c.deadline - c.startedAt : null);
              if (totalSec && totalSec > 0) {
                const pct = Math.max(0, Math.min(100, (secsLeft / totalSec) * 100));
                const barClass = pct > 40 ? "ok" : pct > 15 ? "warn" : "crit";
                barHtml = `
                  <div class="sla-bar-wrap">
                    <div class="sla-bar-track">
                      <div class="sla-bar-fill ${barClass}" style="width: ${pct.toFixed(1)}%"></div>
                    </div>
                  </div>`;
              }
            }

            // Countdown label
            let countdownHtml = "";
            if (s === 1 && c.deadline) {
              if (secsLeft <= 0) {
                countdownHtml = ` · <span class="countdown expired">expired</span>`;
              } else {
                const mm = String(Math.floor(secsLeft / 60)).padStart(2, "0");
                const ss = String(secsLeft % 60).padStart(2, "0");
                const cls = secsLeft > 30 ? "" : secsLeft > 10 ? "warn" : "urgent";
                const icon = secsLeft > 30 ? "⏱" : secsLeft > 10 ? "⚠️" : "🚨";
                countdownHtml = ` · <span class="countdown ${cls}">${icon} ${mm}:${ss}</span>`;

                // Trigger warning toasts
                if (secsLeft <= 30 && secsLeft > 10 && !_warnedAt30.has(c.callId)) {
                  _warnedAt30.add(c.callId);
                  toast({
                    kind: "info",
                    title: "⚠️ SLA deadline approaching",
                    detail: `call ${short(c.callId, 6)} · ${secsLeft}s left — sign receipt now`,
                    timeout: 8000,
                  });
                }
                if (secsLeft <= 10 && !_warnedAt10.has(c.callId)) {
                  _warnedAt10.add(c.callId);
                  toast({
                    kind: "err",
                    title: "🚨 Last 10 seconds!",
                    detail: `call ${short(c.callId, 6)} · deadline expiring!`,
                    timeout: 12000,
                  });
                }
              }
            } else if (s !== 1 && c.deadline) {
              countdownHtml = ` · ${new Date(c.deadline * 1000).toLocaleTimeString("en-US", { hour12: false })}`;
            }

            return `
              <div class="call-row" data-callid="${c.callId}">
                <div style="min-width: 0; flex: 1">
                  <div class="head-line">
                    <span class="status-dot ${statusClass[s]}"></span>
                    <span>call ${short(c.callId, 6)}</span>
                    <span style="color: var(--text-faint)">· provider #${c.providerId} · ${ethers.formatUnits(c.amount, state.usdcDecimals)} USDC</span>
                  </div>
                  <div class="sub-line">
                    ${statusName[s]}${countdownHtml}
                  </div>
                  ${barHtml}
                </div>
                <div style="display: flex; gap: 6px">
                  <button class="btn btn-sm" data-action="copy-id" data-callid="${c.callId}" title="Copy call ID">⎘ ID</button>
                  ${canSubmit ? `<button class="btn btn-sm" data-action="fill-receipt" data-callid="${c.callId}">receipt</button>` : ""}
                  ${canTimeout ? `<button class="btn btn-sm btn-danger" data-action="fill-timeout" data-callid="${c.callId}">claim slash</button>` : ""}
                </div>
              </div>
            `;
          })
          .join("");

        $("callsSummary").textContent = `${calls.length} total · ${calls.filter((c) => c.status === 1).length} pending`;

        // Hook up action buttons
        $("callsBox")
          .querySelectorAll("button[data-action]")
          .forEach((b) => {
            b.addEventListener("click", () => {
              const a = b.dataset.action;
              const id = b.dataset.callid;
              if (a === "copy-id") {
                navigator.clipboard.writeText(id).then(() => {
                  toast({ kind: "ok", title: "Call ID copied", timeout: 2000 });
                });
              } else if (a === "fill-receipt") {
                $("rcpCallId").value = id;
                $("actionReceipt").open = true;
                $("rcpPayload").focus();
              } else if (a === "fill-timeout") {
                $("toCallId").value = id;
                doTimeout();
              }
            });
          });
      }

      // Update call countdowns every second
      setInterval(() => {
        if (state.myCalls.size > 0) renderCalls();
      }, 1000);

      // Auto-refresh leaderboard + network stats every 30 seconds
      setInterval(() => {
        if (state.address) {
          refreshLeaderboard().catch(() => {});
          refreshNetworkStats().catch(() => {});
        }
      }, 30_000);

      // -------- Provider preview on ID change --------
      $("callProviderId").addEventListener("blur", async (ev) => {
        const idStr = ev.target.value.trim();
        if (!idStr || !state.registry) {
          $("callProviderHint").textContent = "Enter a provider id to fetch SLA terms.";
          return;
        }
        try {
          const p = await state.registry.getProvider(BigInt(idStr));
          if (p.owner === ethers.ZeroAddress) {
            $("callProviderHint").textContent = `no provider with id ${idStr}`;
            $("callerRiskBox").style.display = "none";
          const _cp = $("callPreview"); if (_cp) cp.style.display = "none";
            return;
          }
          const d = state.usdcDecimals;
          const price = ethers.formatUnits(p.pricePerCall, d);
          const slashPct = Number(p.slashBps) / 100;
          const slaSeconds = Number(p.maxResponseTime);
          let slaNote = "";
          if (slaSeconds <= 30) {
            slaNote = ` <span style="color: var(--danger); font-weight: 600;">⚠ tight SLA — receipts may fail</span>`;
          } else if (slaSeconds <= 60) {
            slaNote = ` <span style="color: var(--warn); font-weight: 600;">⚠ short SLA — be quick</span>`;
          }
          $("callProviderHint").innerHTML =
            `${p.active ? "active" : "INACTIVE"} · price ${price} USDC · SLA ${slaSeconds}s · slash ${slashPct}%${slaNote}`;
          // Populate risk box
          const stakeNum = parseFloat(ethers.formatUnits(p.stake, d));
          const priceNum = parseFloat(price);
          const slashAmount = (stakeNum * slashPct / 100).toFixed(4);
          let rep = 66;
          try { rep = Number(await state.registry.getReputationScore(BigInt(idStr))); } catch {}
          $("crCost").textContent = `${price} USDC`;
          $("crRefund").textContent = `${price} USDC`;
          $("crSlash").textContent = `+${slashAmount} USDC`;
          $("crSla").textContent = `${p.maxResponseTime}s`;
          const repColor = rep >= 80 ? "var(--accent)" : rep >= 50 ? "var(--warn)" : "var(--danger)";
          $("crRep").textContent = `${rep}/100`;
          $("crRep").style.color = repColor;
          $("callerRiskBox").style.display = "block";
          // Plain-language preview
          const preview = $("callPreview");
          const previewText = $("callPreviewText");
          if (preview && previewText) {
            previewText.innerHTML = `You'll approve and pay <strong>${price} USDC</strong>. The provider has <strong>${p.maxResponseTime}s</strong> to respond with a signed receipt. If they miss the deadline, you can claim a refund of <strong>${price} USDC</strong> plus a <strong>${slashAmount} USDC</strong> bonus from their stake.`;
            preview.style.display = "block";
          }
        } catch (e) {
          $("callProviderHint").textContent = "could not fetch provider info";
          $("callerRiskBox").style.display = "none";
          const _cp = $("callPreview"); if (_cp) cp.style.display = "none";
        }
      });

      // -------- Wire up static links --------
      $("registryLink").href = addrLink(CONFIG.registry);
      $("registryLink").textContent = CONFIG.registry;
      $("payPerCallLink").href = addrLink(CONFIG.payPerCall);
      $("payPerCallLink").textContent = CONFIG.payPerCall;
      $("usdcLink").href = addrLink(CONFIG.usdc);
      $("usdcLink").textContent = CONFIG.usdc;

      // -------- Click-to-copy address pill --------
      $("addrPill").addEventListener("click", async () => {
        await navigator.clipboard.writeText(state.address);
        toast({ kind: "ok", title: "Address copied", timeout: 2000 });
      });

      // -------- MetaMask Reset button --------
      $("btnResetMM").addEventListener("click", async () => {
        let stuckCount = 0;
        try {
          const p = await state.provider.send("eth_getTransactionCount", [state.address, "pending"]);
          const c = await state.provider.send("eth_getTransactionCount", [state.address, "latest"]);
          stuckCount = Math.max(0, Number(p) - Number(c));
        } catch {}

        const msg = stuckCount > 0
          ? "MetaMask has " + stuckCount + " stuck transaction(s) detected.\n\n" +
            "Reset Account will:\n" +
            "✓ Leave your funds and wallet untouched\n" +
            "✓ Clear only pending / stuck transactions\n\n" +
            "To do it: MetaMask → Settings → Advanced → Reset Account\n\n" +
            "Reload the page now?"
          : "No stuck transactions detected. Reload the page anyway?";

        if (confirm(msg)) {
          document.querySelectorAll(".toast").forEach(t => t.remove());
          setLoading(false);
          location.reload();
        }
      });

      // -------- Auto-router --------
      async function doRouter() {
        const maxPrice = parseFloat($("routerMaxPrice").value || "999999");
        const minRep = parseInt($("routerMinRep").value || "0", 10);
        const resultEl = $("routerResult");
        resultEl.style.display = "none";

        const candidates = (state.allProviders || []).filter(p => {
          if (!p.active) return false;
          const price = parseFloat(ethers.formatUnits(p.pricePerCall, state.usdcDecimals));
          if (price > maxPrice) return false;
          if ((p.reputation ?? 0) < minRep) return false;
          return true;
        });

        if (candidates.length === 0) {
          resultEl.style.display = "block";
          resultEl.style.background = "var(--danger-bg)";
          resultEl.style.border = "1px solid rgba(220,38,38,0.25)";
          resultEl.innerHTML = "No providers match your filters. Try relaxing the price or reputation constraints.";
          return;
        }

        const sorted = candidates.sort((a, b) => {
          const repDiff = (b.reputation ?? 0) - (a.reputation ?? 0);
          if (repDiff !== 0) return repDiff;
          return Number(a.pricePerCall - b.pricePerCall);
        });
        const best = sorted[0];
        const top3 = sorted.slice(0, 3);
        resultEl.style.display = "block";
        resultEl.style.background = "var(--accent-bg)";
        resultEl.style.border = "1px solid rgba(5,150,105,0.2)";
        resultEl.innerHTML = "<div style=\"font-size:13px;font-weight:500;color:var(--accent);margin-bottom:8px\">✓ Best match found</div><div id=\"routerTop3\"></div><div style=\"display:flex;gap:8px\"><button class=\"btn btn-sm btn-primary\" id=\"btnRouterUse\">Use Provider #" + best.id + " →</button><button class=\"btn btn-sm\" id=\"btnRouterAutoCall\">⚡ Auto-call best</button></div>";
        const top3El = document.getElementById("routerTop3");
        if (top3El) top3El.innerHTML = top3.map((p,i) => "<div style=\"display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--bg-1);border-radius:6px;border:1px solid " + (i===0?"var(--accent)":"var(--border)") + ";margin-bottom:6px\">" + (i===0?"🥇":i===1?"🥈":"🥉") + " <strong>Provider #" + p.id + "</strong><span style=\"font-size:11px;color:var(--text-dim)\">Rep: " + p.reputation + " · " + ethers.formatUnits(p.pricePerCall, state.usdcDecimals) + " USDC · " + p.maxResponseTime + "s</span></div>").join("");
        document.getElementById("btnRouterUse")?.addEventListener("click", () => { $("callProviderId").value = best.id.toString(); $("callProviderId").dispatchEvent(new Event("blur")); $("actionCall").open = true; $("actionRouter").open = false; });
        document.getElementById("btnRouterAutoCall")?.addEventListener("click", async () => { $("callProviderId").value = best.id.toString(); $("callProviderId").dispatchEvent(new Event("blur")); await new Promise(r => setTimeout(r,500)); $("btnX402Call").click(); });
      }

      // -------- Multi-provider call --------
      async function doMultiCall() {
        const inputs = document.querySelectorAll(".multi-pid");
        const ids = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
        const payload = $("multiPayload").value;
        const resultsEl = $("multiCallResults");
        resultsEl.innerHTML = "";

        if (ids.length === 0) {
          toast({ kind: "err", title: "Enter at least one provider ID" });
          return;
        }
        if (ids.length > 3) {
          toast({ kind: "err", title: "Max 3 providers for multi-call" });
          return;
        }

        const btn = $("btnMultiCall");
        setLoading(true);
        btn.disabled = true;
        const orig = btn.textContent;

        const requestHash = ethers.keccak256(ethers.toUtf8Bytes(payload));

        // ✅ Pre-check: approve USDC once for all calls before any MetaMask signing
        try {
          btn.textContent = "Checking allowance…";
          // Fetch all prices first
          const providerData = [];
          for (const idStr of ids) {
            try {
              const p = await state.registry.getProvider(BigInt(idStr));
              providerData.push({ idStr, p });
            } catch { providerData.push({ idStr, p: null }); }
          }

          // Total needed
          const totalNeeded = providerData.reduce((acc, { p }) => p && p.active ? acc + p.pricePerCall : acc, 0n);
          if (totalNeeded > 0n) {
            const allowance = await state.usdc.allowance(state.address, CONFIG.payPerCall);
            if (allowance < totalNeeded) {
              btn.textContent = "Approve USDC (1/1)…";
              toast({ kind: "info", title: "Approving USDC for all calls…", detail: "<span class='spinner'></span> one approval for all providers", timeout: 0 });
              const txA = await state.usdc.approve(CONFIG.payPerCall, totalNeeded);
              await txA.wait();
              // Remove approval toast
              document.querySelectorAll(".toast.info").forEach(t => t.remove());
              toast({ kind: "ok", title: "USDC approved", timeout: 3000 });
            }
          }

          // ✅ Now call providers ONE BY ONE (sequential, not parallel)
          // This way MetaMask shows one popup at a time
          for (let i = 0; i < providerData.length; i++) {
            const { idStr, p } = providerData[i];

            const row = document.createElement("div");
            row.style.cssText = "padding:8px 12px;background:var(--bg-2);border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:var(--font-mono)";
            row.textContent = `Provider #${idStr} — waiting…`;
            resultsEl.appendChild(row);

            if (!p || !p.active) {
              row.textContent = `#${idStr} — inactive, skipped`;
              continue;
            }

            btn.textContent = `Opening call ${i + 1} of ${providerData.length}… (confirm in MetaMask)`;

            try {
              // ✅ await each tx fully before moving to the next
              const tx = await state.payPerCall.callService(BigInt(idStr), requestHash);
              row.textContent = `#${idStr} — confirming…`;
              const rc = await tx.wait();
              const parsed = rc.logs
                .map(l => { try { return state.payPerCall.interface.parseLog(l); } catch { return null; } })
                .filter(Boolean)
                .find(x => x.name === "CallStarted");
              if (parsed) {
                row.innerHTML = `#${idStr} — <span style="color:var(--accent)">✓ opened</span> · call ${short(parsed.args.callId, 6)} · <a href="${txLink(tx.hash)}" target="_blank" style="color:var(--accent)">${short(tx.hash, 6)} ↗</a>`;
              }
            } catch(e) {
              row.innerHTML = `#${idStr} — <span style="color:var(--danger)">✗ ${friendlyError(e)}</span>`;
            }
          }
        } catch(e) {
          toast({ kind: "err", title: "Multi-call failed", detail: friendlyError(e) });
        }

        setLoading(false);
        btn.disabled = false;
        btn.textContent = orig;
        await refreshAll();
      }

      // -------- Multicall3From — Arc native batch call --------
      async function doMultiCallNative() {
        const inputs = document.querySelectorAll(".multi-pid");
        const ids = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
        const payload = $("multiPayload").value || "ping";
        const resultsEl = $("multiCallResults");
        resultsEl.innerHTML = "";

        if (ids.length === 0) return toast({ kind:"err", title:"Enter at least one provider ID" });
        if (ids.length > 3) return toast({ kind:"err", title:"Max 3 providers" });

        const btn = $("btnMultiCallNative");
        btn.disabled = true;
        const orig = btn.textContent;
        btn.textContent = "Preparing…";

        try {
          const requestHash = ethers.keccak256(ethers.toUtf8Bytes(payload));
          const MULTICALL3FROM = CONFIG.multicall3From;

          const multicallAbi = [
            "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) returns ((bool success, bytes returnData)[] results)"
          ];
          const multicall = new ethers.Contract(MULTICALL3FROM, multicallAbi, state.signer);
          const payPerCallIface = new ethers.Interface([
            "function callService(uint256 providerId, bytes32 requestHash) returns (bytes32 callId)"
          ]);

          // Build calls
          const calls = ids.map(idStr => ({
            target: CONFIG.payPerCall,
            allowFailure: true,
            callData: payPerCallIface.encodeFunctionData("callService", [BigInt(idStr), requestHash])
          }));

          // Check + approve USDC
          const providerData = await Promise.all(ids.map(id => state.registry.getProvider(BigInt(id)).catch(() => null)));
          const total = providerData.reduce((acc, p) => p && p.active ? acc + p.pricePerCall : acc, 0n);
          if (total > 0n) {
            const allowance = await state.usdc.allowance(state.address, MULTICALL3FROM);
            if (allowance < total) {
              btn.textContent = "Approve USDC…";
              const txA = await state.usdc.approve(MULTICALL3FROM, total);
              await txA.wait();
            }
          }

          btn.textContent = "Sign batch tx…";
          const tx = await multicall.aggregate3(calls);
          btn.textContent = "Confirming…";
          const rc = await tx.wait();

          resultsEl.innerHTML = `<div style="padding:10px;background:var(--accent-bg);border-radius:6px;font-size:12px">
            ✓ Multicall3From batch settled in <strong>1 transaction</strong><br>
            ${ids.map((id,i) => `Provider #${id}: ${rc.status === 1 ? "✅ called" : "❌ failed"}`).join("<br>")}
            <br><a href="${txLink(tx.hash)}" target="_blank" style="color:var(--accent)">${short(tx.hash,8)} ↗</a>
          </div>`;

          toast({ kind:"ok", title:"Batch call complete!", detail:`${ids.length} providers in 1 tx`, timeout:6000 });
          addFeed({ tag:"started", tagText:"batch", body:`⚡ Multicall3From: ${ids.length} providers in 1 tx`, txHash: tx.hash });
        } catch(e) {
          toast({ kind:"err", title:"Multicall3From failed", detail: friendlyError(e) });
        }

        btn.disabled = false;
        btn.textContent = orig;
        await refreshAll();
      }

      // -------- Session budget (in-memory, no localStorage) --------
      let sessionBudget = { limit: 0, spent: 0 };

      function updateBudgetDisplay() {
        const disp = $("budgetDisplay");
        if (!disp) return;
        if (sessionBudget.limit <= 0) { disp.style.display = "none"; return; }
        disp.style.display = "block";
        $("budgetSpentLabel").textContent = `${sessionBudget.spent.toFixed(4)} / ${sessionBudget.limit.toFixed(2)} USDC`;
        const pct = Math.min(100, (sessionBudget.spent / sessionBudget.limit) * 100);
        const fill = $("budgetBarFill");
        fill.style.width = pct.toFixed(1) + "%";
        fill.className = "budget-bar-fill" + (pct > 90 ? " crit" : pct > 70 ? " warn" : "");
      }

      function checkBudget(amountUsdc) {
        if (sessionBudget.limit <= 0) return true; // no limit
        if (sessionBudget.spent + amountUsdc > sessionBudget.limit) {
          toast({ kind: "err", title: "Budget limit reached", detail: `You have spent ${sessionBudget.spent.toFixed(4)} USDC of your ${sessionBudget.limit} USDC session limit.`, timeout: 8000 });
          return false;
        }
        return true;
      }

      function recordSpend(amountUsdc) {
        sessionBudget.spent += amountUsdc;
        updateBudgetDisplay();
      }

      // -------- Button wiring --------
      $("connectBtn").addEventListener("click", connect);
      document.getElementById("connectBtn2")?.addEventListener("click", connect);
      
      $("btnRegister").addEventListener("click", doRegister);
      $("btnRegisterV2").addEventListener("click", doRegisterV2);
      $("btnX402Call").addEventListener("click", doX402Call);

      // ---- Nanopayment ----
      let _nanoCallCount = 0;

      async function fetchNanoBalance() {
        try {
          const res = await fetch(CONFIG.facilitatorUrl + "/nano/balance");
          const data = await res.json();
          if ($("nanoBalance")) $("nanoBalance").textContent = parseFloat(data.balance || 0).toFixed(4) + " USDC";
          if ($("nanoPending")) {
            const p = parseFloat(data.pendingBatch || 0);
            $("nanoPending").textContent = p > 0 ? p.toFixed(4) + " USDC" : "0 USDC";
          }
        } catch(e) {
          if ($("nanoBalance")) $("nanoBalance").textContent = "—";
        }
      }

      async function doNanoCall(providerId = null) {
        const btn = providerId
          ? document.querySelector(`[data-nano-provider="${providerId}"]`)
          : $("btnNanoCall");

        const out = $("nanoOutput");
        if (btn && btn.disabled) return;

        if (btn) {
          btn.disabled = true;
          btn.dataset.origText = btn.textContent;
          btn.textContent = "Paying…";
        }

        if (out) out.textContent = "Calling facilitator…";

        try {
          const res = await fetch(CONFIG.facilitatorUrl + "/nano/call", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              providerId: providerId ? String(providerId) : null,
              amount: "0.001"
            })
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || "HTTP " + res.status);
          }

          const amount = data.amount || "0.001";

          _nanoCallCount++;
          if ($("nanoCallCount")) $("nanoCallCount").textContent = _nanoCallCount;

          if (out) {
            out.textContent =
              "✅ Paid: " + amount + " USDC\n" +
              (providerId ? "Provider #" + providerId + "\n" : "") +
              "Facilitator settled via Circle Gateway.\n" +
              "Batch pending on-chain settlement.";
          }

          toast({
            kind: "ok",
            title: "Nanopayment successful!",
            detail: `${amount} USDC${providerId ? " → Provider #" + providerId : ""}`,
            timeout: 5000
          });

          pushActivity({
            type: "nanopay",
            icon: "⚡",
            label: providerId ? `Nanopay settled → provider #${providerId}` : "Nanopay settled",
            detail: `${amount} USDC · Circle Gateway`,
            txHash: data.txHash || null
          });

          if ($("feed")) {
            addFeed({
              tag: "nanopay",
              tagText: "nanopay",
              txHash: data.txHash || null,
              body: `⚡ Nanopay settled: <span class="hi">${amount} USDC</span>${providerId ? ` → provider #${providerId}` : ""}`
            });
          }

          setTimeout(fetchNanoBalance, 2000);

          if (btn) {
            btn.textContent = "Paid ✓";
            setTimeout(() => {
              btn.textContent = btn.dataset.origText || "⚡ Nanopay 0.001";
            }, 1800);
          }
        } catch (e) {
          if (out) out.textContent = "❌ " + e.message;

          toast({
            kind: "err",
            title: "Nanopayment failed",
            detail: e.message,
            timeout: 5000
          });

          if ($("feed")) {
            addFeed({
              tag: "slashed",
              tagText: "nano fail",
              txHash: null,
              body: `Nanopay failed${providerId ? ` → provider #${providerId}` : ""}: <span class="hi">${e.message}</span>`
            });
          }
        } finally {
          if (btn) {
            btn.disabled = false;
            if (btn.textContent === "Paying…") {
              btn.textContent = btn.dataset.origText || "⚡ Nanopay 0.001";
            }
          }
        }
      }

      // ---- Mobile sidebar ----
      const hamburgerBtn = document.getElementById("hamburgerBtn");
      const sidebarOverlay = document.getElementById("sidebarOverlay");
      const appSidebar = document.getElementById("appSidebar");
      if (hamburgerBtn) {
        hamburgerBtn.addEventListener("click", () => {
          appSidebar.classList.toggle("open");
          sidebarOverlay.classList.toggle("open");
        });
        sidebarOverlay.addEventListener("click", () => {
          appSidebar.classList.remove("open");
          sidebarOverlay.classList.remove("open");
        });
      }

      // ---- Analytics ----
      async function loadAnalytics() {
        try {
          const res = await fetch(CONFIG.subgraphUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: `{
              providers(first: 1000) {
                id
                completedCalls
                slashedCalls
                stake
                pricePerCall
                active
              }
              calls: calls(first: 1000, orderBy: createdAt, orderDirection: desc) { 
                id 
                providerId 
                amount 
                createdAt
                status
              }
            }` })
          });
          const data = await res.json();
          const providers = data.data?.providers || [];
          const calls = data.data?.calls || [];
          const completed = calls.filter(c => c.status === "COMPLETED");
          const slashed = calls.filter(c => c.status === "SLASHED");

          const active = providers.filter(p => p.active).length;
          const totalCompleted = providers.reduce((a,p) => a + Number(p.completedCalls||0), 0);
          const totalSlashed = providers.reduce((a,p) => a + Number(p.slashedCalls||0), 0);
          const totalClosed = totalCompleted + totalSlashed;
          const honorRate = totalClosed > 0 ? Math.round(totalCompleted/totalClosed*100) : 100;
          const avgPrice = providers.length > 0 ? providers.reduce((a,p) => a + Number(p.pricePerCall||0), 0) / providers.length / 1e6 : 0;

          if ($("anTotalCalls")) $("anTotalCalls").textContent = calls.length + "+";
          if ($("anHonorRate")) $("anHonorRate").textContent = honorRate + "%";
          if ($("anActiveProviders")) $("anActiveProviders").textContent = active;
          if ($("anAvgPrice")) $("anAvgPrice").textContent = avgPrice.toFixed(3) + " USDC";

          // Provider bars
          const topProviders = providers
            .map(p => ({ id: p.id, total: Number(p.completedCalls||0) + Number(p.slashedCalls||0), completed: Number(p.completedCalls||0), slashed: Number(p.slashedCalls||0) }))
            .filter(p => p.total > 0)
            .sort((a,b) => b.total - a.total)
            .slice(0, 8);

          const maxTotal = topProviders[0]?.total || 1;
          const barsEl = $("anProviderBars");
          if (barsEl) {
            barsEl.innerHTML = topProviders.map(p => {
              const pct = Math.round(p.total / maxTotal * 100);
              const honor = p.total > 0 ? Math.round(p.completed/p.total*100) : 100;
              const barColor = honor >= 80 ? "var(--accent)" : honor >= 50 ? "var(--warn)" : "var(--danger)";
              return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px">
                <span style="width:40px;color:var(--text-faint)">#${p.id}</span>
                <div style="flex:1;background:var(--bg-2);border-radius:4px;height:20px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width .3s"></div>
                </div>
                <span style="width:60px;color:var(--text-faint);${honor<50?'color:var(--danger)':''}">${p.total} calls</span>
                <span style="width:40px;color:${barColor}">${honor}%</span>
              </div>`;
            }).join("") || '<div class="empty-state" style="font-size:12px">No call data yet</div>';
          }

          // Recent calls
          const recentEl = $("anRecentCalls");
          if (recentEl) {
            recentEl.innerHTML = calls.slice(0, 10).map(c => {
              const date = new Date(Number(c.timestamp) * 1000).toLocaleString();
              return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px">
                <span style="color:var(--text-faint);font-family:var(--font-mono)">#${c.providerId}</span>
                <span style="color:var(--text-faint)">${(Number(c.amount)/1e6).toFixed(3)} USDC</span>
                <span style="margin-left:auto;color:var(--text-faint)">${date}</span>
              </div>`;
            }).join("") || '<div class="empty-state" style="font-size:12px">No recent calls</div>';
          }
        } catch(e) {
          console.warn("[analytics] Failed:", e.message);
        }
      }

      // ---- Band Oracle price feed ----
      let _usdcUsdRate = 1.0;
      async function fetchUsdcUsdRate() {
        try {
          const oracle = new ethers.Contract(
            CONFIG.bandOracle,
            ["function getReferenceData(string base, string quote) view returns (uint256 rate, uint256 lastUpdatedBase, uint256 lastUpdatedQuote)"],
            state.provider || (state.provider = new ethers.BrowserProvider(window.ethereum))
          );
          const [rate] = await oracle.getReferenceData("USDC", "USD");
          _usdcUsdRate = parseFloat(ethers.formatUnits(rate, 18));
          console.log("[oracle] USDC/USD:", _usdcUsdRate);
        } catch(e) {
          console.warn("[oracle] Failed:", e.message);
        }
      }
      // Fetch only after wallet connect (needs provider)
      // fetchUsdcUsdRate called in refreshAll()

      function usdPrice(usdc) {
        return (parseFloat(usdc) * _usdcUsdRate).toFixed(4);
      }

      // ---- Sidebar navigation ----
      function showCategory(cat) {
        // Tüm panelleri gizle
        document.querySelectorAll("[data-category]").forEach(el => {
          el.classList.remove("cat-visible");
          el.style.display = "none";
        });
        // Seçili kategorinin panellerini göster
        document.querySelectorAll("[data-category]").forEach(el => {
          const cats = el.getAttribute("data-category").split(" ");
          if (cats.includes(cat)) {
            el.style.display = "";
            el.classList.add("cat-visible");
          }
        });
        // Sidebar item'ları güncelle
        document.querySelectorAll(".sb-item").forEach(el => {
          el.classList.toggle("on", el.dataset.nav === cat);
        });
        // Aktif kategoriyi kaydet
        window._activeCat = cat;
        // Analytics paneli açıldığında yükle
        if (cat === "analytics") loadAnalytics();
      }

      // Sidebar click handlers
      document.querySelectorAll(".sb-item").forEach(el => {
        el.addEventListener("click", () => {
          showCategory(el.dataset.nav);
        });
      });

      // Başlangıçta overview göster
      showCategory("overview");

      $("btnNanoCall").addEventListener("click", () => doNanoCall());

      // MCP copy buttons
      document.getElementById("btnCopyMcpClone")?.addEventListener("click", () => {
        navigator.clipboard.writeText("git clone https://github.com/muazzezwq/callguard.git\ncd callguard/x402-facilitator\nnpm install");
        toast({ kind: "ok", title: "Copied!", timeout: 2000 });
      });
      document.getElementById("btnCopyMcpConfig")?.addEventListener("click", () => {
        const config = JSON.stringify({ mcpServers: { callguard: { command: "node", args: ["/path/to/callguard/x402-facilitator/mcp-server.js"] } } }, null, 2);
        navigator.clipboard.writeText(config);
        toast({ kind: "ok", title: "Copied!", timeout: 2000 });
      });
      document.getElementById("btnCopyMcpTest")?.addEventListener("click", () => {
        navigator.clipboard.writeText(`echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node mcp-server.js`);
        toast({ kind: "ok", title: "Copied!", timeout: 2000 });
      });
      document.getElementById("btnCopyMcpRemote")?.addEventListener("click", () => {
        const config = JSON.stringify({ mcpServers: { callguard: { type: "sse", url: "https://arcsla-eu.onrender.com/sse" } } }, null, 2);
        navigator.clipboard.writeText(config);
        toast({ kind: "ok", title: "Copied!", timeout: 2000 });
      });

      document.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-nano-provider]");
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        doNanoCall(btn.dataset.nanoProvider);
      });

      $("btnNanoRefresh").addEventListener("click", () => {
        fetchNanoBalance();
        toast({ kind: "ok", title: "Balance refreshed", timeout: 2000 });
      });
      // Sayfa açılışında bakiye çek
      fetchNanoBalance();

      // ERC-8183 Jobs
      $("btnCreateJob").addEventListener("click", doCreateJob);
      $("btnJobSetBudget").addEventListener("click", doSetBudget);
      $("btnFundJob").addEventListener("click", doFundJob);
      $("btnSubmitJob").addEventListener("click", doSubmitJob);
      $("btnCompleteJob").addEventListener("click", doCompleteJob);
      $("btnCheckJob").addEventListener("click", doCheckJob);
      $("btnLoadMyJobs").addEventListener("click", loadMyJobs);
      $("btnCall").addEventListener("click", () => {
        const chain = document.getElementById("sourceChainSelect")?.value || "arc";
        if (chain === "arc") doCall(); else doCCTPCall();
      });
      // btnCall routed above
      $("btnReceipt").addEventListener("click", doReceipt);

      // Router
      $("btnRouter").addEventListener("click", doRouter);

      // Multi-call
      $("btnMultiCall").addEventListener("click", doMultiCall);
      $("btnMultiCallNative").addEventListener("click", doMultiCallNative);
      $("btnAddProvider").addEventListener("click", () => {
        const container = $("multiProviderIds");
        const existing = container.querySelectorAll(".multi-pid").length;
        if (existing >= 3) { toast({ kind: "err", title: "Max 3 providers" }); return; }
        const row = document.createElement("div");
        row.className = "multi-row";
        row.innerHTML = `<input type="text" class="multi-pid" placeholder="Provider ID ${existing+1}" /><button class="btn btn-sm btn-danger multi-remove">−</button>`;
        row.querySelector(".multi-remove").addEventListener("click", () => row.remove());
        container.appendChild(row);
      });

      // Budget
      $("btnSetBudget").addEventListener("click", () => {
        const v = parseFloat($("budgetLimit").value);
        if (isNaN(v) || v <= 0) { toast({ kind: "err", title: "Enter a valid USDC amount" }); return; }
        sessionBudget = { limit: v, spent: sessionBudget.spent };
        updateBudgetDisplay();
        toast({ kind: "ok", title: `Budget set to ${v} USDC`, timeout: 3000 });
      });
      $("btnClearBudget").addEventListener("click", () => {
        sessionBudget = { limit: 0, spent: 0 };
        updateBudgetDisplay();
        $("budgetLimit").value = "";
        toast({ kind: "ok", title: "Budget cleared", timeout: 2000 });
      });

      // SDK copy
      $("btnCopySdk").addEventListener("click", () => {
        const code = `import { ethers } from "ethers";
const provider = new ethers.BrowserProvider(window.ethereum);
const wallet   = await provider.getSigner();
const usdc     = new ethers.Contract("0x3600000000000000000000000000000000000000", ["function approve(address,uint256) returns(bool)"], wallet);
const arc      = new ethers.Contract("0x10387347678d9f7106D5625bE0BD6C915158B130", ["function callService(uint256,bytes32) returns(bytes32)"], wallet);
await usdc.approve(arc.target, ethers.parseUnits("1", 6));
const requestHash = ethers.keccak256(ethers.toUtf8Bytes("summarize this document"));
const tx = await arc.callService(1, requestHash);
console.log("call opened:", tx.hash);`;
        navigator.clipboard.writeText(code).then(() => toast({ kind: "ok", title: "SDK snippet copied!", timeout: 2000 }));
      });

      // Warn if user pastes something into Call ID that looks wrong
      $("rcpCallId").addEventListener("input", () => {
        const val = $("rcpCallId").value.trim();
        const hint = $("rcpCallId").closest(".field").querySelector(".hint");
        if (val.length === 66 && !/^0x[0-9a-fA-F]{64}$/.test(val)) {
          if (hint) hint.style.color = "var(--danger)";
          if (hint) hint.textContent = "⚠️ This doesn't look like a valid call ID. Call IDs are auto-filled after you click \"Approve & call\".";
        } else if (val.length > 0 && val.length < 66) {
          if (hint) hint.style.color = "var(--warn)";
          if (hint) hint.textContent = "⚠️ Call ID should be 66 characters (0x + 64 hex). Wait for auto-fill after \"Approve & call\".";
        } else {
          if (hint) hint.style.color = "";
          if (hint) hint.textContent = "This is filled automatically after you click \"Approve & call\" above. Do not paste a private key here.";
        }
      });
      $("btnTimeout").addEventListener("click", doTimeout);
      $("btnRefreshProvider").addEventListener("click", refreshAll);

      // -------- Register form: live calculator --------
      function updateCalculator() {
        const stake = parseFloat($("regStake").value || "10") || 0;
        const price = parseFloat($("regPrice").value || "1") || 0;
        const slashPct = parseFloat($("regSlashPct").value || "20") || 0;

        const lossPerSlash = (stake * slashPct) / 100;
        const maxSlashes = lossPerSlash > 0 ? Math.floor(stake / lossPerSlash) : 0;
        const revenue10 = price * 10;
        const breakeven = price > 0 ? Math.ceil(stake / price) : 0;

        $("calcStake").textContent = `${stake.toFixed(2)} USDC`;
        $("calcLossPerSlash").textContent = `${lossPerSlash.toFixed(2)} USDC (${slashPct}%)`;
        $("calcMaxSlashes").textContent = `${maxSlashes} slash${maxSlashes === 1 ? "" : "es"}`;
        $("calcRevenue10").textContent = `${revenue10.toFixed(2)} USDC`;
        $("calcBreakeven").textContent = `${breakeven} call${breakeven === 1 ? "" : "s"}`;
      }

      // Wire calc inputs
      ["regStake", "regPrice", "regSlashPct"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("input", updateCalculator);
      });
      // Initial render
      updateCalculator();


      // -------- Guide tabs & FAQ accordion --------
      document.querySelectorAll(".guide-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          const targetId = tab.dataset.tab;
          document.querySelectorAll(".guide-tab").forEach(t => t.classList.remove("active"));
          document.querySelectorAll(".guide-content").forEach(c => c.classList.remove("active"));
          tab.classList.add("active");
          const content = document.querySelector(`.guide-content[data-content="${targetId}"]`);
          if (content) content.classList.add("active");
        });
      });

      document.querySelectorAll(".faq-q").forEach((q) => {
        q.addEventListener("click", () => {
          const item = q.closest(".faq-item");
          item.classList.toggle("open");
        });
      });

      // ================================================================
      // Provider list render (chain data only, no session tags)
      // ================================================================
      async function pingProviderEndpoints() {
        const endpoints = await Promise.all(
          (state.allProviders || []).filter(p => p.active).map(async p => {
            try {
              const ep = await state.registry.getEndpoint(p.id).catch(() => null);
              return { id: p.id, endpoint: ep };
            } catch { return { id: p.id, endpoint: null }; }
          })
        );
        for (const { id, endpoint } of endpoints) {
          const cell = document.getElementById("health-" + id);
          if (!cell) continue;
          if (!endpoint) {
            cell.innerHTML = '<span style="color:var(--text-faint)">no endpoint</span>';
            continue;
          }
          try {
            const res = await fetch(CONFIG.facilitatorUrl + "/ping?url=" + encodeURIComponent(endpoint));
            const data = await res.json();
            if (data.ok) {
              cell.innerHTML = '<span style="color:var(--accent)">🟢 ' + (data.ms || "?") + 'ms</span>';
            } else {
              cell.innerHTML = '<span style="color:var(--danger)">🔴 down</span>';
            }
          } catch {
            cell.innerHTML = '<span style="color:var(--danger)">🔴 err</span>';
          }
        }
      }

      function renderAllProvidersFiltered() {
        const d = state.usdcDecimals;
        const myAddr = state.address?.toLowerCase();
        const rows = state.allProviders.map(p => {
          const isSelf = myAddr && p.owner?.toLowerCase() === myAddr;
          const badge = p.active ? `<span class="badge active">active</span>` : `<span class="badge inactive">inactive</span>`;
          const rep = p.reputation ?? 0;
          const repColor = rep >= 80 ? "var(--accent)" : rep >= 50 ? "var(--warn)" : "var(--danger)";
          const priceUsdc = ethers.formatUnits(p.pricePerCall, d);
          const priceUsd = usdPrice(priceUsdc);
          return `
            <tr data-pid="${p.id}" class="${isSelf ? "is-self" : ""}">
              <td class="col-id">#${p.id}</td>
              <td class="col-owner">${short(p.owner, 4)}${isSelf ? `<span class="self-tag">you</span>` : ""}</td>
              <td class="col-price">${priceUsdc} <span style="font-size:10px;color:var(--text-faint)">${priceUsd}</span></td>
              <td class="col-stake">${ethers.formatUnits(p.stake, d)}</td>
              <td class="col-sla">${p.maxResponseTime}s · ${Number(p.slashBps) / 100}%</td>
              <td style="text-align:right;color:${repColor};font-weight:600">${rep}</td>
              <td class="col-status">${badge}</td>
              <td style="text-align:right;font-size:11px" class="col-health" id="health-${p.id}">
                <span style="color:var(--text-faint)">…</span>
              </td>
              <td style="text-align:right">
                <button class="btn btn-sm btn-nano" data-nano-provider="${p.id}" onclick="event.stopPropagation()">
                  ⚡ Nanopay 0.001
                </button>
              </td>
            </tr>`;
        }).join("");

        $("allProvidersBox").innerHTML = `
          <table class="provider-table">
            <thead><tr>
              <th>ID</th><th>Owner</th>
              <th style="text-align:right">Price</th>
              <th style="text-align:right">Stake</th>
              <th style="text-align:right">SLA · slash</th>
              <th style="text-align:right">Rep</th>
              <th style="text-align:right">Status</th>
              <th style="text-align:right">Health</th>
              <th style="text-align:right">Nano</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>`;

        $("allProvidersBox").querySelectorAll("tbody tr[data-pid]").forEach(tr => {
          tr.addEventListener("click", () => openProviderModal(Number(tr.dataset.pid)));
        });
        // Ping endpoints after render
        setTimeout(pingProviderEndpoints, 500);
      }

      // -------- Ping endpoint button --------
      // Note: browser CORS policy prevents direct pinging of arbitrary URLs.
      // We validate the URL format only; actual reachability must be verified server-side.
      document.addEventListener("click", (e) => {
        if (e.target.id !== "btnPingEndpoint") return;
        const url = $("regEndpoint").value.trim();
        const resultEl = $("pingResult");
        if (!url) {
          resultEl.style.color = "var(--warn)";
          resultEl.textContent = "⚠ Enter an endpoint URL first.";
          return;
        }
        try {
          new URL(url); // validate format
          resultEl.style.color = "var(--accent)";
          resultEl.textContent = "✓ URL format valid. Reachability must be verified externally (CORS prevents browser pings).";
        } catch {
          resultEl.style.color = "var(--danger)";
          resultEl.textContent = "✗ Invalid URL format.";
        }
      });

      // -------- Boot: read-only stats + landing feed (no wallet needed) --------
      // Uses raw fetch() JSON-RPC calls instead of ethers.JsonRpcProvider to
      // avoid a DataCloneError bug in ethers v6 where the provider's internal
      // polling worker tries to postMessage() a Headers object that can't be
      // structured-cloned in some browsers.
      let _rpcId = 1;
      async function rpcCall(method, params = []) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(CONFIG.rpcUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: _rpcId++,
                method,
                params
              }),
            });

            if (res.status === 429) {
              console.warn("[RPC] HTTP 429 rate limited");
              await new Promise(r => setTimeout(r, 5000 * (attempt + 1)));
              continue;
            }

            const json = await res.json();

            if (json.error) {
              if (
                json.error.code === -32005 ||
                json.error.message?.includes("rate")
              ) {
                await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
                continue;
              }
              throw new Error(json.error.message);
            }

            return json.result;

          } catch (e) {
            if (attempt === 4) throw e;
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
      }

      // eth_call helper — encodes a simple no-arg view call and decodes uint256
      async function ethCallUint(to, selector) {
        const result = await rpcCall("eth_call", [{ to, data: selector }, "latest"]);
        return result && result !== "0x" ? BigInt(result) : 0n;
      }

      // eth_getLogs helper
      async function fetchLogs(address, topic0, fromBlock, toBlock) {
  const from = "0x" + fromBlock.toString(16);
  const to   = "0x" + toBlock.toString(16);

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await rpcCall("eth_getLogs", [{
        address,
        topics: [topic0],
        fromBlock: from,
        toBlock: to
      }]);
    } catch (e) {
      const msg = e?.message || "";
      console.warn(`eth_getLogs retry ${attempt + 1}/4:`, msg);

      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
      }
    }
  }

  return [];
}


// Chunked log scan (mirrors scanRange but over raw fetch)
      async function fetchLogsChunked(address, topic0, from, to, chunkSize = CHUNK_SIZE) {
        const results = [];
        let cursor = from;
        while (cursor <= to) {
          const end = Math.min(cursor + chunkSize - 1, to);
          const logs = await fetchLogs(address, topic0, cursor, end).catch(() => []);
          if (Array.isArray(logs)) {
            results.push(...logs);
          }
          await new Promise(r => setTimeout(r, 3000));
          cursor = end + 1;
        }
        return results;
      }

      // keccak256 topic selectors — computed via ethers.id
      const TOPICS = {
        CallStarted:       ethers.id("CallStarted(bytes32,uint256,address,uint256,bytes32,uint32)"),
        ReceiptSubmitted:  ethers.id("ReceiptSubmitted(bytes32,bytes32)"),
        CallSlashed:       ethers.id("CallSlashed(bytes32,uint256,uint256)"),
        ProviderRegistered: ethers.id("ProviderRegistered(uint256,address,address,uint256,uint256,uint32,uint32,string)"),
      };

      // nextProviderId() selector = keccak256("nextProviderId()")[0:4]
      const SEL_NEXT_PROVIDER_ID = ethers.id("nextProviderId()").slice(0, 10);
      const SEL_DECIMALS          = ethers.id("decimals()").slice(0, 10);
      const SEL_NONCE             = ethers.id("nonce()").slice(0, 10);

      (async () => {
        try {
          // Use a minimal ethers Interface just for log decoding (no provider needed)
          const payIface = new ethers.Interface(PAY_ABI);
          const regIface = new ethers.Interface(REGISTRY_ABI);

          // --- Phase 1: immediate data (provider count + total calls + USDC decimals) ---
          // These are single-call reads, return in ~200ms.
          // Update hero stats ASAP so the page doesn't feel like it's loading.
          const [decResult, nonceRaw, latestHex] = await Promise.all([
            rpcCall("eth_call", [{ to: CONFIG.usdc, data: SEL_DECIMALS }, "latest"]).catch(() => null),
            
            rpcCall("eth_call", [{ to: CONFIG.payPerCall, data: SEL_NONCE }, "latest"]).catch(() => null),
            rpcCall("eth_blockNumber").catch(() => null),
          ]);

          if (decResult && decResult !== "0x") {
            state.usdcDecimals = Number(BigInt(decResult));
          }
          const safeDecimals = state.usdcDecimals || 6;

          // Provider count comes from Goldsky
          // Show hero stats from Goldsky first (fast, no RPC dependency)
          if (CONFIG.subgraphUrl) {
            try {
              const stats = await fetch(CONFIG.subgraphUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  query: `{
                    providers(first:1000) { id }
                    calls(first:1000) { id }
                  }`
                })
              });

              const data = await stats.json();

              if (data.data) {
                $("heroProviders").textContent =
                  String(data.data.providers?.length || 0);

                $("heroCalls").textContent =
                  String(data.data.calls?.length || 0);
              }
            } catch (e) {
              console.warn("[Goldsky hero stats failed]", e.message);
              $("heroProviders").textContent =
                0 .toString();

              if (nonceRaw && nonceRaw !== "0x") {
                $("heroCalls").textContent =
                  Number(BigInt(nonceRaw)).toString();
              }
            }
          }

          if (!latestHex) return;
          const latest = Number(BigInt(latestHex));

          // --- Phase 2: event scan in background (can take 1-3s) ---
          // Landing page only needs recent activity, so use a shorter window
          // to keep initial load fast. Full 100K window kicks in post-connect.
          const LANDING_SCAN_BLOCKS = 5_000; // ~1 day on Arc, fast enough
          const from = Math.max(0, latest - LANDING_SCAN_BLOCKS);

          // Fetch logs sequentially to avoid RPC rate limits
          const startedRaw = await fetchLogsChunked(
            CONFIG.payPerCall,
            TOPICS.CallStarted,
            from,
            latest
          );

          await new Promise(r => setTimeout(r, 1500));

          const receiptRaw = await fetchLogsChunked(
            CONFIG.payPerCall,
            TOPICS.ReceiptSubmitted,
            from,
            latest
          );

          await new Promise(r => setTimeout(r, 1500));

          const slashedRaw = await fetchLogsChunked(
            CONFIG.payPerCall,
            TOPICS.CallSlashed,
            from,
            latest
          );

          await new Promise(r => setTimeout(r, 1500));

          const regRaw = await fetchLogsChunked(
            CONFIG.registry,
            TOPICS.ProviderRegistered,
            from,
            latest
          );

          $("heroSlashes").textContent = slashedRaw.length.toString();

          // Decode logs and build event list
          const events = [];

          for (const l of regRaw) {
            try {
              const parsed = regIface.parseLog({ topics: l.topics, data: l.data });
              events.push({
                tag: "registered", tagText: "provider",
                blockNumber: Number(BigInt(l.blockNumber)),
                txHash: l.transactionHash,
                body: `#${parsed.args.providerId} registered by <span class="hi">${short(parsed.args.owner, 4)}</span> · ${ethers.formatUnits(parsed.args.stake, safeDecimals)} USDC staked`,
              });
            } catch {}
          }
          for (const l of startedRaw) {
            try {
              const parsed = payIface.parseLog({ topics: l.topics, data: l.data });
              events.push({
                tag: "started", tagText: "call opened",
                blockNumber: Number(BigInt(l.blockNumber)),
                txHash: l.transactionHash,
                body: `<span class="hi">${short(parsed.args.caller, 4)}</span> → provider #${parsed.args.providerId} · ${ethers.formatUnits(parsed.args.amount, safeDecimals)} USDC escrowed`,
              });
            } catch {}
          }
          for (const l of receiptRaw) {
            try {
              const parsed = payIface.parseLog({ topics: l.topics, data: l.data });
              events.push({
                tag: "submitted", tagText: "receipt",
                blockNumber: Number(BigInt(l.blockNumber)),
                txHash: l.transactionHash,
                body: `receipt signed for call <span class="hi">${short(parsed.args.callId, 6)}</span>`,
              });
            } catch {}
          }
          for (const l of slashedRaw) {
            try {
              const parsed = payIface.parseLog({ topics: l.topics, data: l.data });
              events.push({
                tag: "slashed", tagText: "slashed",
                blockNumber: Number(BigInt(l.blockNumber)),
                txHash: l.transactionHash,
                body: `call <span class="hi">${short(parsed.args.callId, 6)}</span> timed out · refund ${ethers.formatUnits(parsed.args.refunded, safeDecimals)} + slash ${ethers.formatUnits(parsed.args.slashed, safeDecimals)} USDC`,
              });
            } catch {}
          }

          // Sort newest first, keep 10
          events.sort((a, b) => b.blockNumber - a.blockNumber);
          const recent = events.slice(0, 10);

          const feed = $("landingFeed");
          if (recent.length === 0) {
            feed.innerHTML = `<div class="empty-state">no activity yet — be the first</div>`;
          } else {
            feed.innerHTML = "";
            for (const ev of recent) {
              const row = document.createElement("div");
              row.className = "feed-row";
              row.innerHTML = `
                <span class="feed-time">blk ${ev.blockNumber}</span>
                <span class="feed-tag ${ev.tag}">${ev.tagText}</span>
                <span class="feed-body">${ev.body}</span>
                <a class="feed-link" href="${txLink(ev.txHash)}" target="_blank" rel="noreferrer">${short(ev.txHash, 4)} ↗</a>
              `;
              feed.appendChild(row);
            }
          }

          // Poll for new events every 10s on the landing feed (no websocket needed)
          let lastSeenBlock = latest;
          const landingDedupe = new Set(events.map(e => e.txHash));

          const pollLanding = async () => {
            try {
              const nowHex = await rpcCall("eth_blockNumber");
              const nowBlock = Number(BigInt(nowHex));
              if (nowBlock <= lastSeenBlock) return;
                const ns = await fetchLogsChunked(
                  CONFIG.payPerCall,
                  TOPICS.CallStarted,
                  lastSeenBlock + 1,
                  nowBlock
                );

                await new Promise(r => setTimeout(r, 1500));

                const nr = await fetchLogsChunked(
                  CONFIG.payPerCall,
                  TOPICS.ReceiptSubmitted,
                  lastSeenBlock + 1,
                  nowBlock
                );

                await new Promise(r => setTimeout(r, 1500));

                const nsl = await fetchLogsChunked(
                  CONFIG.payPerCall,
                  TOPICS.CallSlashed,
                  lastSeenBlock + 1,
                  nowBlock
                );

                await new Promise(r => setTimeout(r, 1500));

                const nrg = await fetchLogsChunked(
                  CONFIG.registry,
                  TOPICS.ProviderRegistered,
                  lastSeenBlock + 1,
                  nowBlock
                );
              lastSeenBlock = nowBlock;
              const newEvts = [];
              for (const l of nrg) {
                try { const p = regIface.parseLog({ topics: l.topics, data: l.data }); newEvts.push({ tag: "registered", tagText: "provider", blockNumber: Number(BigInt(l.blockNumber)), txHash: l.transactionHash, body: `#${p.args.providerId} registered by <span class="hi">${short(p.args.owner,4)}</span> · ${ethers.formatUnits(p.args.stake, safeDecimals)} USDC staked` }); } catch {}
              }
              for (const l of ns) {
                try { const p = payIface.parseLog({ topics: l.topics, data: l.data }); newEvts.push({ tag: "started", tagText: "call opened", blockNumber: Number(BigInt(l.blockNumber)), txHash: l.transactionHash, body: `<span class="hi">${short(p.args.caller,4)}</span> → provider #${p.args.providerId} · ${ethers.formatUnits(p.args.amount, safeDecimals)} USDC escrowed` }); } catch {}
              }
              for (const l of nr) {
                try { const p = payIface.parseLog({ topics: l.topics, data: l.data }); newEvts.push({ tag: "submitted", tagText: "receipt", blockNumber: Number(BigInt(l.blockNumber)), txHash: l.transactionHash, body: `receipt signed for call <span class="hi">${short(p.args.callId,6)}</span>` }); } catch {}
              }
              for (const l of nsl) {
                try { const p = payIface.parseLog({ topics: l.topics, data: l.data }); newEvts.push({ tag: "slashed", tagText: "slashed", blockNumber: Number(BigInt(l.blockNumber)), txHash: l.transactionHash, body: `call <span class="hi">${short(p.args.callId,6)}</span> timed out · refund ${ethers.formatUnits(p.args.refunded, safeDecimals)} + slash ${ethers.formatUnits(p.args.slashed, safeDecimals)} USDC` }); } catch {}
              }
              newEvts.sort((a,b) => b.blockNumber - a.blockNumber);
              for (const ev of newEvts) {
                if (landingDedupe.has(ev.txHash)) continue;
                landingDedupe.add(ev.txHash);
                const feedEl = $("landingFeed");
                if (!feedEl) return;
                feedEl.querySelector(".empty-state")?.remove();
                const row = document.createElement("div");
                row.className = "feed-row";
                row.innerHTML = `<span class="feed-time">blk ${ev.blockNumber}</span><span class="feed-tag ${ev.tag}">${ev.tagText}</span><span class="feed-body">${ev.body}</span><a class="feed-link" href="${txLink(ev.txHash)}" target="_blank" rel="noreferrer">${short(ev.txHash,4)} ↗</a>`;
                feedEl.prepend(row);
                while (feedEl.children.length > 10) feedEl.removeChild(feedEl.lastChild);
                bumpUnseen();
              }
            } catch {}
          };
          setInterval(pollLanding, 10_000);

        } catch (e) {
          console.warn("boot stats failed:", e);
          const feed = $("landingFeed");
          if (feed) {
            feed.innerHTML = `<div class="empty-state">couldn't reach arc testnet — try again in a moment</div>`;
          }
        }
      })();

      // ================================================================
      // CCTP V2 CONFIG
      // ================================================================
      const CCTP_CONFIG = {
        contracts: {
          TokenMessengerV2: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
          MessageTransmitterV2: "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275",
        },
        domains: { sepolia: 0, base: 6, amoy: 7, arc: 26 },
        usdc: {
          sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
          base: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          amoy: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
          arc: "0x3600000000000000000000000000000000000000",
        },
        chains: {
          sepolia: { chainId: "0xaa36a7", chainIdDecimal: 11155111, rpcUrl: "https://rpc.sepolia.org", name: "Ethereum Sepolia", explorer: "https://sepolia.etherscan.io" },
          base:    { chainId: "0x14a34",  chainIdDecimal: 84532,    rpcUrl: "https://sepolia.base.org", name: "Base Sepolia", explorer: "https://sepolia.basescan.org" },
          amoy:    { chainId: "0x13882",  chainIdDecimal: 80002,    rpcUrl: "https://rpc-amoy.polygon.technology", name: "Polygon Amoy", explorer: "https://amoy.polygonscan.com" },
          arc:     { chainId: "0x4CEF52", chainIdDecimal: 5042002,  rpcUrl: "https://rpc.testnet.arc.network", name: "Arc Testnet", explorer: "https://testnet.arcscan.app" },
        },
        irisApi: "https://iris-api-sandbox.circle.com/v2/messages",
        crossChainReceiver: "0x28a683A5fAB9B5DC2608089e86d733aB1f116e5c",
      };

      // Chain selector UI
      // Chain selector — wired after DOM ready (script at bottom of body)
      (function() {
        const sel = document.getElementById("sourceChainSelect");
        const hint = document.getElementById("sourceChainHint");
        if (!sel || !hint) return;
        sel.addEventListener("change", (e) => {
          const chain = e.target.value;
          if (chain === "arc") {
            hint.textContent = "Paying from Arc Testnet directly. No bridging required.";
            hint.style.color = "";
            hint.style.background = "";
            hint.style.padding = "";
            hint.style.borderRadius = "";
          } else {
            const name = CCTP_CONFIG.chains[chain].name;
            hint.innerHTML = `⚠️ USDC will be burned on <strong>${name}</strong>, bridged via CCTP (~20s), then callService() fires on Arc.`;
            hint.style.color = "var(--warn)";
            hint.style.background = "var(--warn-bg)";
            hint.style.padding = "6px 10px";
            hint.style.borderRadius = "6px";
          }
        });
      })();

      async function switchToChain(chainKey) {
        const chain = CCTP_CONFIG.chains[chainKey];
        try {
          await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chain.chainId }] });
        } catch (err) {
          if (err.code === 4902 || err.code === -32603) {
            await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: chain.chainId, chainName: chain.name, rpcUrls: [chain.rpcUrl], nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, blockExplorerUrls: [chain.explorer] }] });
          } else if (err.code === 4001) {
            throw new Error("Chain switch rejected by user.");
          } else { throw err; }
        }
      }

      async function waitForAttestation(sourceDomain, burnTxHash) {
        const url = `${CCTP_CONFIG.irisApi}/${sourceDomain}/${burnTxHash}`;
        const maxAttempts = 100;
        for (let i = 0; i < maxAttempts; i++) {
          try {
            const res = await fetch(url);
            const json = await res.json();
            const msg = json.messages?.[0];
            if (msg?.status === "complete" && msg?.attestation && msg?.attestation !== "PENDING") {
              return { message: msg.message, attestation: msg.attestation };
            }
          } catch {}
          await new Promise(r => setTimeout(r, 3000));
        }
        throw new Error("Attestation timeout. Burn tx succeeded — check ArcScan in a few minutes.");
      }

      async function doCCTPCall() {
        window._cctpFlowActive = true;
        const sourceChainKey = document.getElementById("sourceChainSelect")?.value || "arc";
        const idStr = $("callProviderId").value.trim();
        const payload = $("callPayload").value;
        if (!idStr) return toast({ kind: "err", title: "Enter a provider ID" });
        if (!state.signer) return toast({ kind: "err", title: "Connect wallet first" });
        const providerId = BigInt(idStr);
        const btn = $("btnCall");
        if (btn.disabled) return;
        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = "Processing…";
        try {
          const sourceChain = CCTP_CONFIG.chains[sourceChainKey];
          const sourceDomain = CCTP_CONFIG.domains[sourceChainKey];
          const sourceUsdcAddr = CCTP_CONFIG.usdc[sourceChainKey];
          const arcProvider = state.provider || (state.provider = new ethers.BrowserProvider(window.ethereum));
          const registryReadOnly = new ethers.Contract(CONFIG.registry, REGISTRY_ABI, arcProvider);
          const p = await registryReadOnly.getProvider(providerId);
          if (!p.active) { toast({ kind: "err", title: "Provider is inactive" }); return; }
          const amount = p.pricePerCall;
          const amountFormatted = ethers.formatUnits(amount, 6);
          btn.textContent = "Step 1/5: Switching chain…";
          toast({ kind: "info", title: `Switching to ${sourceChain.name}…`, timeout: 5000 });
          await switchToChain(sourceChainKey);
          const srcProvider = new ethers.BrowserProvider(window.ethereum);
          const srcSigner = await srcProvider.getSigner();
          const userAddress = await srcSigner.getAddress();
          btn.textContent = "Step 2/5: Approving USDC…";
          const usdcSrc = new ethers.Contract(sourceUsdcAddr, ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)"], srcSigner);
          const allowance = await usdcSrc.allowance(userAddress, CCTP_CONFIG.contracts.TokenMessengerV2);
          if (allowance < amount) {
            const tA = toast({ kind: "info", title: `Approving ${amountFormatted} USDC…`, detail: "<span class='spinner'></span>", timeout: 60000 });
            const txA = await usdcSrc.approve(CCTP_CONFIG.contracts.TokenMessengerV2, ethers.MaxUint256);
            await txA.wait();
            tA.remove();
            toast({ kind: "ok", title: "USDC approved ✓", timeout: 3000 });
          }
          btn.textContent = "Step 3/5: Burning USDC via CCTP…";
          const tokenMessenger = new ethers.Contract(CCTP_CONFIG.contracts.TokenMessengerV2, ["function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) external returns (uint64)"], srcSigner);
          const mintRecipient = ethers.zeroPadValue(CCTP_CONFIG.crossChainReceiver, 32);
          const destinationCaller = ethers.ZeroHash;
          const tBurn = toast({ kind: "info", title: "Burning USDC on source chain…", detail: "<span class='spinner'></span> Confirm in MetaMask", timeout: 60000 });
          const burnTx = await tokenMessenger.depositForBurn(amount, CCTP_CONFIG.domains.arc, mintRecipient, sourceUsdcAddr, destinationCaller, 0n, 1000);
          await burnTx.wait();
          tBurn.remove();
          toast({ kind: "ok", title: "USDC burned ✓", link: `${sourceChain.explorer}/tx/${burnTx.hash}` });
          btn.textContent = "Step 4/5: Waiting for attestation (~20s)…";
          const tIris = toast({ kind: "info", title: "Fetching Circle attestation…", detail: "<span class='spinner'></span> Usually 20-60 seconds", timeout: 300000 });
          const { message: cctpMessage, attestation } = await waitForAttestation(sourceDomain, burnTx.hash);
          tIris.remove();
          toast({ kind: "ok", title: "Attestation received ✓", timeout: 3000 });
          btn.textContent = "Step 5/5: Minting on Arc…";
          await new Promise(r => setTimeout(r, 1500));
          await switchToChain("arc");
          await new Promise(r => setTimeout(r, 2000));
          const arcBrowserProvider = new ethers.BrowserProvider(window.ethereum);
          const arcSigner = await arcBrowserProvider.getSigner();
          const messageTransmitter = new ethers.Contract(CCTP_CONFIG.contracts.MessageTransmitterV2, ["function receiveMessage(bytes message, bytes attestation) external returns (bool)"], arcSigner);
          const tMint = toast({ kind: "info", title: "Minting on Arc Testnet…", detail: "<span class='spinner'></span> Confirm in MetaMask", timeout: 60000 });
          const mintTx = await messageTransmitter.receiveMessage(cctpMessage, attestation);
          await mintTx.wait();
          tMint.remove();
          state.cctpTxHashes.add(mintTx.hash);
          pushActivity({
            type: "call",
            icon: "🌐",
            label: `CCTP call from ${sourceChain.name}`,
            detail: `provider #${providerId} · ${amountFormatted} USDC bridged`,
            txHash: mintTx.hash,
          });
          toast({ kind: "ok", title: "✅ Cross-chain call complete!", detail: `USDC bridged → Arc. CrossChainReceiver executed callService().`, link: `https://testnet.arcscan.app/address/${CCTP_CONFIG.crossChainReceiver}`, timeout: 12000 });
          state.provider = arcBrowserProvider;
          state.signer = arcSigner;
          state.chainId = CONFIG.chainId;
          await refreshAll();
        } catch (e) {
          console.error(e);
          toast({ kind: "err", title: "CCTP call failed", detail: friendlyError(e) });
        } finally {
          window._cctpFlowActive = false;
          btn.disabled = false;
          btn.textContent = origText;
        }
      }

      // doRegisterV2 — direct flow: mint ERC-8004 NFT, then ServiceRegistry.registerV2.
      // The old RegisterWithNFT helper contract registered ITSELF as the provider
      // owner (msg.sender = helper), so it could only ever be used once and the
      // provider was un-usable. This flow runs every step from the user's wallet.
      async function doRegisterV2() {
        if (!state.signer) return toast({ kind: "err", title: "Connect wallet first" });
        if (state.chainId && state.chainId !== CONFIG.chainId) return toast({ kind: "err", title: "Wrong network" });
        // Authoritative on-chain check — don't trust possibly-stale state.providerInfo
        try {
          const existingId = Number(await state.registry.providerIdOf(state.address));
          if (existingId !== 0) {
            return toast({
              kind: "err",
              title: "Already registered",
              detail: `This wallet is already provider #${existingId}. Each address can register only one provider. Use a different wallet.`,
              timeout: 9000,
            });
          }
        } catch {}
        const stake = parseFloat($("regStake").value.trim() || "10");
        const price = parseFloat($("regPrice").value.trim() || "1");
        const maxResp = parseInt($("regMaxResp").value.trim() || "120", 10);
        const slashPct = parseFloat($("regSlashPct").value.trim() || "10");
        const endpoint = $("regEndpoint").value.trim() || "https://callguard.vercel.app/provider";
        const signerAddr = $("regSigner").value.trim() || state.address;
        if (stake < 10) return toast({ kind: "err", title: "Minimum stake is 10 USDC" });
        if (maxResp < 10) return toast({ kind: "err", title: "Min response time is 10 seconds" });
        const btn = $("btnRegisterV2");
        if (btn.disabled) return;
        btn.disabled = true;
        const origText = btn.textContent;
        try {
          const stakeRaw = ethers.parseUnits(stake.toString(), state.usdcDecimals);
          const priceRaw = ethers.parseUnits(price.toString(), state.usdcDecimals);
          const slashBps = Math.round(slashPct * 100);
          // ── Step 1/3 — mint an ERC-8004 AgentIdentity NFT to the user ──
          btn.textContent = "Step 1/3: Minting identity NFT…";
          const identity = new ethers.Contract(
            CONFIG.identityRegistry,
            [
              "function register(string agentURI) returns (uint256)",
              "event Registered(uint256 indexed agentId, address indexed owner, string agentURI)",
            ],
            state.signer
          );
          const agentURI = endpoint || "https://callguard.vercel.app/provider";
          const tMint = toast({ kind: "info", title: "Minting AgentIdentity NFT…", detail: "<span class='spinner'></span> Confirm in MetaMask", timeout: 60000 });
          let tokenId;
          try {
            const mintTx = await identity.register(agentURI);
            const mintRc = await mintTx.wait();
            // Pull tokenId from the Registered event, or fall back to a Transfer event
            const idIface = new ethers.Interface([
              "event Registered(uint256 indexed agentId, address indexed owner, string agentURI)",
              "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
            ]);
            for (const lg of mintRc.logs) {
              try {
                const p = idIface.parseLog(lg);
                if (p && p.name === "Registered") { tokenId = p.args.agentId; break; }
                if (p && p.name === "Transfer" && p.args.from === ethers.ZeroAddress) { tokenId = p.args.tokenId; }
              } catch {}
            }
            tMint.remove();
            if (tokenId === undefined) throw new Error("Could not read minted tokenId from logs");
            toast({ kind: "ok", title: `Identity NFT minted ✓ #${tokenId}`, link: txLink(mintTx.hash), timeout: 4000 });
          } catch (mintErr) {
            tMint.remove();
            throw mintErr;
          }
          // ── Step 2/3 — approve USDC to ServiceRegistry ──
          btn.textContent = "Step 2/3: Approving USDC…";
          const existingAllowance = await state.usdc.allowance(state.address, CONFIG.registry);
          if (existingAllowance < stakeRaw) {
            const tA = toast({ kind: "info", title: "Approving USDC…", detail: "<span class='spinner'></span> Confirm in MetaMask", timeout: 60000 });
            try {
              const txA = await state.usdc.approve(CONFIG.registry, ethers.MaxUint256);
              await txA.wait();
              tA.remove();
              toast({ kind: "ok", title: "USDC approved ✓", timeout: 3000 });
            } catch (apprErr) {
              tA.remove();
              throw apprErr;
            }
          }
          // ── Step 3/3 — registerV2 on ServiceRegistry (binds the NFT) ──
          btn.textContent = "Step 3/3: Registering provider…";
          const registryV2 = new ethers.Contract(
            CONFIG.registry,
            ["function registerV2(uint256 erc8004TokenId, address signer, uint256 stakeAmount, uint256 pricePerCall, uint32 maxResponseTime, uint32 slashBps, string endpoint) returns (uint256)"],
            state.signer
          );
          const tReg = toast({ kind: "info", title: "Registering with NFT…", detail: "<span class='spinner'></span> Confirm in MetaMask", timeout: 60000 });
          let tx, receipt;
          try {
            tx = await registryV2.registerV2(tokenId, signerAddr, stakeRaw, priceRaw, maxResp, slashBps, endpoint);
            receipt = await tx.wait();
            tReg.remove();
          } catch (regErr) {
            tReg.remove();
            throw regErr;
          }
          // Read providerId from the ProviderRegistered event
          let providerId = "?";
          for (const lg of receipt.logs) {
            try {
              const p = state.registry.interface.parseLog(lg);
              if (p && p.name === "ProviderRegistered") { providerId = p.args.providerId.toString(); break; }
            } catch {}
          }
          toast({ kind: "ok", title: `✅ Registered! Provider #${providerId} · NFT #${tokenId}`, link: txLink(tx.hash), timeout: 9000 });
          pushActivity({
            type: "register",
            icon: "🔐",
            label: `Registered with NFT — provider #${providerId}`,
            detail: `AgentIdentity NFT #${tokenId} bound`,
            txHash: tx.hash,
          });
          btn.textContent = `✅ Provider #${providerId} (NFT #${tokenId})`;
          btn.disabled = true;
          await refreshAll();
        } catch (e) {
          console.error(e);
          toast({ kind: "err", title: "Registration failed", detail: friendlyError(e) });
          btn.disabled = false;
          btn.textContent = origText || "🔐 Register with NFT — recommended";
        }
      }
      // ================================================================
      // ERC-8183 JOBS
      // ================================================================

      function getJobsContract() {
        return new ethers.Contract(CONFIG.agenticCommerce, JOBS_ABI, state.signer);
      }

      const JOB_STATUS = ["Open","Funded","Submitted","Completed","Rejected","Expired"];

      function jobOut(msg) {
        const el = $("jobsOutput");
        if (el) el.textContent = msg;
      }

      function setJobRailStep(n) {
        document.querySelectorAll('.job-rail-step').forEach(el => {
          const s = Number(el.dataset.step);
          el.classList.remove('active', 'done');
          if (s < n) el.classList.add('done');
          else if (s === n) el.classList.add('active');
        });
      }
      function openJobStep(n) {
        for (let i = 1; i <= 5; i++) {
          const el = $("jobStep" + i);
          if (el) el.open = (i === n);
        }
        setJobRailStep(n);
      }

      async function doCreateJob() {
        if (!state.signer) return toast({ kind:"err", title:"Connect wallet first" });
        const provider = $("jobProvider").value.trim();
        const desc     = $("jobDesc").value.trim();
        if (!provider || !desc) return toast({ kind:"err", title:"Fill provider address and description" });
        try {
          jobOut("Creating job...");
          const jobs = getJobsContract();
          const expiredAt = Math.floor(Date.now()/1000) + 3600;
          const tx = await jobs.createJob(provider, state.address, expiredAt, desc, "0x0000000000000000000000000000000000000000");
          const rc = await tx.wait();
          const iface = new ethers.Interface(JOBS_ABI);
          let jobId = null;
          for (const log of rc.logs) {
            try { const p = iface.parseLog(log); if (p && p.name === "JobCreated") { jobId = p.args.jobId; break; } } catch {}
          }
          jobOut(`✓ Job created — ID #${jobId ?? "?"}\ntx: ${tx.hash.slice(0,10)}...\n\nNext: the provider sets a budget for this job.`);
          toast({ kind:"ok", title:"Job created", detail:`ID: ${jobId}`, link: txLink(tx.hash), timeout:8000 });
          if ($("feed")) addFeed({ tag:"job", tagText:"job", body:`⚙️ Job #${jobId} created`, txHash: tx.hash });
          if (jobId !== null) {
            ["jobSetBudgetId","jobFundId","jobSubmitId","jobCompleteId","jobCheckId"].forEach(id => { const el = $(id); if(el) el.value = jobId.toString(); });
            openJobStep(2);
          }
        } catch(e) { jobOut("Error: "+e.message); toast({ kind:"err", title:"Create job failed", detail: friendlyError(e) }); }
      }

      async function doSetBudget() {
        if (!state.signer) return toast({ kind:"err", title:"Connect wallet first" });
        const jobId = $("jobSetBudgetId").value.trim();
        const amount = $("jobSetBudgetAmount").value.trim();
        if (!jobId || !amount) return toast({ kind:"err", title:"Enter Job ID and amount" });
        try {
          jobOut("Setting budget for job " + jobId + "...");
          const jobs = getJobsContract();
          const tx = await jobs.setBudget(BigInt(jobId), ethers.parseUnits(amount, 6), "0x");
          await tx.wait();
          jobOut(`✓ Budget set — ${amount} USDC on job #${jobId}\ntx: ${tx.hash.slice(0,10)}...\n\nNext: the client funds the escrow.`);
          toast({ kind:"ok", title:"Budget set", link: txLink(tx.hash), timeout:6000 });
          if ($("feed")) addFeed({ tag:"job", tagText:"job", body:`💰 Job #${jobId} budget set: ${amount} USDC`, txHash: tx.hash });
          openJobStep(3);
        } catch(e) { jobOut("Error: "+e.message); toast({ kind:"err", title:"setBudget failed", detail: friendlyError(e) }); }
      }

      async function doFundJob() {
        if (!state.signer) return toast({ kind:"err", title:"Connect wallet first" });
        const jobId = $("jobFundId").value.trim();
        if (!jobId) return toast({ kind:"err", title:"Enter Job ID" });
        try {
          jobOut("Funding job " + jobId + "...");
          const jobs = getJobsContract();
          const job = await jobs.getJob(BigInt(jobId));
          const allowance = await state.usdc.allowance(state.address, CONFIG.agenticCommerce);
          if (allowance < job.budget) {
            jobOut("Approving USDC...");
            const txA = await state.usdc.approve(CONFIG.agenticCommerce, ethers.MaxUint256);
            await txA.wait();
          }
          const tx = await jobs.fund(BigInt(jobId), "0x");
          await tx.wait();
          jobOut(`✓ Escrow funded — job #${jobId}\ntx: ${tx.hash.slice(0,10)}...\n\nNext: the provider submits the deliverable.`);
          toast({ kind:"ok", title:"Job funded", link: txLink(tx.hash), timeout:6000 });
          if ($("feed")) addFeed({ tag:"job", tagText:"job", body:`🔒 Job #${jobId} escrow funded`, txHash: tx.hash });
          openJobStep(4);
        } catch(e) { jobOut("Error: "+e.message); toast({ kind:"err", title:"Fund failed", detail: friendlyError(e) }); }
      }

      async function doSubmitJob() {
        if (!state.signer) return toast({ kind:"err", title:"Connect wallet first" });
        const jobId   = $("jobSubmitId").value.trim();
        const payload = $("jobDeliverable").value.trim() || "deliverable";
        if (!jobId) return toast({ kind:"err", title:"Enter Job ID" });
        try {
          jobOut("Submitting deliverable for job " + jobId + "...");
          const jobs = getJobsContract();
          const deliverableHash = ethers.keccak256(ethers.toUtf8Bytes(payload));
          const tx = await jobs.submit(BigInt(jobId), deliverableHash, "0x");
          await tx.wait();
          jobOut(`✓ Deliverable submitted — job #${jobId}\ntx: ${tx.hash.slice(0,10)}...\n\nNext: the evaluator approves and settles.`);
          toast({ kind:"ok", title:"Deliverable submitted", link: txLink(tx.hash), timeout:6000 });
          if ($("feed")) addFeed({ tag:"job", tagText:"job", body:`📦 Job #${jobId} deliverable submitted`, txHash: tx.hash });
          openJobStep(5);
        } catch(e) { jobOut("Error: "+e.message); toast({ kind:"err", title:"Submit failed", detail: friendlyError(e) }); }
      }

      async function doCompleteJob() {
        if (!state.signer) return toast({ kind:"err", title:"Connect wallet first" });
        const jobId = $("jobCompleteId").value.trim();
        if (!jobId) return toast({ kind:"err", title:"Enter Job ID" });
        try {
          jobOut("Completing job " + jobId + "...");
          const jobs = getJobsContract();
          const reasonHash = ethers.keccak256(ethers.toUtf8Bytes("work-delivered-and-approved"));
          const tx = await jobs.complete(BigInt(jobId), reasonHash, "0x");
          await tx.wait();
          jobOut(`✓ Job #${jobId} completed and settled\ntx: ${tx.hash.slice(0,10)}...\n\nUSDC has been released to the provider.`);
          toast({ kind:"ok", title:"Job completed", link: txLink(tx.hash), timeout:6000 });
          if ($("feed")) addFeed({ tag:"job", tagText:"job", body:`✅ Job #${jobId} completed — USDC released to provider`, txHash: tx.hash });
          setJobRailStep(6);
        } catch(e) { jobOut("Error: "+e.message); toast({ kind:"err", title:"Complete failed", detail: friendlyError(e) }); }
      }

      async function loadMyJobs() {
        if (!state.signer || !state.address) return toast({ kind:"err", title:"Connect wallet first" });
        const listEl = $("myJobsList");
        const titleEl = $("myJobsTitle");
        titleEl.style.display = "block";
        listEl.innerHTML = '<div class="empty-state" style="font-size:12px">loading your jobs…</div>';
        try {
          // Try Goldsky subgraph first
          if (CONFIG.subgraphUrl) {
            try {
              const addr = state.address.toLowerCase();
              const gql = await fetch(CONFIG.subgraphUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: `{
                  asClient: jobs(first:100, where:{client:"${addr}"}, orderBy:jobId, orderDirection:desc) { id jobId client provider status createdAt }
                  asProvider: jobs(first:100, where:{provider:"${addr}"}, orderBy:jobId, orderDirection:desc) { id jobId client provider status createdAt }
                }` })
              });
              const gdata = await gql.json();
              if (gdata.data) {
                const seen = new Map();
                (gdata.data.asClient||[]).forEach(j => seen.set(j.jobId, { jobId: j.jobId, role: "Client", status: j.status }));
                (gdata.data.asProvider||[]).forEach(j => { if (!seen.has(j.jobId)) seen.set(j.jobId, { jobId: j.jobId, role: "Provider", status: j.status }); });
                if (seen.size > 0) {
                  const entries = Array.from(seen.values()).sort((a,b) => Number(b.jobId)-Number(a.jobId));
                  listEl.innerHTML = entries.map(({ jobId, role, status }) => {
                    const roleClass = role === "Client" ? "role-client" : "role-provider";
                    return `<div class="my-job-card" data-job-id="${jobId}">
                      <span class="my-job-id">#${jobId}</span>
                      <span class="my-job-desc">Job #${jobId}</span>
                      <span class="my-job-role ${roleClass}">${role}</span>
                      <span class="my-job-status status-${status}">${status}</span>
                    </div>`;
                  }).join("");
                  listEl.querySelectorAll(".my-job-card").forEach(card => {
                    card.addEventListener("click", () => { $("jobCheckId").value = card.dataset.jobId; doCheckJob(); });
                  });
                  return;
                }
              }
            } catch(e) { console.warn("[subgraph] jobs failed:", e.message); }
          }

          // Fallback to RPC
          const jobs = getJobsContract();
          const iface = new ethers.Interface(JOBS_ABI);
          const asClient = await safeQuery(jobs, "JobCreated", jobs.filters.JobCreated(null, state.address, null));
          const asProvider = await safeQuery(jobs, "JobCreated", jobs.filters.JobCreated(null, null, state.address));

          const seen = new Map();
          [...asClient, ...asProvider].forEach(log => {
            const id = log.args.jobId.toString();
            seen.set(id, { jobId: log.args.jobId, role: log.args.client.toLowerCase() === state.address.toLowerCase() ? "Client" : "Provider" });
          });

          if (seen.size === 0) {
            listEl.innerHTML = '<div class="empty-state" style="font-size:12px">No jobs yet — create one above.</div>';
            return;
          }

          const entries = Array.from(seen.values()).sort((a, b) => Number(b.jobId) - Number(a.jobId));
          const details = await Promise.all(entries.map(async (e) => {
            try {
              const job = await jobs.getJob(e.jobId);
              return { ...e, job };
            } catch { return null; }
          }));

          listEl.innerHTML = details.filter(Boolean).map(({ jobId, role, job }) => {
            const statusName = (JOB_STATUS[Number(job.status)] || "unknown").toLowerCase();
            const roleClass = role === "Client" ? "role-client" : "role-provider";
            return `
              <div class="my-job-card" data-job-id="${jobId}">
                <span class="my-job-id">#${jobId}</span>
                <span class="my-job-desc">${job.description || "(no description)"}</span>
                <span class="my-job-role ${roleClass}">${role}</span>
                <span class="my-job-status status-${statusName}">${statusName}</span>
              </div>
            `;
          }).join("");

          listEl.querySelectorAll(".my-job-card").forEach(card => {
            card.addEventListener("click", () => {
              const id = card.dataset.jobId;
              $("jobCheckId").value = id;
              doCheckJob();
              $("jobsOutput").scrollIntoView({ behavior: "smooth", block: "center" });
            });
          });
        } catch (e) {
          listEl.innerHTML = '<div class="empty-state" style="font-size:12px;color:var(--danger)">Failed to load jobs: ' + e.message + '</div>';
        }
      }

      async function doCheckJob() {
        if (!state.signer) return toast({ kind:"err", title:"Connect wallet first" });
        const jobId = $("jobCheckId").value.trim();
        if (!jobId) return toast({ kind:"err", title:"Enter Job ID" });
        try {
          const jobs = getJobsContract();
          const job = await jobs.getJob(BigInt(jobId));
          const status = JOB_STATUS[Number(job.status)] || "Unknown";
          const budget = ethers.formatUnits(job.budget, 6);
          jobOut(`Job #${jobId}\nStatus: ${status}\nBudget: ${budget} USDC\nProvider: ${job.provider.slice(0,10)}...\nClient: ${job.client.slice(0,10)}...`);
          const stepByStatus = { Open: 2, Funded: 4, Submitted: 5, Completed: 6, Rejected: 6, Expired: 6 };
          if (stepByStatus[status]) setJobRailStep(stepByStatus[status]);
        } catch(e) { jobOut("Error: "+e.message); }
      }

      // ================================================================
      // x402 SIMULATED FLOW (browser, no HTTP server needed)
      // ================================================================
      // x402 SIMULATED FLOW (browser, no HTTP server needed)
      // ================================================================
      



      async function doX402Call() {
        if (!state.signer) return toast({ kind: "err", title: "Connect wallet first" });
        if (state.chainId && state.chainId !== CONFIG.chainId) return toast({ kind: "err", title: "Wrong network — switch to Arc Testnet" });

        const idStr = $("callProviderId").value.trim();
        const payload = $("callPayload").value || "ping";
        if (!idStr) return toast({ kind: "err", title: "Enter a provider ID" });

        const btn = $("btnX402Call");
        if (btn.disabled) return;
        btn.disabled = true;
        const origText = btn.textContent;
        btn.textContent = "Processing…";

        try {
          const providerId = BigInt(idStr);
          const p = await state.registry.getProvider(providerId);
          if (!p.active) throw new Error("Provider is inactive");

          const price = p.pricePerCall;
          const priceFormatted = ethers.formatUnits(price, state.usdcDecimals);

          // Step 1 — REAL x402 handshake: GET the facilitator, expect HTTP 402
          let x402Terms = null;
          try {
            const fres = await fetch(CONFIG.facilitatorUrl + "/api/service");
            const fbody = await fres.json();
            if (fres.status === 402 && fbody.accepts && fbody.accepts[0]) {
              x402Terms = fbody.accepts[0];
              toast({ kind: "info", title: "⚡ x402: GET /api/service",
                detail: `→ HTTP 402 · ${x402Terms.network} · facilitator live`, timeout: 3500 });
            } else {
              toast({ kind: "info", title: "⚡ x402: facilitator responded",
                detail: `status ${fres.status} — proceeding with on-chain SLA call`, timeout: 3000 });
            }
          } catch (fe) {
            toast({ kind: "info", title: "⚡ x402: facilitator unreachable",
              detail: "proceeding with on-chain SLA call", timeout: 3000 });
          }
          await new Promise(r => setTimeout(r, 400));

          // Step 2 — EIP-3009 authorization (no approve needed)
          const now = Math.floor(Date.now() / 1000);
          const validAfter  = 0;
          const validBefore = now + 120;
          const authNonce   = ethers.hexlify(ethers.randomBytes(32));
          const requestHash = ethers.keccak256(ethers.toUtf8Bytes(payload));

          // Step 3 — Sign EIP-3009 TransferWithAuthorization (off-chain, no gas)
          btn.textContent = "Sign authorization…";
          const eip3009Domain = {
            name: "USDC",
            version: "2",
            chainId: CONFIG.chainId,
            verifyingContract: CONFIG.usdc,
          };
          const eip3009Types = {
            TransferWithAuthorization: [
              { name: "from",        type: "address" },
              { name: "to",          type: "address" },
              { name: "value",       type: "uint256" },
              { name: "validAfter",  type: "uint256" },
              { name: "validBefore", type: "uint256" },
              { name: "nonce",       type: "bytes32" },
            ],
          };
          const eip3009Value = {
            from:        state.address,
            to:          CONFIG.payPerCall,
            value:       price,
            validAfter,
            validBefore,
            nonce:       authNonce,
          };
          toast({ kind: "info", title: "⚡ x402: Sign EIP-3009", detail: "Sign the authorization in MetaMask — no gas, off-chain", timeout: 10000 });
          const rawSig = await state.signer.signTypedData(eip3009Domain, eip3009Types, eip3009Value);
          const sig = ethers.Signature.from(rawSig);

          toast({ kind: "info", title: "⚡ x402: X-Payment", detail: `amount: ${priceFormatted} USDC · EIP-3009 signed · settling to escrow`, timeout: 3000 });

          // Step 4 — POST imzayi facilitator'a, o tx'i gonderir (kullanici gas odemez)
          btn.textContent = "Settling via facilitator…";
          const tC = toast({ kind: "info", title: "⚡ x402: Facilitator settling", detail: "<span class='spinner'></span> Facilitator sending tx — no gas from you", timeout: 60000 });
          const facRes = await fetch(CONFIG.facilitatorUrl + "/callService", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              providerId: providerId.toString(),
              requestHash,
              from: state.address,
              validAfter,
              validBefore,
              authNonce,
              v: sig.v,
              r: sig.r,
              s: sig.s,
            }),
          });
          const facData = await facRes.json();
          if (!facRes.ok || !facData.success) throw new Error(facData.error || "Facilitator error");
          tC.remove();

          // facData.txHash ve facData.callId facilitator'dan geliyor
          const tx = facData.txHash ? { hash: facData.txHash, from: state.address, to: CONFIG.facilitatorUrl } : { hash: null };
          const callId = facData.callId || null;
          if (callId) {
            state.myCalls.set(callId, {
              callId, providerId, caller: state.address,
              amount: price, deadline: 0,
              startedAt: 0,
              totalSec: Number(p.maxResponseTime), status: 1,
            });
            renderCalls();
          }

          // Step 5 — Success
          state.x402TxHashes.add(tx.hash);
          pushActivity({
            type: "call",
            icon: "⚡",
            label: `x402 call → provider #${providerId}`,
            detail: `${priceFormatted} USDC · HTTP 402 flow`,
            txHash: tx.hash,
          });
          toast({
            kind: "ok",
            title: "✅ x402 call complete!",
            detail: callId ? `callId: ${callId.slice(0, 10)}…` : `tx: ${tx.hash.slice(0, 10)}…`,
            link: txLink(tx.hash),
            timeout: 8000,
          });

          btn.textContent = "✅ Done";
          setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 3000);
          await refreshAll();

        } catch (e) {
          console.error(e);
          toast({ kind: "err", title: "x402 call failed", detail: friendlyError(e) });
          btn.disabled = false;
          btn.textContent = origText;
        }
      }


      // ================================================================
      // MY ACTIVITY — unified on-chain activity log for connected wallet
      // ================================================================
      function pushActivity(item) {
        // item: {type, icon, label, txHash, time?}
        if (!item.time) item.time = Date.now();
        // dedupe by txHash + type
        const key = `${item.txHash}:${item.type}`;
        if (state.myActivity.some(a => `${a.txHash}:${a.type}` === key)) return;
        state.myActivity.push(item);
        renderActivity();
        // refresh onboarding progress
        if (typeof updateWelcomeBox === "function") updateWelcomeBox().catch(() => {});
      }

      function renderActivity() {
        const box = $("activityBox");
        if (!box) return;
        if (!state.address) {
          box.innerHTML = `<div class="empty-state">connect wallet to see your on-chain activity</div>`;
          return;
        }
        if (state.myActivity.length === 0) {
          box.innerHTML = `<div class="empty-cta"><div class="ec-icon">✨</div><div class="ec-text">No activity yet.<br>Your registrations, calls, receipts and timeouts will appear here.</div></div>`;
          $("activitySummary").textContent = "";
          return;
        }
        // newest first
        const items = [...state.myActivity].sort((a, b) => b.time - a.time);
        box.innerHTML = items.map(a => {
          const t = new Date(a.time).toLocaleTimeString("en-US", { hour12: false });
          const link = a.txHash
            ? `<a class="feed-link" href="${txLink(a.txHash)}" target="_blank" rel="noreferrer">${short(a.txHash, 4)} ↗</a>`
            : "";
          return `
            <div class="call-row">
              <div style="min-width:0;flex:1">
                <div class="head-line">
                  <span>${a.icon}</span>
                  <span class="hi">${a.label}</span>
                </div>
                ${a.detail ? `<div class="sub-line">${a.detail}</div>` : ""}
              </div>
              <div style="display:flex;gap:6px;align-items:center">
                <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-faint)">${t}</span>
                ${link}
              </div>
            </div>`;
        }).join("");
        $("activitySummary").textContent = `${state.myActivity.length} action${state.myActivity.length === 1 ? "" : "s"}`;
      }

      // Load past activity from on-chain events for the connected wallet
      async function loadActivity() {
        if (!state.address || !state.payPerCall || !state.registry) return;
        try {
          const me = state.address.toLowerCase();

          // 1. Provider registrations (owner = me)
          const regLogs = await safeQuery(state.registry, "ProviderRegistered");
          for (const l of regLogs) {
            if (l.args.owner?.toLowerCase() === me) {
              pushActivity({
                type: "register",
                icon: "🏗️",
                label: `Registered as provider #${l.args.providerId}`,
                detail: `${ethers.formatUnits(l.args.stake, state.usdcDecimals)} USDC staked`,
                txHash: l.transactionHash,
                time: Date.now() - 1, // past events slightly older
              });
            }
          }

          // 2. Calls opened (caller = me)
          const callFilter = state.payPerCall.filters.CallStarted(null, null, state.address);
          const callLogs = await safeQuery(state.payPerCall, "CallStarted", callFilter);
          for (const l of callLogs) {
            const isX402 = state.x402TxHashes.has(l.transactionHash);
            const isCCTP = state.cctpTxHashes.has(l.transactionHash);
            let icon = "📞", label = `Call opened → provider #${l.args.providerId}`;
            if (isX402) { icon = "⚡"; label = `x402 call → provider #${l.args.providerId}`; }
            if (isCCTP) { icon = "🌐"; label = `CCTP call → provider #${l.args.providerId}`; }
            pushActivity({
              type: "call",
              icon, label,
              detail: `${ethers.formatUnits(l.args.amount, state.usdcDecimals)} USDC escrowed`,
              txHash: l.transactionHash,
            });
          }

          // 3. Receipts submitted — match callId to calls where I'm the provider
          // We can only attribute receipts to ourselves if we own the called provider.
          const myProviderId = state.providerInfo?.id;
          if (myProviderId) {
            const myProviderCalls = await safeQuery(
              state.payPerCall, "CallStarted",
              state.payPerCall.filters.CallStarted(null, myProviderId)
            );
            const myCallIds = new Set(myProviderCalls.map(l => l.args.callId));
            const receiptLogs = await safeQuery(state.payPerCall, "ReceiptSubmitted");
            for (const l of receiptLogs) {
              if (myCallIds.has(l.args.callId)) {
                pushActivity({
                  type: "receipt",
                  icon: "📝",
                  label: `Receipt submitted`,
                  detail: `call ${short(l.args.callId, 6)}`,
                  txHash: l.transactionHash,
                });
              }
            }
          }

          // 4. Timeouts / slashes — calls where I was the caller
          const myCallIdSet = new Set(callLogs.map(l => l.args.callId));
          const slashLogs = await safeQuery(state.payPerCall, "CallSlashed");
          for (const l of slashLogs) {
            if (myCallIdSet.has(l.args.callId)) {
              pushActivity({
                type: "timeout",
                icon: "⚡",
                label: `Timeout claimed — provider slashed`,
                detail: `refund ${ethers.formatUnits(l.args.refunded, state.usdcDecimals)} + slash ${ethers.formatUnits(l.args.slashed, state.usdcDecimals)} USDC`,
                txHash: l.transactionHash,
              });
            }
          }

          renderActivity();
        } catch (e) {
          console.warn("loadActivity failed:", e);
        }
      }


      // ================================================================
      // ONBOARDING — welcome box for new users
      // ================================================================
      let _welcomeDismissed = false;

      async function updateWelcomeBox() {
        const box = $("welcomeBox");
        if (!box) return;
        if (_welcomeDismissed) { box.style.display = "none"; return; }

        // Determine progress
        let hasUsdc = false;
        try {
          const bal = await state.usdc.balanceOf(state.address);
          hasUsdc = bal > 0n;
        } catch {}
        const isProvider = !!state.providerInfo;
        const hasActivity = state.myActivity.length > 0;

        // If the user has done everything meaningful, hide the box
        if (isProvider && hasActivity) {
          box.style.display = "none";
          return;
        }

        box.style.display = "";

        // Step 1 — USDC
        const s1 = $("wsStep1"), n1 = $("wsNum1");
        if (hasUsdc) { s1.classList.add("done"); n1.textContent = "✓"; }
        else { s1.classList.remove("done"); n1.textContent = "1"; }

        // Step 2 — role picked (registered as provider)
        const s2 = $("wsStep2"), n2 = $("wsNum2");
        if (isProvider) { s2.classList.add("done"); n2.textContent = "✓"; }
        else { s2.classList.remove("done"); n2.textContent = "2"; }

        // Step 3 — first call / activity
        const s3 = $("wsStep3"), n3 = $("wsNum3");
        if (hasActivity) { s3.classList.add("done"); n3.textContent = "✓"; }
        else { s3.classList.remove("done"); n3.textContent = "3"; }
      }

      // Wire welcome box buttons
      (function() {
        const close = $("welcomeClose");
        if (close) close.addEventListener("click", () => {
          _welcomeDismissed = true;
          const box = $("welcomeBox");
          if (box) box.style.display = "none";
        });
        const goReg = $("wsGoRegister");
        if (goReg) goReg.addEventListener("click", () => {
          const a = $("actionRegister");
          if (a) { a.open = true; a.scrollIntoView({ behavior: "smooth", block: "center" }); }
        });
        const goCall = $("wsGoCall");
        if (goCall) goCall.addEventListener("click", () => {
          const a = $("actionCall");
          if (a) { a.open = true; a.scrollIntoView({ behavior: "smooth", block: "center" }); }
        });
      })();


      // Empty-state CTA buttons
      (function() {
        document.addEventListener("click", (e) => {
          if (e.target && e.target.id === "ecRegister") {
            const a = $("actionRegister");
            if (a) { a.open = true; a.scrollIntoView({ behavior: "smooth", block: "center" }); }
          }
        });
      })();

    
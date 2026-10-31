# F9 — stale claim sweep

Work list from the 30 Oct 2026 audit. Everything below was applied on 31 Oct 2026 in
the same commit that introduced this file; it is kept as the record of what was wrong
and what the truth was, so a later edit does not quietly restore an old sentence.

Open work list from the 30 Oct 2026 audit. Each row is a claim that contradicts
the chain, the source, or another screen. Fix the sentence; do not refactor the
file around it. Where a row shows a `cast` command, that command was the evidence.

Status legend: `[ ]` open · `[x]` fixed · `[!]` unverified, needs a decision.

## Ground truth (measured 30 Oct 2026, re-check before trusting)

Chain 5042002, RPC `https://rpc.testnet.arc.io`.

- `ServiceRegistryV8` `0x793028B6A1d1bdA063dC9dB5bC8930b856F512A3`,
  `PayPerCallV8` `0xedce61eF5be31DC22cEfE342692622A26919a7EF`,
  `SLAKeeper` `0xBe897043e4c21cFe9A6532e43542CA48EaD83CB7`,
  `DisputeV4` `0xECDb019F1E92Ad35324cc7bBDf1D56b9e70B305B`,
  `SLAEvidenceRegistryV2` `0x64872c29A19dF8E471103d0708397BAb96A311FC`,
  `USDC` `0x3600000000000000000000000000000000000000`,
  `Multicall3` `0x522fAf9A91c41c443c66765030741e4AaCe147D0`,
  owner/arbiter/appealArbiter/treasury `0xfbac99E6e32a50c14D5e2150b66dA852f22B06Da`.
- `nextProviderId()` = 3. `minStake()` = `10000000` (10 USDC).
- Provider 1: stake `7485694`, price `1000000`, completed `6`, slashed `9`,
  `maxConcurrentCalls` `10`, `zkTier` `0`, active, terms v1
  (`maxResponseTime` 120, `slashBps` 2000, `availabilityTargetBps` 9950),
  endpoint `https://arcsla.vercel.app/api/auto-receipt`.
  Provider 2: exists, inactive, 0 calls.
- Honour rate = `completed/(completed+slashed)` = 40 %. Registry score =
  `floor((completed+2)*100/(completed+slashed+3))` = 44 (empty record 66).
  `ServiceRegistryV8` has **no** `getReputationScore`; the score is app-side
  (`src/components/panels/providerMetrics.ts:41`).
- `DisputeV4`: `disputeCount()` = 2, both `Upheld`, both `settled = false`.
  Pending call is `finalize(id)`, not `reclaimExpiredBond`. Windows:
  id 1 `1793389671`, id 2 `1793389631` (both open now).
- `SLAEvidenceRegistryV2.modeOf`: `witness` 2, `zk-constraint` 2,
  `zk-execution` 2, `tee-attestation` 0 (no enclave quote; Phala `$0` balance).
- Indexer is The Graph Studio `onur/1.0.0`. It never reports
  `maxConcurrentCalls` correctly and has no NFT fields. Goldsky v8 abandoned.
- v8 has no NFT, no ERC-8004 identity binding, no `registerV2`.
- `PayPerCallV8.claimable(owner)` = `26771055`;
  `USDC.balanceOf(Multicall3)` = `6206779`.

## Docs

Verified 31 Oct 2026: every row below was re-read in the current tree. Seven needed an edit
and landed with this commit (README test counts and retired-feature labels, `V8_DEPLOYMENT.md`
§14.4 stake reconciliation, `V7_V8_PANEL_MIGRATION.md` claimable, `audit.md` lint baseline and
panel count, `SLA_COVERAGE.md` stake reconciliation); the rest were already fixed by `72386b0`.


- [x] `AGENTS.md:159` "v8 provider 1 … 8 USDC stake (one timeout drill slashed 2)"
      → 7.485694 USDC, nine slashed calls.
- [x] `AGENTS.md:90` "`getProvider` returns a 9-field tuple" → read
      `REGISTRY_ABI_V8` in `src/lib/config.ts`; the v8 view has 11 fields.
- [x] `AGENTS.md:88` `submitReceipt` quoted with four args → v8 takes five,
      including `uint32 termsVersion` (`contracts/PayPerCallV8.sol:200`).
- [x] `AGENTS.md:92-94` "domain `ArcSLA` version `1`" and "ARCHITECTURE.md §4 is
      stale" → v8 domain is `ArcSLA/2`, and §4 already documents it.
- [x] `README.md:161` "25 behaviours … 22 PASS … 3 PARTIAL (finalize,
      reclaimExpiredBond)" → recount from `docs/SLA_COVERAGE.md`
      (29 rows, 27 PASS, 2 PARTIAL: B8 and B3b; `finalize` is PASS).
- [x] `README.md:155,660` keeper "every 15 minutes" → measured 3–6 h
      (`docs/SLA_COVERAGE.md:26`, `docs/decisions.md:319`).
- [x] `README.md:41` "Reputation score | Onchain (ERC-8004)" → computed off-chain.
- [x] `README.md:43,279,605` "Circle Refund Protocol (DisputeQuality)" as live →
      retired; dispute path is `DisputeV4`.
- [x] `README.md:354` "Register with NFT (v2)" instructions → path deleted.
- [x] `README.md:407` "Admin Panel — contract owner tools" → read-only card.
- [x] `README.md:553,623,662,687` four different test counts → one measured
      figure, dated, or point at the gate command.
- [x] `README.md:66` DisputeV2 "open disputes only" → settled, no open disputes.
- [x] `ARCHITECTURE.md:68-80` Provider struct missing `maxConcurrentCalls`,
      `zkTier`, `deactivatedAt`, `pendingCalls`; counters are uint64; window and
      slash ratio live in `getTerms` (`contracts/ServiceRegistryV8.sol:62`).
- [x] `ARCHITECTURE.md:158` `getReputationScore` as shipped → remove.
- [x] `ARCHITECTURE.md:203` gas table "at 40 gwei" → live figure is ~533–547 gwei.
- [x] `SECURITY.md:43` "caller spam not prevented" → v8 caps open calls per
      `(providerId, caller)` via `maxConcurrentCalls`.
- [x] `SECURITY.md:52` digest `keccak256(callId, responseHash)` → full EIP-712
      digest over `callId, responseHash, respondedAt, termsVersion`.
- [x] `SECURITY.md:67` "no address has privileged slash power" → admin can
      `authorizeSlasher`/`revokeSlasher`; owner is arbiter and treasury.
- [x] `SECURITY.md:79` "0.8.24 … 2^32" → compiler 0.8.37, counters uint64.
- [x] `SECURITY.md:105` "57 unit tests", "no fork tests" → current counts;
      `test/DisputeV4ForkEvidence.t.sol` exists.
- [x] `DEPLOY.md:214` "§6 has the cast calls" → reads are §7, smoke §14.4,
      dispute settlement §14.7.
- [x] `docs/PARTNERSHIP-BRIEF.md:48,67` "1 USDC stake / ~2 USDC" →
      `minStake` is 10 USDC.
- [x] `docs/PARTNERSHIP-BRIEF.md:63,95,147` reference `scripts/arkreen-register.js`
      and `scripts/tlay-boat-call.js`, neither exists.
- [x] `docs/verification/ATTESTOR_SCOPE.md:42` "no dispute opened on DisputeV4" →
      two exist.
- [x] `docs/verification/ATTESTOR_SCOPE.md:217` "dispute 1 is open" → Upheld,
      `finalize(1)` pending.
- [x] `docs/verification/ATTESTOR_SCOPE.md:3` "two of four kinds have no verifier"
      → only `tee-attestation`; contradicts its own table at line 14.
- [x] `docs/verification/DESIGN.md:27` "witness and tee-attestation at mode 0"
      → `witness` is mode 2 (`SLAProvenanceAdapter`).
- [x] `docs/V8_DEPLOYMENT.md:802` "modeOf(witness) and modeOf(tee-attestation) are 0"
      → `witness` is 2.
- [x] `docs/V8_DEPLOYMENT.md:842` `setSignatureVerifier(keccak256("witness"), …)`
      as the path → a signature key reaches mode 1, which `DisputeV4` records as
      `ModeIsSignature`; the deployed path is the proof adapter.
- [x] `docs/V8_DEPLOYMENT.md:227` "`nextProviderId()` is 2" → 3.
- [x] `docs/V8_DEPLOYMENT.md:229` "8 USDC stake after one drill slashed 2" →
      7.485694 after nine.
- [x] `docs/V8_DEPLOYMENT.md:149` provider-page word indices ("active at word 5")
      → the file decodes named fields now.
- [x] `docs/V8_DEPLOYMENT.md:429` and `docs/SLA_COVERAGE.md:129` "53.732480 USDC
      stake on 25 Oct" — does not reconcile with the 16.04 → 12.83 → 9.24 → 7.49
      sequence; tx `0xd7429d93…` moves `5373248` out. Needs a decision.
- [x] `docs/SLA_COVERAGE.md:5` scope lists `DisputeV2` as the dispute layer →
      `DisputeV4`.
- [x] `docs/SLA_COVERAGE.md:191` "next work: B8 — run `finalize(4)`" → ran 28 Oct
      (tx `0xbdaf9525…f6167`, block 69473913).
- [x] `docs/decisions.md:375-377` V3 kept "because dispute #4's 3.481864 USDC
      escrow lives there" → finalized, V3 holds nothing.
- [x] `docs/verification/REPORT.md:162` "evidence is advisory today" →
      `DisputeV4` snapshots and binds it in `openDispute`.
- [x] `docs/V7_V8_PANEL_MIGRATION.md:38,149` `claimable(owner)` `17527733` →
      `26771055`.
- [x] `docs/V7_V8_PANEL_MIGRATION.md:189` `USDC.balanceOf(helper)` `6173464` →
      `6206779`.

## Frontend

- [ ] `src/marketing/Landing.tsx:482` "starts at 67%" → 66 %.
- [ ] `src/lib/landing/stats.ts:71` rounds to 67 while panels floor to 66.
- [ ] `src/marketing/Providers.tsx:37` header "Honor rate" carries the score
      formula → either rename to "Registry score" or use `completed/(completed+slashed)`.
- [ ] `src/marketing/Providers.tsx:24` "every active provider, ranked by honour
      rate" → the table includes inactive rows.
- [ ] `src/lib/landing/claims.ts:65`, `Landing.tsx:109` "three MCP servers read the
      subgraph" → only `mcp-server.js` honours `SUBGRAPH_URL`.
- [ ] `src/lib/subgraph.ts:80` queries request `nftTokenId`/`nftBound` → the
      indexer has no such fields.
- [ ] `src/components/panels/Overview.tsx:67` `Math.round` score with a comment
      claiming parity → floor (provider 2 must read 66).
- [ ] `src/components/panels/Overview.tsx:51` `OPEN_STATES` includes `OPEN`,
      `PENDING` → the indexer only emits `STARTED`.
- [ ] `src/components/panels/Overview.tsx:1039` label "Active v7 deployment
      addresses" → these are the v8 `ACTIVE_*` rows.
- [ ] `src/components/panels/Marketplace.tsx:146`,
      `Leaderboard.tsx:167,262`, `ProviderProfile.tsx:314` attribute the score to
      a registry function that does not exist.
- [ ] `src/components/panels/ApiDocs.tsx` documents `/api/health` (:7),
      `/api/nano-balance` (:11), `/api/mcp-server` (:15,34,124) — none exist.
- [ ] `src/components/panels/Nano.tsx:40` fetches `/api/nano-balance` → route is
      `/nano/balance`.
- [ ] `src/components/panels/Nano.tsx:209-210` prices swapped: energy-data is
      0.01 USDC, premium-report 0.001 USDC.
- [ ] `src/components/panels/Nano.tsx:198` "Call /nano/service" → rewrite is
      `/nano/call`.
- [ ] `src/components/panels/ApiDocs.tsx:52,126` "ERC-8004 agent identity" → the
      v8 `register` flow mints nothing.
- [ ] `src/components/panels/Attestation.tsx:110` "CCIP-ready · Chainlink
      broadcast" → `contracts/SLAAttestationBridge.sol:69` states no CCIP.
- [ ] `src/components/panels/Quality.tsx:90` ">10 USDC minimum stake" →
      `minVoterStake` is 1 USDC.
- [ ] `src/components/panels/Quality.tsx:72` presents arbitration as live →
      `disputeQualityEnabled: false`.
- [ ] `src/marketing/Docs.tsx:5,6,10,12,52` same missing endpoints, the wrong
      `/api/marketplace` fields, "cross-chain attestation", and the wrong
      `call-service` request/response shape.

## Not claims, but open

- [ ] `finalize(1)` and `finalize(2)` on `DisputeV4` — owner TTY, windows open.
      Runbook: `docs/V8_DEPLOYMENT.md` §14.7.
- [!] Test/gate counts in `README.md`, `docs/SLA_P0_DESIGN.md`,
      `docs/verification/REPORT.md`, `docs/V7_V8_PANEL_MIGRATION.md`: re-measure
      instead of copying a number.
- [!] `docs/SLA_P0_DESIGN.md`, `docs/progress.md`, `docs/audit.md`,
      `docs/v2-*.md`, `SPEC.md`: never audited line by line.
- [!] `src/marketing/About.tsx:33` "sub-second finality" and
      `AppFooter.tsx:14` faucet link: no repo evidence either way.

## Gates

Same three as CI: `bun run check`, `bun test tests/`, `forge test`.
Measured 30 Oct 2026: `bun run check` clean, `bun test tests/` 603 tests /
596 pass / 7 skip / 0 fail, `forge test` 621 pass / 30 suites.

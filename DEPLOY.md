# Deploy — Step 4 Guide

> **The active deployment is v8.** `script/DeployV8.s.sol` deploys
> `ServiceRegistryV8`, `PayPerCallV8`, `SLAKeeper` and `DisputeV2`, then wires them;
> the runbook, the addresses and the wiring transactions are in
> `docs/V8_DEPLOYMENT.md` §7. This guide covers the earlier v7 pair
> (`script/Deploy.s.sol`), which is still deployed and read-only — the frontend's
> `V7Cleanup` panel is the only write path left to it. Read this to understand the
> mechanics, not to redeploy what the app uses.

We are deploying contracts to Arc Testnet using a hybrid approach:

- **Main wallet** → deployer (contract owner), encrypted keystore
- **Throwaway wallet** → for subsequent test/dev, in `.env`

---

## 1. Get USDC for Main Wallet

Deployment consumes gas (on Arc, USDC = native gas).

Get your main wallet address, go to [faucet.circle.com](https://faucet.circle.com), select **Arc Testnet**, paste address, get 20 USDC.

Required: ~1 USDC (gas). 20 USDC is plenty.

---

## 2. Import Main Wallet into Foundry Keystore (One-time)

This operation encrypts the main wallet's private key and saves it to `~/.foundry/keystores/main`. It never appears as plain text in `.env`.

```bash
cast wallet import main --interactive
```

It will ask:

1. **Private key** — copy your main wallet's private key from Metamask, paste (no echo in terminal)
2. **Password** — set a strong password. You'll be prompted for this on every deploy. Don't forget, cannot be recovered.

Output:

```
`main` keystore was saved successfully. Address: 0x...
```

Verify the displayed address matches your main wallet.

**Encrypted key location:** `~/.foundry/keystores/main` (WSL). Never share this file — it's much more secure than plain private key.

**To undo:** `rm ~/.foundry/keystores/main`

---

## 3. Update `.env` for Deployment

Open `.env` file and ensure these lines exist:

```bash
# Required for deployment
USDC_ADDRESS=0x3600000000000000000000000000000000000000
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.io

# For subsequent steps (throwaway key added in Step 2)
PRIVATE_KEY=0x...throwaway...

# To fill after deployment (these are the v7 names; v8 uses the _V8 suffix)
SERVICE_REGISTRY=
PAY_PER_CALL=
```

`USDC_ADDRESS` is Arc's native USDC system contract. `.env.example` already has the default value.

---

## 4. Dry-run (Optional but Recommended)

Before actually deploying, simulate — see what will happen, get gas estimate:

```bash
source .env

forge script script/Deploy.s.sol:Deploy \
  --account main \
  --sender <MAIN_WALLET_ADDRESS> \
  --rpc-url arc_testnet
```

Replace `<MAIN_WALLET_ADDRESS>` with your address (starting with `0x`). This is what `cast wallet import` showed.

Without `--broadcast`, no real tx is sent. It will ask for password (needed for simulation), then console will show:

```
== Logs ==
  Deployer       : 0xYOUR_ADDRESS
  USDC           : 0x3600000000000000000000000000000000000000
  Min stake      : 10000000 (6 decimals)
  ServiceRegistry: 0x... (preview)
  PayPerCall     : 0x... (preview)
  Wired PayPerCall -> ServiceRegistry
```

**Green light criteria:**

- Is deployer address correct? (main wallet)
- Is USDC address correct? (`0x3600...0000`)
- Do you see the "Wired..." line?

If all good, proceed to next step.

---

## 5. Actual Deployment

Add `--broadcast` to send real txs:

```bash
forge script script/Deploy.s.sol:Deploy \
  --account main \
  --sender <MAIN_WALLET_ADDRESS> \
  --rpc-url arc_testnet \
  --broadcast
```

It will ask for password. 4 txs are sent:

1. `ServiceRegistry` deploy
2. `PayPerCall` deploy
3. `registry.setPayPerCall(payPerCall)` call
4. `CrossChainReceiver` deploy

Thanks to Arc's sub-second finality, this finishes in 3-5 seconds. **Copy** the contract addresses from output and write them to `.env`:

```bash
SERVICE_REGISTRY=0x...
PAY_PER_CALL=0x...
```

The addresses the app reads are not env-driven on every path: `api/_contracts.js` and
`src/lib/config.ts` pin them, so a redeploy also means editing those two files. `.env`
alone moves nothing that ships.

Also, the `broadcast/` directory will automatically save tx hashes — view them on Arcscan:

```
https://testnet.arcscan.app/tx/<TX_HASH>
https://testnet.arcscan.app/address/<CONTRACT_ADDRESS>
```

---

## 6. Post-deployment Verification

In WSL, run a quick `cast` command to verify contract works:

```bash
source .env

# Is ServiceRegistry's admin the main wallet?
cast call $SERVICE_REGISTRY "admin()(address)" --rpc-url arc_testnet

# Is payPerCall correctly set?
cast call $SERVICE_REGISTRY "payPerCall()(address)" --rpc-url arc_testnet

# Is PayPerCall's registry correct?
cast call $PAY_PER_CALL "registry()(address)" --rpc-url arc_testnet
```

Expected results:

- First output = your main wallet address
- Second output = `PAY_PER_CALL`
- Third output = `SERVICE_REGISTRY`

If all three are correct, **deployment succeeded**.

---

## 6b. Auxiliary contract deploys

The per-feature contracts have their own scripts under `script/`:

- `DeployReputationLoan.s.sol`, `DeploySLAFutures.s.sol`, `DeployAgentWallet.s.sol`,
  `DeployQuality.s.sol` (DisputeQuality), `DeploySLABridge.s.sol`.
- `DeployDispute.s.sol` — base `Dispute` arbitration. It deploys the contract **and**
  calls `setPayPerCall(PAY_PER_CALL)` in the same run (arbiter = `DEPLOYER` wallet).
  This wiring is **required**: without it `openDispute` reverts, since disputes must
  bind to a verified on-chain call.

```bash
PAY_PER_CALL=$PAY_PER_CALL_ADDRESS DEPLOYER=$MAIN_WALLET_ADDRESS \
  forge script script/DeployDispute.s.sol:DeployDispute \
  --account main --sender $MAIN_WALLET_ADDRESS \
  --rpc-url arc_testnet --broadcast
```

---

## 7. Troubleshooting

- **`Error: signer is not authorized`** → `--sender` address doesn't match the address in `main` keystore. Check with `cast wallet list`.
- **`Error: insufficient funds`** → Main wallet lacks USDC. Get more from faucet.
- **`Error: no such keystore`** → You skipped Step 2; add with `cast wallet import main --interactive`.
- **`Bytes.sol` fails to compile** → the toolchain is Solidity 0.8.37 with `via_ir` and `evm_version = "cancun"`; OpenZeppelin v5.6 needs `mcopy`. Do **not** pass `--evm-version paris`: Arc accepts Cancun bytecode, and the Paris codepath does not compile.
- **Dry-run works but hangs with `--broadcast`** → RPC endpoint may be slow. Wait 30 seconds, Ctrl+C, retry.

---

## 8. After Deployment

Run the gates before anything else: `bun run check`, `bun test tests/`, `forge test`.
Then set the new addresses in the frontend (`src/lib/config.ts`), the server routes
(`api/_contracts.js`) and the Vercel project env, and read back the wiring on chain —
`docs/V8_DEPLOYMENT.md` §7 has the read-back `cast` calls for the v8 pair, §14.4 the smoke
tests that follow, and §14.7 the dispute settlement calls.

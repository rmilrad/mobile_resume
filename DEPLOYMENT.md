# PitchMarket — Live Testnet Deployment

**Network:** Base Sepolia (chainId `84532`) · **Explorer:** https://sepolia.basescan.org
**Deployed:** 2026-06-13 · ⚠️ Testnet / mock USDC only — no real value.

## 🔴 Live web app — https://mobileresume.vercel.app

Hosted on Vercel, fully interactive, no backend required: the web app runs the
sim **in the browser** (`NEXT_PUBLIC_DEMO=1`, see `apps/web/src/lib/demoEngine.ts`)
so it's a self-contained static-style deployment.

**Vercel project config** (set once, via dashboard or API):
- Root Directory: `apps/web` (Vercel installs from the pnpm-workspace root and builds the Next app)
- Framework: Next.js · Output/Build/Install: defaults
- Build env: `NEXT_PUBLIC_DEMO=1`

Redeploy: `vercel deploy --prod --yes --scope <team>` from the repo root.

## Core contracts

| Contract | Address |
|----------|---------|
| MockUSDC | [`0x68Fb3A4eF25f107D315135D880744bD0f9699fAf`](https://sepolia.basescan.org/address/0x68Fb3A4eF25f107D315135D880744bD0f9699fAf) |
| Resolver (dispute window 600s) | [`0x25FbaBC293Bfe6Ce21718D1275A23Cc3147978F9`](https://sepolia.basescan.org/address/0x25FbaBC293Bfe6Ce21718D1275A23Cc3147978F9) |
| MarketFactory | [`0x46eD0533Ad205336df88E725B0b37348fCD9f314`](https://sepolia.basescan.org/address/0x46eD0533Ad205336df88E725B0b37348fCD9f314) |

## Sample market — player 154 (Messi), fixture 1

| Item | Address / value |
|------|-----------------|
| Market | [`0x61578452392837dd354D01CaB40DaDEf37c8ccB5`](https://sepolia.basescan.org/address/0x61578452392837dd354D01CaB40DaDEf37c8ccB5) |
| LONG token | `0xdEAF17479897b246cab33959Ab889bCa967B75B3` |
| SHORT token | `0x75DeA28Ce30D67B11b2DEABa33DA4021C46CfF6E` |
| Seed liquidity | 1000 USDC (1000 LONG + 1000 SHORT) |

## Verified onchain end-to-end cycle

Every step below was executed as a real transaction on Base Sepolia:

1. **Deploy** — MockUSDC + Resolver + MarketFactory.
2. **Create market** — factory pulled 1000 USDC seed, minted 1000 LONG + 1000 SHORT
   into the FPMM. Opening price `priceLong18 = 5e17` → **$0.50**.
3. **Faucet** — trader minted 100 mock USDC (public faucet path, ≤10k cap).
4. **Quote parity** — `calcBuy(LONG, 100 USDC)` returned
   `190909090909090909091`, **byte-for-byte identical** to the cross-language
   parity test (`packages/contracts/test/PitchMarket.t.sol::test_parity_calcBuy_exact`).
5. **Buy** — trader approved + bought LONG for 100 USDC, received exactly
   `190909090909090909091` LONG. Price moved **$0.50 → $0.5475**.
6. **Collateralization invariant (onchain)** — market USDC held `1.1e9` ==
   `requiredCollateral()` `1.1e9`. Fully collateralized.
7. **Resolve** — owner proposed PS=72 (v1) → 600s dispute window → `finalizeScore`
   → market phase `RESOLVED`.
8. **Redeem** — trader redeemed LONG at PS/100; `190.909 LONG × 0.72 ≈ 137.45 USDC`
   (paid 100, +37% as PS settled above the $0.50 entry).

## Connect the web app to this deployment

```bash
cp apps/web/.env.local.example apps/web/.env.local   # addresses are pre-filled
pnpm dev:web
```

Setting `NEXT_PUBLIC_FACTORY_ADDRESS` flips the app from the localStorage demo
wallet to the real Coinbase Smart Wallet path against these contracts.

## Redeploy

```bash
cd packages/contracts
export DEPLOYER_PRIVATE_KEY=0x...        # funded Base Sepolia key
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
```

Addresses are recorded in [`packages/contracts/deployments/base-sepolia.json`](packages/contracts/deployments/base-sepolia.json).

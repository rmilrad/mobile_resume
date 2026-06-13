# PitchMarket ⚽📈

**Real-time soccer athlete-performance prediction market on Base.**

Go **long** or **short** on the live performance of individual World Cup players.
Each `(player, fixture)` is a market; live match data is distilled into a
**Performance Score `PS ∈ [0,100]`**, and the "price of an athlete" is the live
price of their LONG token (0–1 USDC), settling to `PS/100` after the match.

> ⚠️ **Testnet / play-money MVP.** Runs on Base Sepolia with mock USDC. No real
> money — a real-money market on athlete performance is a regulated product and
> is out of scope until legal review. See `docs/PRD-TDD.md`.

## What's here

| Package | What |
|---------|------|
| `packages/shared` | PS formula engine, BigInt **FPMM market model**, and a **game + price simulation engine** (the heart, heavily tested). |
| `packages/contracts` | Foundry/Solidity: `MockUSDC`, `OutcomeToken`, `Market` (FPMM + scalar settlement), `MarketFactory`, `Resolver`. |
| `apps/backend` | API-Football mapping, oracle keeper, live sim engine, REST + SSE API. |
| `apps/web` | Next.js mobile-first UI (Polymarket/Robinhood-style) + wallet abstraction (demo wallet; OnchainKit/Smart-Wallet path provided). |

## Design in one paragraph

A market is a **scalar LONG/SHORT complete-set** system: depositing 1 USDC mints
`1 LONG + 1 SHORT`, so the vault is **always fully collateralized**. A Gnosis-style
**Fixed Product Market Maker** gives continuous prices in `(0,1)`. After the match
the oracle posts `PS`; `LONG` redeems `PS/100`, `SHORT` redeems `(100−PS)/100`.
The Solidity `Market` mirrors `packages/shared/src/market/fpmm.ts` exactly (there's
a cross-language parity test). Full rationale: `docs/PRD-TDD.md`.

## Quickstart

```bash
pnpm install

# 1) Run everything (TS unit tests: shared + backend + web)
pnpm test

# 2) Contract tests (unit + fuzz + invariants) — needs Foundry
pnpm test:contracts

# 3) See games & price fluctuations modeled with fake data
pnpm sim 50

# 4) Run the app locally (two terminals)
pnpm dev:backend           # http://localhost:4000 (sim mode, no API key needed)
pnpm dev:web               # http://localhost:3000
```

The backend runs in **sim mode** by default: it spins up live "World Cup" fixtures,
advances them through simulated match timelines, and streams moving prices over SSE —
so the whole app is usable with **zero external dependencies or API keys**.

## Testing philosophy (TDD)

Tests were written first and the system is validated with **large volumes of
synthetic data**:

- **PS engine** — six worked examples + property tests (5,000 randomized stat lines).
- **FPMM model** — 10,000 random trades stay fully collateralized & price-bounded.
- **Simulation** — **800 markets / ~180k trades** across 200 games stay
  collateralized; prices converge toward `PS/100`.
- **Contracts** — 21 unit/fuzz tests + 4 stateful invariants (2,048 calls each):
  collateralization, price bounds, supply parity, reserve sanity.
- **Backend** — API-Football mapping (recorded JSON), keeper logic, supertest API.
- **Web** — trade/P&L math, formatting, wallet state machine.

Totals: **92 tests** (67 TS + 25 Solidity), all green.

## Deploy contracts (Base Sepolia)

```bash
cd packages/contracts
export DEPLOYER_PRIVATE_KEY=0x...        # testnet key
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
# then re-export ABIs into packages/shared/src/abis (see packages/contracts/README.md)
```

## Going to real wallets / on-chain

The web app uses a small `WalletContext` (balance / faucet / buy / positions /
redeem). The default is a localStorage **demo wallet**. To use real Coinbase
Smart Wallet + sponsored gas on Base, follow
`apps/web/src/wallet/onchainkit.tsx.example` — the screens don't change.

## Spec

The full PRD/TDD (market design, formula, oracle, gaps, roadmap) is in
[`docs/PRD-TDD.md`](docs/PRD-TDD.md).

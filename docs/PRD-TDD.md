# PitchMarket — PRD / TDD

**Real-time soccer athlete-performance prediction market on Base.**

> **Status:** Build-ready specification (v1.0)
> **Audience:** The coding agent that will implement this product, plus human reviewers.
> **Golden rule:** _Always prefer the simplest workable solution._ Write tests first
> (red → green → refactor). Do not add scope that is not in this document; if a decision
> is genuinely missing, choose the simplest option and note it in code comments.

---

## 0. TL;DR (read this first)

PitchMarket lets users go **long** or **short** on the live, real-time performance of
individual soccer players during a match. Each `(player, fixture)` pair is a **market**.
Live World Cup data (goals, assists, passes, tackles, etc., from **API-Football**) is
distilled into a single **Performance Score `PS ∈ [0,100]`**. The "price of an athlete"
is the live market price of their **LONG** token, which trades continuously in `(0,1)` USDC
and settles to `PS/100` USDC after the match.

- **Chain:** Base. **MVP runs on Base Sepolia testnet with mock USDC** (no real money → no
  legal/licensing blockers). Same code path promotes to Base mainnet later.
- **Market design:** scalar **LONG/SHORT complete-set market** + a Gnosis-style **Fixed
  Product Market Maker (FPMM)**. Always fully collateralized.
- **Oracle:** trusted project keeper posts `PS` after the match, behind a dispute/timelock
  window. (Chainlink Functions / UMA is the documented future upgrade.)
- **Wallet/UX:** Coinbase **Smart Wallet + OnchainKit** — passkey login, **sponsored gas**
  (Base Paymaster), batched approve+trade, USDC onramp/faucet. UI mimics
  Polymarket/Robinhood/Coinbase/Kalshi, mobile-first.
- **Stack:** Foundry (Solidity) · Next.js + wagmi/viem + OnchainKit · Node/TS backend
  (indexer + oracle keeper + API) · pnpm monorepo · TDD everywhere (Foundry + Vitest).

> ⚠️ **Legal framing (non-negotiable for MVP):** A real-money market on athlete performance
> is a regulated derivative/gambling product (KYC, geofencing, licensing). The MVP is
> **testnet + mock USDC only**. No real-value transfer. All marketing/UI must say
> "testnet / play-money demo." Mainnet is gated on legal review and is out of MVP scope.

---

## 1. Product Requirements (PRD)

### 1.1 Vision
A consumer-grade, real-time prediction market for individual athlete performance — "trade a
player like a stock during the game." Start with an MVP for World Cup soccer players.

### 1.2 Target user & jobs-to-be-done
- **Casual sports fan / crypto-curious user:** "I think Mbappé will have a big game — let me go
  long," or "this defender is having a rough match — short him." Wants Robinhood-easy UX, no
  seed phrases, no gas headaches.
- **JTBD:** browse live/upcoming games → pick a player → go long/short with USDC → watch the
  price move with the match → settle and see P&L.

### 1.3 MVP scope (in)
1. Browse **live** and **upcoming** World Cup fixtures.
2. Search players / teams; view a player's market for an upcoming or live fixture.
3. Per `(player, fixture)` market with continuous LONG/SHORT pricing.
4. Buy/sell LONG or SHORT with (mock) USDC; pre-game bidding + live trading.
5. Live price + live stat feed + PS breakdown on the player screen.
6. Portfolio with live mark-to-market P&L; redeem after settlement.
7. Smart Wallet onboarding (passkey), sponsored gas, USDC faucet/onramp.
8. Oracle settlement: keeper posts final `PS`; users redeem.

### 1.4 MVP scope (out — explicitly deferred)
- Real money / mainnet, KYC, geofencing, licensing.
- Order book / limit orders (FPMM only).
- Cross-game "season" tokens, parlays, social features, leaderboards.
- Trust-minimized oracle (Chainlink/UMA), DAO governance.
- Sports other than soccer; leagues other than the World Cup.
- Native mobile apps (responsive web only).

### 1.5 Success criteria for the MVP
- A user can complete the full loop (connect → fund via faucet → trade → see live price move →
  redeem) on Base Sepolia against a real (or replayed) World Cup fixture.
- Contracts pass Foundry unit + fuzz invariant tests (100% of the invariants in §4.6).
- Shared PS engine passes all worked-example tests in §3.
- All `pnpm test` green in CI.

### 1.6 Non-functional requirements
- **Latency:** live price/stat updates visible within ≤ 10 s of source data (API-Football poll
  interval permitting).
- **Solvency:** the market vault is **always** fully collateralized (enforced by invariant
  tests). No protocol-as-counterparty exposure.
- **Determinism:** `PS` is a pure function of a fixed stat input + formula version.
- **Resilience:** API-Football outage must not corrupt state; settlement only on confirmed
  final stats.

---

## 2. System Architecture

### 2.1 Components
```
                    ┌──────────────────────────────────────────────┐
                    │                API-Football                  │
                    │     (fixtures, lineups, live statistics)     │
                    └───────────────────┬──────────────────────────┘
                                        │ poll (REST)
                                        ▼
┌───────────────┐   events   ┌───────────────────────────┐   tx (PS)   ┌──────────────────┐
│  Base Sepolia │◀──────────▶│   Backend (Node/TS)        │────────────▶│  Resolver (chain)│
│  contracts    │  index     │  • API-Football client     │  postScore  │                  │
│  • MarketFactory          │  • Indexer (viem watch)    │             └──────────────────┘
│  • Market (FPMM+vault)     │  • PS engine (shared pkg)  │
│  • Outcome tokens          │  • Oracle keeper           │
│  • Resolver                │  • REST/tRPC + SSE API     │
│  • MockUSDC                │  • DB (SQLite/Postgres)    │
└───────▲───────┘            └───────────────┬────────────┘
        │ read/trade (wagmi/viem)            │ REST + SSE (prices, stats, markets)
        │                                    ▼
        │                          ┌───────────────────────────┐
        └──────────────────────────│   Frontend (Next.js)      │
           Smart Wallet + Paymaster │  OnchainKit · wagmi/viem  │
                                    │  mobile-first PWA-style UI │
                                    └───────────────────────────┘
```

### 2.2 Data ownership
- **Source of truth for money/positions:** the chain (contracts).
- **Source of truth for sports facts / PS inputs:** API-Football, snapshotted by the backend.
- **Derived/served by backend:** market list, price history, live stats, PS breakdown,
  portfolio P&L (read-mostly; the frontend can also read chain directly via viem for trust).

### 2.3 Monorepo layout (pnpm workspaces)
```
pitchmarket/
├─ package.json                 # workspace root, scripts: test, lint, build
├─ pnpm-workspace.yaml
├─ packages/
│  ├─ shared/                   # PS engine + shared TS types + ABIs (single source of truth)
│  │  ├─ src/ps/                #   performance score formula (v1)
│  │  ├─ src/types/            #   Fixture, Player, Market, StatLine, Position...
│  │  └─ src/abis/             #   generated ABIs consumed by web + backend
│  └─ contracts/               # Foundry project (Solidity)
│     ├─ src/                  #   MockUSDC, OutcomeToken, Market, MarketFactory, Resolver
│     ├─ test/                 #   forge tests (unit + fuzz/invariant)
│     └─ script/              #   deploy scripts
├─ apps/
│  ├─ web/                     # Next.js (App Router) frontend
│  └─ backend/                 # Node/TS: indexer + oracle keeper + API
└─ docs/PRD-TDD.md             # this document
```
> **Simplicity note:** `packages/contracts` is a Foundry project; the rest is TS. Use
> `forge build` to emit ABIs into `packages/shared/src/abis` so web/backend never hand-copy.

---

## 3. Performance Score (`PS`) — formula spec v1

`PS` is the single scalar (0–100) that settles a market. It is computed **off-chain** in the
shared TS package (`packages/shared/src/ps`) so it is identical in the backend (for posting)
and in tests. **Only the final `PS` is posted on-chain.** This keeps contracts dead-simple.

### 3.1 Inputs (`StatLine`)
Per player per fixture, from API-Football `fixtures/players` (all default to 0 if absent):

| Field            | Type   | Notes |
|------------------|--------|-------|
| `minutes`        | number | minutes played |
| `position`       | enum   | `GK | DEF | MID | FWD` (from lineup) |
| `goals`          | number | |
| `assists`        | number | |
| `shots`          | number | total shots |
| `shotsOnTarget`  | number | |
| `keyPasses`      | number | passes leading to a shot |
| `passes`         | number | total passes |
| `passAccuracy`   | number | 0–100 (%) |
| `touches`        | number | |
| `dribblesSucc`   | number | successful dribbles |
| `tackles`        | number | |
| `interceptions`  | number | |
| `clearances`     | number | |
| `duelsWon`       | number | |
| `saves`          | number | GK |
| `penScored`      | number | penalties scored |
| `penMissed`      | number | penalties missed |
| `penWon`         | number | penalties won (drawn) |
| `foulsCommitted` | number | |
| `yellow`         | number | 0/1 |
| `red`            | number | 0/1 |
| `ownGoals`       | number | |

### 3.2 Raw rating
`raw = BASE + Σ (weight_i × stat_i)`, where `BASE = 6.0` (start every player at a neutral 6/10
like SofaScore). Weights are **position-aware**: each position has its own weight table so a
defender's score rewards defensive actions and a forward's rewards attacking output.

**Universal weights (apply to all positions):**
| Stat | Weight |
|------|--------|
| goals | +2.50 |
| assists | +1.50 |
| penScored | +1.50 |
| penWon | +0.75 |
| penMissed | −1.50 |
| ownGoals | −2.00 |
| yellow | −0.50 |
| red | −2.00 |
| foulsCommitted | −0.05 |
| dribblesSucc | +0.10 |
| duelsWon | +0.05 |

**Position-specific weights:**
| Stat | GK | DEF | MID | FWD |
|------|----|----|----|----|
| shotsOnTarget | +0.10 | +0.20 | +0.25 | +0.30 |
| shots (non-OT) | 0 | +0.05 | +0.05 | +0.10 |
| keyPasses | +0.10 | +0.20 | +0.30 | +0.25 |
| passes (per 10) | +0.05 | +0.10 | +0.15 | +0.05 |
| passAccuracy (per %>70) | +0.01 | +0.02 | +0.03 | +0.01 |
| touches (per 10) | +0.02 | +0.03 | +0.04 | +0.03 |
| tackles | +0.05 | +0.30 | +0.20 | +0.05 |
| interceptions | +0.05 | +0.30 | +0.20 | +0.05 |
| clearances | +0.05 | +0.20 | +0.05 | 0 |
| saves | +0.60 | +0.10 | 0 | 0 |

Notes on the "per X" rows: `passes` contributes `weight × floor(passes/10)`;
`passAccuracy` contributes `weight × max(0, passAccuracy − 70)`; `touches` contributes
`weight × floor(touches/10)`. These dampen volume stats so they don't dominate.

### 3.3 Normalization to `PS ∈ [0,100]`
`raw` is on a ~0–12 scale. Map to 0–100 with a clamp:
```
PS = clamp( round( (raw / 12) × 100 ), 0, 100 )
```
(Constants `BASE=6`, `SCALE_DENOMINATOR=12` are exported and unit-tested. Tuning happens by
adjusting these + weights; the formula is **versioned** — see §3.5.)

### 3.4 Special cases (must be explicit & tested)
- **DNP / `minutes < 1`** (player never entered): market resolves **neutral** `PS = 50`.
  Rationale: prevents exploiting a known benching; LONG and SHORT each redeem ~0.50 USDC.
- **Sent off (`red = 1`):** still scored normally (the −2.00 applies); no special refund.
- **Match abandoned / postponed:** **refund path** — resolver marks market `VOID`; every
  complete set redeems at face (`LONG + SHORT → 1 USDC`), and holders of an unmatched single
  token redeem at the **last on-chain trade mark** is NOT used; instead VOID forces redemption
  only via complete sets, and the FPMM liquidity is returned to LPs pro-rata. (Simplest sound
  refund: VOID disables `PS` redemption and enables 1:1 set redemption + LP withdrawal.)
- **`minutes` between 1 and `MIN_FULL_MINUTES` (default 15):** scored normally (no special
  case in v1 — keep it simple; revisit in v2).

### 3.5 Versioning
`PS_VERSION = "v1"`. The version string is stored with the posted score on-chain (so a market
records which formula settled it). Any weight/constant change → bump version.

### 3.6 Worked examples (these become the first failing tests — write them first)
> Implement `computePS(statLine): { ps: number; raw: number; breakdown: Record<string,number> }`
> in `packages/shared/src/ps/computePS.ts`. Author these as Vitest cases **before** writing the
> function.

1. **Neutral/empty (FWD, 90', all zero):** `raw = 6.0` → `PS = round(6/12·100) = 50`.
2. **DNP (`minutes = 0`):** `PS = 50` (special case, regardless of other stats).
3. **Star forward:** FWD, 90', goals=2, assists=1, shotsOnTarget=4, shots=2 (non-OT),
   keyPasses=3, passes=40, passAccuracy=88, touches=70, dribblesSucc=4, duelsWon=6.
   - `raw = 6 + 2·2.5 + 1·1.5 + 4·0.30 + 2·0.10 + 3·0.25 + floor(40/10)·0.05 + (88−70)·0.01
     + floor(70/10)·0.03 + 4·0.10 + 6·0.05`
   - `= 6 + 5 + 1.5 + 1.2 + 0.2 + 0.75 + 0.20 + 0.18 + 0.21 + 0.40 + 0.30 = 15.94`
   - `PS = clamp(round(15.94/12·100),0,100) = clamp(133,0,100) = 100`.
   (Confirms the clamp ceiling for a monster game.)
4. **Solid center-back:** DEF, 90', tackles=5, interceptions=4, clearances=7, passes=60,
   passAccuracy=92, touches=80, duelsWon=8, yellow=1.
   - `raw = 6 + 5·0.30 + 4·0.30 + 7·0.20 + floor(60/10)·0.10 + (92−70)·0.02 + floor(80/10)·0.03
     + 8·0.05 − 1·0.50`
   - `= 6 + 1.5 + 1.2 + 1.4 + 0.60 + 0.44 + 0.24 + 0.40 − 0.50 = 11.28`
   - `PS = round(11.28/12·100) = round(94) = 94`.
5. **Goalkeeper, clean-ish game:** GK, 90', saves=5, passes=30, passAccuracy=75, touches=40,
   clearances=2.
   - `raw = 6 + 5·0.60 + floor(30/10)·0.05 + (75−70)·0.01 + floor(40/10)·0.02 + 2·0.05`
   - `= 6 + 3.0 + 0.15 + 0.05 + 0.08 + 0.10 = 9.38` → `PS = round(78.2) = 78`.
6. **Poor game (FWD):** missed pen, own goal, red card, otherwise quiet 60'.
   - `raw = 6 − 1.5 (penMissed) − 2.0 (ownGoal) − 2.0 (red) = 0.5` → `PS = round(4.2) = 4`.

> These six cases pin down BASE, weights, the per-X dampeners, the clamp, and the DNP rule.
> Add property tests: `0 ≤ PS ≤ 100`, `PS` monotonic non-decreasing in `goals`, DNP always 50.

---

## 4. Smart Contracts (TDD with Foundry)

> **Test-first.** For every contract below, write the forge test file first (the §4.6
> invariants and the per-contract cases), watch it fail, then implement. Solidity ^0.8.24,
> OpenZeppelin for ERC-20/AccessControl/ReentrancyGuard. Use `uint256` fixed-point in USDC's
> 6 decimals for collateral and 18 decimals for outcome tokens (document the scaling).

### 4.1 Token & decimal conventions
- **USDC (mock):** 6 decimals. `MockUSDC` is an `ERC20` with a public `mint()` faucet
  (testnet only) and `decimals() = 6`.
- **Outcome tokens (LONG/SHORT):** 18 decimals, minted 1:1 with USDC *value*. A complete set
  of `1.0` LONG + `1.0` SHORT (1e18 each) is backed by `1 USDC` (1e6). Conversion constant
  `COLLATERAL_PER_SET = 1e6` per `1e18` of each token. **Document and test this scaling
  carefully** — it's the most error-prone part.

### 4.2 `MockUSDC.sol`
- `ERC20`, 6 decimals, `function mint(address to, uint256 amount)` open on testnet (guarded by
  a `FAUCET_ROLE` or simply open — open is fine for testnet MVP, with a per-call cap).
- Tests: mint increases balance; decimals == 6; cap enforced.

### 4.3 `OutcomeToken.sol`
- Minimal `ERC20` (18 decimals) that only the owning `Market` can mint/burn. Two instances per
  market (LONG, SHORT). Name/symbol encode player+fixture+side, e.g. `PM:10:42:LONG`.
- Tests: only market can mint/burn; transfers work; decimals == 18.

### 4.4 `Market.sol` (vault + FPMM for one `(player, fixture)`)
Holds collateral, mints/burns complete sets, runs the FPMM, and pays out on settlement.

**State**
- `IERC20 collateral` (USDC), `OutcomeToken long`, `OutcomeToken short`.
- `uint256 reserveLong, reserveShort` (FPMM reserves of each outcome token).
- `enum Phase { OPEN, FROZEN, RESOLVED, VOID }` + timestamps `kickoffFreezeAt`.
- `address resolver` (the Resolver contract). `uint256 settledPS` (0–100). `bytes psVersion`.
- LP accounting: `totalLpShares`, `mapping(address=>uint256) lpShares`.

**Complete-set primitives**
- `mintSet(uint256 setAmount)`: pull `setAmount·COLLATERAL_PER_SET/1e18` USDC; mint `setAmount`
  LONG + SHORT to caller.
- `burnSet(uint256 setAmount)`: burn `setAmount` LONG+SHORT from caller; return collateral.
  (Available pre-settlement so users can exit cheaply.)

**FPMM trading (Gnosis Fixed-Product style)** — only in `Phase.OPEN`:
- Invariant `k = reserveLong · reserveShort` preserved on swaps (minus fee).
- `buy(bool longSide, uint256 collateralIn, uint256 minTokensOut)`:
  1. take `collateralIn` USDC, mint a complete set of size `s = collateralIn·1e18/COLLATERAL_PER_SET`
     into the market (adds `s` to *both* reserves);
  2. compute `tokensOut` so product is preserved on the *opposite* reserve, à la FPMM;
  3. transfer `tokensOut` of the chosen side to the buyer; the other side stays as reserve.
- `sell(bool longSide, uint256 tokensIn, uint256 maxCollateralOut)`: inverse — user returns
  outcome tokens, market burns a complete set, returns collateral.
- **Price read:** `priceLong() = reserveShort·1e18/(reserveLong+reserveShort)` (in `(0,1)`,
  18-dec fixed point). `priceShort() = 1e18 − priceLong()`.
- **Fee:** `FEE_BPS` (default 0 for MVP simplicity; structure the code so a fee can be added,
  but ship 0 to keep tests simple — note in code).

**Liquidity (protocol-seeded for MVP)**
- `addLiquidity(uint256 collateralIn)`: pull USDC, mint a complete set, add equal amounts to
  both reserves, mint LP shares pro-rata. For MVP, **only the factory/owner seeds liquidity**
  at market creation (a fixed seed, e.g. 1,000 mock USDC) so there is always a book; public LP
  is structured but access-gated to owner in MVP.
- `removeLiquidity(uint256 shares)`: burn shares, return proportional reserves (as collateral
  via set-burn + leftover token at current mark). Only after `RESOLVED`/`VOID` in MVP.

**Settlement & redemption**
- `freeze()`: OPEN→FROZEN, callable by resolver/keeper at match-settlement start; blocks
  buy/sell (mint/burnSet still allowed? **No** — freeze blocks all trading and set ops except
  redemption, to avoid front-running). Simplest: FROZEN blocks everything until RESOLVED.
- `resolve(uint256 ps, bytes calldata version)`: only `resolver`; sets `settledPS`, `psVersion`,
  Phase→RESOLVED. Requires `ps ≤ 100`.
- `void()`: only `resolver`; Phase→VOID (abandoned/postponed).
- `redeem()` when RESOLVED: burn caller's LONG → `LONG·ps/100` collateral; burn SHORT →
  `SHORT·(100−ps)/100`. (Compute in USDC 6-dec; document rounding — round **down**, dust stays
  in vault and is swept to LPs.)
- `redeemVoid()` when VOID: redeem complete sets 1:1 for collateral; LPs withdraw reserves.

**Guards:** `ReentrancyGuard` on all external state-changing fns; check-effects-interactions;
phase modifiers; `minTokensOut`/`maxCollateralOut` slippage params required.

### 4.5 `MarketFactory.sol`
- `createMarket(uint256 playerId, uint256 fixtureId, uint64 kickoffFreezeAt, uint256 seed)`:
  deploys `Market` + its two `OutcomeToken`s, seeds liquidity with `seed` mock USDC, registers
  in a `mapping(bytes32 => address)` keyed by `keccak(playerId,fixtureId)`. Emits
  `MarketCreated`. `onlyRole(OPERATOR_ROLE)`.
- `getMarket(playerId, fixtureId) → address`.

### 4.6 `Resolver.sol` (oracle endpoint)
- Holds `RESOLVER_ROLE` (the keeper signer). `postScore(market, ps, version)` → calls
  `market.resolve(ps, version)` **after** a `disputeWindow` has passed since `proposeScore`.
  - `proposeScore(market, ps, version)`: stores a pending score + `proposedAt`. Emits event.
  - `finalizeScore(market)`: after `block.timestamp ≥ proposedAt + DISPUTE_WINDOW`, pushes to
    the market. (MVP `DISPUTE_WINDOW` e.g. 10 min; the owner can `cancelProposal` to correct a
    bad post during the window.)
- `voidMarket(market)`: `RESOLVER_ROLE` → `market.void()`.
- **Simplicity note:** this two-step (propose → finalize) is the entire "dispute" mechanism for
  MVP — a human/keeper can cancel a wrong score before finalize. No on-chain voting.

### 4.7 Contract invariants (write as forge **invariant/fuzz** tests — these gate the build)
1. **Full collateralization:** `collateral.balanceOf(market) ≥ requiredBacking` at all times,
   where `requiredBacking` covers all outstanding sets + reserves. After any sequence of
   mint/burn/buy/sell, the vault can always pay every possible redemption.
2. **Price bounds:** `0 < priceLong() < 1e18` whenever both reserves > 0.
3. **Complete-set parity:** `priceLong() + priceShort() == 1e18` (within rounding) always.
4. **Set redemption identity:** `mintSet(x)` then `burnSet(x)` returns exactly the collateral
   in (minus declared fee), no value creation.
5. **Conservation at settlement:** sum of all `redeem()` payouts ≤ collateral held; dust ≥ 0.
6. **Phase safety:** no `buy/sell` in FROZEN/RESOLVED/VOID; no `redeem` before RESOLVED; no
   double-resolve.
7. **No reentrancy:** malicious token/recipient cannot reenter to double-withdraw (test with a
   reentrant mock).

### 4.8 FPMM math reference (for the implementer)
Gnosis FPMM buy of `longSide` with set size `s` added to both reserves:
```
// after adding s to both reserves:
RL' = reserveLong  + s
RS' = reserveShort + s
// keep product on the side the user is NOT taking:
// user takes LONG, so SHORT reserve must satisfy: RL_after * RS' = RL' * RS' ... (Gnosis form)
// tokensOut(long) = RL' - (reserveLong*reserveShort)/(RS')   ... derive & unit-test from k.
```
> Implementer: port the **exact** Gnosis `FixedProductMarketMaker.calcBuyAmount/calcSellAmount`
> formulas (2-outcome case) and cover them with the numeric tests in §4.6. Do not invent new
> math; reuse the audited reference and test it.

---

## 5. Backend (Node/TS) — indexer + oracle keeper + API

> TDD with **Vitest**. All external I/O (API-Football, chain) behind interfaces so tests use
> fakes. No network in unit tests.

### 5.1 Responsibilities
1. **API-Football client** (`apps/backend/src/sources/apiFootball.ts`): typed wrapper over
   RapidAPI endpoints — fixtures (by competition=World Cup, by date), lineups, and
   `fixtures/players` live stats. Rate-limit aware (free tier!), caches responses, maps raw
   JSON → `StatLine`/`Fixture`/`Player` (shared types). **Mapping is pure & unit-tested**
   against recorded fixture JSON.
2. **Indexer** (`src/indexer`): viem `watchContractEvent` on `MarketCreated`, buy/sell, resolve;
   writes markets, trades, and price snapshots to DB. Backfills on boot.
3. **PS keeper** (`src/keeper`): on fixture `status == FT` (full time), pull final
   `fixtures/players`, compute `PS` via shared engine, call `Resolver.proposeScore`, then
   `finalizeScore` after the window. Handles `ABANDONED/POSTPONED → voidMarket`. Idempotent
   (never double-posts).
4. **Freeze trigger:** when fixture goes live to settlement / FT, call `Market.freeze()` (or
   freeze at FT). MVP: freeze at FT, resolve after dispute window.
5. **API** (`src/api`): REST/tRPC for `GET /fixtures?status=live|upcoming`, `GET /players/search`,
   `GET /markets/:player/:fixture` (price history, live stats, PS breakdown), `GET /portfolio/:addr`
   (joins chain positions + marks). **SSE** `GET /stream/markets/:id` pushes live price + stat
   ticks.
6. **DB:** SQLite (file) for MVP via Drizzle/Prisma; schema: `fixtures, players, markets, trades,
   price_snapshots, stat_snapshots, scores`.

### 5.2 Config / secrets (`.env`, never committed)
`RAPIDAPI_KEY`, `BASE_SEPOLIA_RPC_URL`, `KEEPER_PRIVATE_KEY` (testnet only), contract addresses,
`POLL_INTERVAL_MS`, `DISPUTE_WINDOW_MS`. Provide `.env.example`.

### 5.3 Key tests (write first)
- API-Football JSON → `StatLine` mapping (fixtures recorded as JSON fixtures in repo).
- Keeper: given FT fixture + stats, computes correct `PS` (reuses §3 examples) and proposes
  exactly once (idempotency).
- Void path on ABANDONED.
- API endpoints return expected shapes (supertest), SSE emits on price change (faked indexer).

---

## 6. Frontend (Next.js) — UX & implementation

> Mobile-first, mimics Polymarket/Robinhood/Coinbase/Kalshi. Next.js App Router + TypeScript +
> TailwindCSS + shadcn/ui + wagmi/viem + **Coinbase OnchainKit**. Component logic & hooks tested
> with Vitest + React Testing Library; one Playwright happy-path E2E.

### 6.1 Wallet, gas & funding (the "easy as Robinhood" layer)
- **Connect:** OnchainKit `<ConnectWallet>` with **Coinbase Smart Wallet** → passkey login, no
  seed phrase. Show truncated address + USDC balance in the header.
- **Gas:** Base **Paymaster** sponsors gas via OnchainKit/`useSendCalls` (EIP-5792 batched
  calls). Users never need ETH. Configure paymaster URL via env.
- **Batched approve+trade:** a single `sendCalls([approve(USDC, market), market.buy(...)])` so
  the user signs once. Show one "Confirm trade" sheet.
- **Funding:** testnet → a **"Get test USDC" faucet button** calling `MockUSDC.mint`. (Mainnet
  future: OnchainKit `<FundCard>`/onramp — structured but hidden on testnet.)

### 6.2 Screens & navigation (bottom-tab, mobile-first)
1. **Home / Markets** (`/`): tabs **Live** | **Upcoming**. Game cards (teams, kickoff/min,
   live badge). Search bar (players/teams). Tap a game → Game detail.
2. **Game detail** (`/game/[fixtureId]`): list of player markets (avatar, name, position,
   **LONG price**, sparkline, 24h/live change). Sort/filter by team/position. Tap → Player market.
3. **Player market** (`/market/[player]/[fixture]`): hero with live LONG price + chart
   (lightweight-charts), **Long/Short** segmented toggle, amount input (USDC) with quick chips
   (5/25/100/Max), **estimated tokens & payout at PS=current mark**, slippage note, live stat
   feed, **PS breakdown** (contribution bars from §3 breakdown), phase banner
   (Open/Frozen/Resolved). Primary CTA → trade confirm sheet.
4. **Trade confirm sheet:** side, amount, est. shares, price, max payout, fees (0), single
   "Confirm" → batched sponsored tx → pending → success with position link.
5. **Portfolio** (`/portfolio`): open positions (side, qty, avg price, **live mark-to-market
   P&L**), settled positions (redeem button when RESOLVED), trade history. Empty state CTA.
6. **Wallet** (`/wallet`): Smart Wallet status, USDC balance, **faucet** button, network
   indicator (Base Sepolia), disconnect.

### 6.3 Data layer
- `apps/web/src/lib/api.ts`: typed client for backend REST + SSE (React Query for caching;
  SSE subscription hook for live price/stats).
- `apps/web/src/lib/chain.ts`: wagmi/viem hooks — `usePriceLong`, `useBuy`, `useSell`,
  `useRedeem`, `useFaucet`, `usePositions` (read tokens balances + market state). Prefer reading
  price from chain for trust; backend for history/aggregations.
- Optimistic UI on trade; reconcile on confirmation.

### 6.4 Visual/UX requirements
- Robinhood-style price chart, green/red deltas, big tap targets, skeleton loaders, haptic-ish
  micro-interactions, dark mode default. Clear **"TESTNET — play money"** ribbon everywhere.
- Accessibility: semantic, focus states, color-contrast safe (don't rely on red/green alone).

### 6.5 Key tests (write first)
- `computeEstimatedPayout` / shares math (pure) — matches FPMM read.
- Trade form: validation, Max chip, disabled when FROZEN.
- Portfolio P&L calc from positions + marks.
- Playwright E2E (against Base Sepolia or a local anvil fork): connect (mock) → faucet → buy
  LONG → see position → (simulate resolve) → redeem.

---

## 7. Critical MVP gaps — explicit handling

| Gap | MVP handling |
|-----|--------------|
| **Legal/regulatory** | Testnet + mock USDC only; "play-money" labeling; mainnet gated on counsel (out of scope). |
| **Liquidity bootstrap** | Factory seeds each market with fixed mock-USDC liquidity at creation; always a book. |
| **Oracle trust** | Trusted keeper + propose→finalize dispute window + owner cancel; documented Chainlink/UMA upgrade. |
| **Match postponed/abandoned** | Resolver `void()` → VOID phase → 1:1 set redemption + LP withdrawal (no PS payout). |
| **DNP / benched player** | `minutes < 1` → `PS = 50` (neutral). Tested. |
| **Settlement front-running** | Freeze trading at FT before score posts; redemptions only after RESOLVED. |
| **Data latency/outage** | Backend caches; never resolves without confirmed `FT` + final stats; idempotent keeper. |
| **Thin-book manipulation** | Seeded liquidity + slippage params (`minTokensOut`) + FPMM curve; documented as MVP-limited. |
| **USDC decimals/precision** | 6-dec collateral vs 18-dec tokens scaling constant, round-down redemptions, dust→LP; fuzz-tested. |
| **Match-clock vs chain time** | Freeze/resolve driven by API-Football `status` (FT), not block time; keeper authoritative. |
| **Reentrancy / token weirdness** | ReentrancyGuard, CEI, only-market mint/burn, reentrant mock test. |

---

## 8. TDD Build Roadmap (execution order for the coding agent)

> Each phase: **red → green → refactor**. Do not start a phase before the previous phase's
> tests are green. Keep each change minimal. Run `pnpm test` (and `forge test`) continuously.

**Phase 0 — Repo scaffold**
- pnpm workspace; `packages/shared`, `packages/contracts` (Foundry init), `apps/web`,
  `apps/backend`. Root scripts: `test`, `lint`, `build`. GitHub Actions CI running
  `forge test` + `pnpm test`. (No product logic yet.)

**Phase 1 — Shared PS engine (pure, fastest feedback)**
1. Write Vitest cases from §3.6 (all six worked examples + property tests). _Red._
2. Implement `computePS` + weight tables + constants. _Green._ Refactor for clarity.
- ✅ Exit: all PS tests green; `PS_VERSION="v1"` exported.

**Phase 2 — Contracts (Foundry, tests-first)**
1. `MockUSDC` (test → impl).
2. `OutcomeToken` (only-market mint/burn).
3. `Market`: set mint/burn → FPMM buy/sell (port Gnosis math + numeric tests) → freeze/resolve/
   void → redeem/redeemVoid. Write §4.6 invariants/fuzz **first**.
4. `MarketFactory`, `Resolver` (propose→finalize, void).
5. Deploy script to Base Sepolia; emit ABIs into `packages/shared/src/abis`.
- ✅ Exit: all unit + invariant + fuzz tests green; deployed to Base Sepolia; addresses recorded.

**Phase 3 — Backend (indexer + keeper + API)**
1. API-Football mapping (recorded JSON → `StatLine`) tests → client.
2. Keeper: FT → computePS → propose/finalize; void path; idempotency tests → impl.
3. Indexer (viem watch) → SQLite; price/stat snapshots.
4. REST/tRPC + SSE endpoints (supertest) → impl.
- ✅ Exit: backend serves live fixtures/markets/prices for a (replayed) fixture; keeper resolves
  a test market end-to-end on Sepolia.

**Phase 4 — Frontend**
1. OnchainKit wallet + Paymaster + faucet wiring; header balance.
2. Data hooks (REST/SSE + chain reads) with tests.
3. Screens: Home → Game → Player market → Trade confirm → Portfolio → Wallet.
4. Batched approve+buy; optimistic UI; redeem.
- ✅ Exit: full UI usable on mobile against Base Sepolia.

**Phase 5 — E2E & polish**
- Playwright happy-path (connect → faucet → buy → resolve(sim) → redeem).
- Testnet banner, empty/loading/error states, README with run instructions.
- ✅ Exit: §1.5 success criteria met.

---

## 9. Definition of Done (MVP)
- [ ] `pnpm test` and `forge test` green in CI.
- [ ] All §4.6 contract invariants pass (incl. fuzz).
- [ ] All §3.6 PS examples pass; DNP=50 and clamp verified.
- [ ] Contracts deployed to Base Sepolia; addresses + ABIs committed to `packages/shared`.
- [ ] Backend resolves a real/replayed World Cup fixture (propose→finalize) end-to-end.
- [ ] Frontend completes the full loop on mobile with Smart Wallet + sponsored gas + faucet.
- [ ] Testnet/play-money labeling present throughout.
- [ ] README documents setup, env vars, and how to run each package.

---

## Appendix A — Why FPMM, not LMSR (kept for reviewers)
LMSR needs on-chain `exp/log` (fixed-point libs, more gas, trickier tests). The Gnosis FPMM
uses only multiplication/division, is audited and widely deployed (early Polymarket), naturally
yields prices in `(0,1)` for a 2-outcome market, and is straightforward to fuzz-test for the
collateralization invariant. For an MVP that prizes simplicity and testability, FPMM wins.
LMSR/CLOB are documented future options if liquidity provisioning needs change.

## Appendix B — Why scalar complete-set settlement
Going long/short on a *continuous* score is a **scalar** market. Complete-set minting
(`1 USDC → 1 LONG + 1 SHORT`, redeemable to `PS/100` and `(100−PS)/100`) guarantees the vault
is always exactly collateralized regardless of price, eliminating protocol counterparty risk —
the single most important safety property for a money app. The live LONG price *is* the
"athlete's price," moving continuously between 0 and 1 USDC as the match unfolds.

## Appendix C — API-Football reference endpoints (verify against current docs at build time)
- `GET /fixtures?league={WC}&season={year}` and `?live=all` / `?date=` — fixtures & status.
- `GET /fixtures/lineups?fixture={id}` — positions for `StatLine.position`.
- `GET /fixtures/players?fixture={id}` — per-player live statistics → `StatLine`.
- Mind the **free-tier rate limits**; cache aggressively and poll on a sane interval. The exact
  JSON field names must be mapped in `apiFootball.ts` and pinned with recorded-JSON tests.

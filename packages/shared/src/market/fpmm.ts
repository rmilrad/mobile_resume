/**
 * FpmmMarket — a Gnosis-style Fixed Product Market Maker for a single scalar
 * LONG/SHORT performance market, implemented with BigInt integer math that
 * mirrors the Solidity `Market` contract exactly (USDC 6dp, outcome tokens 18dp).
 *
 * This is the authoritative, heavily-tested reference model used by the
 * simulation engine and as a parity oracle for the on-chain contract.
 *
 * Money math (must match Solidity):
 *  - collateral (USDC) is 6 decimals
 *  - outcome tokens (LONG/SHORT) are 18 decimals
 *  - SCALE = 1e12 converts USDC -> token "set units"
 *  - a complete set of `x` LONG + `x` SHORT (18dp) is backed by `x / 1e12` USDC
 *  - longSupply == shortSupply at all times (sets minted/burned in pairs),
 *    so the vault is fully collateralized iff usdcBalance == supply / 1e12.
 */

export const USDC_DECIMALS = 6;
export const TOKEN_DECIMALS = 18;
export const ONE_USDC = 10n ** 6n;
export const ONE_TOKEN = 10n ** 18n;
export const SCALE = 10n ** 12n; // ONE_TOKEN / ONE_USDC

export type Side = "LONG" | "SHORT";
export type Phase = "OPEN" | "FROZEN" | "RESOLVED" | "VOID";

/** Integer square root for bigint (Newton's method). */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("isqrt of negative");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

export class FpmmMarket {
  reserveLong: bigint; // 18dp
  reserveShort: bigint; // 18dp
  usdcBalance: bigint; // 6dp — collateral held by the vault
  longSupply: bigint; // 18dp — total LONG minted (== shortSupply)
  shortSupply: bigint; // 18dp
  phase: Phase = "OPEN";
  settledPS = 0;

  constructor(seedUsdc: bigint) {
    if (seedUsdc <= 0n) throw new Error("seed must be positive");
    // Seed liquidity: mint `seedUsdc` worth of complete sets into the AMM,
    // split equally so the starting price is 0.5.
    const sets = seedUsdc * SCALE; // 18dp set units
    this.usdcBalance = seedUsdc;
    this.longSupply = sets;
    this.shortSupply = sets;
    this.reserveLong = sets;
    this.reserveShort = sets;
  }

  // ---- pricing ----

  /** Price of LONG scaled to 1e18 fixed point, strictly in (0, 1e18). */
  priceLong18(): bigint {
    return (this.reserveShort * ONE_TOKEN) / (this.reserveLong + this.reserveShort);
  }
  priceShort18(): bigint {
    return ONE_TOKEN - this.priceLong18();
  }
  priceLong(): number {
    return Number(this.priceLong18()) / Number(ONE_TOKEN);
  }
  priceShort(): number {
    return 1 - this.priceLong();
  }

  private reserves(side: Side): [bigint, bigint] {
    // returns [reserveOfSide, reserveOfOther]
    return side === "LONG"
      ? [this.reserveLong, this.reserveShort]
      : [this.reserveShort, this.reserveLong];
  }

  /** Pure quote: tokens out for buying `side` with `usdcIn` (6dp). */
  calcBuy(side: Side, usdcIn: bigint): bigint {
    if (usdcIn <= 0n) throw new Error("usdcIn must be positive");
    const inv = usdcIn * SCALE; // set units added to both reserves
    const [ri, rj] = this.reserves(side);
    // buyAmount = ri + inv - floor(ri*rj / (rj + inv))
    const buyAmount = ri + inv - (ri * rj) / (rj + inv);
    return buyAmount;
  }

  /** Execute a buy. Returns tokens out (18dp). Mutates state. */
  buy(side: Side, usdcIn: bigint, minTokensOut = 0n): bigint {
    if (this.phase !== "OPEN") throw new Error("market not open");
    const inv = usdcIn * SCALE;
    const out = this.calcBuy(side, usdcIn);
    if (out < minTokensOut) throw new Error("slippage");

    // mint a complete set of size `inv` into the AMM
    this.usdcBalance += usdcIn;
    this.longSupply += inv;
    this.shortSupply += inv;
    this.reserveLong += inv;
    this.reserveShort += inv;

    // transfer `out` of `side` out of the AMM to the buyer
    if (side === "LONG") this.reserveLong -= out;
    else this.reserveShort -= out;

    return out;
  }

  /** Pure quote: USDC out (6dp) for selling `tokensIn` of `side`. */
  calcSell(side: Side, tokensIn: bigint): bigint {
    if (tokensIn <= 0n) throw new Error("tokensIn must be positive");
    const [ri, rj] = this.reserves(side);
    // Solve (ri + tokensIn - R)(rj - R) = ri*rj  for R (set units), take smaller root.
    const sum = ri + rj + tokensIn;
    const disc = sum * sum - 4n * tokensIn * rj;
    if (disc < 0n) throw new Error("no solution");
    const R = (sum - isqrt(disc)) / 2n; // set units, 18dp
    const usdcOut = R / SCALE; // floor to USDC granularity (conservative)
    return usdcOut;
  }

  /** Execute a sell. Returns USDC out (6dp). Mutates state. */
  sell(side: Side, tokensIn: bigint, minUsdcOut = 0n): bigint {
    if (this.phase !== "OPEN") throw new Error("market not open");
    const usdcOut = this.calcSell(side, tokensIn);
    if (usdcOut < minUsdcOut) throw new Error("slippage");
    if (usdcOut <= 0n) throw new Error("dust sell");
    const setsBurned = usdcOut * SCALE; // burn exactly this many complete sets

    // user sends tokensIn of `side` into the AMM
    if (side === "LONG") this.reserveLong += tokensIn;
    else this.reserveShort += tokensIn;

    // burn `setsBurned` complete sets, returning `usdcOut` collateral
    if (this.reserveLong < setsBurned || this.reserveShort < setsBurned)
      throw new Error("insufficient reserves");
    this.reserveLong -= setsBurned;
    this.reserveShort -= setsBurned;
    this.longSupply -= setsBurned;
    this.shortSupply -= setsBurned;
    this.usdcBalance -= usdcOut;

    return usdcOut;
  }

  // ---- settlement ----

  resolve(ps: number): void {
    if (this.phase === "RESOLVED" || this.phase === "VOID")
      throw new Error("already settled");
    if (ps < 0 || ps > 100) throw new Error("ps out of range");
    this.settledPS = ps;
    this.phase = "RESOLVED";
  }

  void(): void {
    if (this.phase === "RESOLVED") throw new Error("already resolved");
    this.phase = "VOID";
  }

  /** Redeem LONG tokens at PS/100. Returns USDC (6dp). */
  redeemLong(tokens: bigint): bigint {
    if (this.phase !== "RESOLVED") throw new Error("not resolved");
    const payout = (tokens * BigInt(this.settledPS)) / 100n / SCALE;
    this.longSupply -= tokens;
    this.usdcBalance -= payout;
    return payout;
  }

  /** Redeem SHORT tokens at (100-PS)/100. Returns USDC (6dp). */
  redeemShort(tokens: bigint): bigint {
    if (this.phase !== "RESOLVED") throw new Error("not resolved");
    const payout = (tokens * BigInt(100 - this.settledPS)) / 100n / SCALE;
    this.shortSupply -= tokens;
    this.usdcBalance -= payout;
    return payout;
  }

  // ---- invariants ----

  /**
   * Full-collateralization invariant: the vault holds at least enough USDC to
   * pay every outstanding token at any settlement value. Because supplies are
   * balanced, max total payout == supply / 1e12 USDC.
   */
  assertCollateralized(): void {
    if (this.longSupply !== this.shortSupply)
      throw new Error(`supply imbalance: ${this.longSupply} != ${this.shortSupply}`);
    const required = this.longSupply / SCALE; // USDC needed to cover all payouts
    if (this.usdcBalance < required)
      throw new Error(
        `undercollateralized: have ${this.usdcBalance} need ${required}`,
      );
  }
}

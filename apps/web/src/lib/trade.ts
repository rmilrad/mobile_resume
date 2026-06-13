/** Trade economics (pure, tested). Mirrors the on-chain scalar market meaning:
 *  a LONG share pays PS/100 USDC at settlement; SHORT pays (100-PS)/100.
 *  Pre-settlement, a LONG share is marked at the live LONG price (0..1),
 *  a SHORT share at (1 - priceLong).
 */

export type Side = "LONG" | "SHORT";

export interface Position {
  playerId: number;
  fixtureId: number;
  side: Side;
  /** number of outcome shares held (human units) */
  shares: number;
  /** entry price of the side (0..1) */
  entryPrice: number;
  /** USDC paid */
  cost: number;
}

/** Price of a given side from the LONG price. */
export function sidePrice(side: Side, priceLong: number): number {
  return side === "LONG" ? priceLong : 1 - priceLong;
}

/** First-order estimate of shares received for `usdc` at the marginal price.
 *  (UI estimate; the chain/AMM applies slippage on top.) */
export function estimateShares(usdc: number, side: Side, priceLong: number): number {
  const p = sidePrice(side, priceLong);
  if (p <= 0) return 0;
  return usdc / p;
}

/** Current mark-to-market value of a position given the live LONG price. */
export function positionValue(pos: Position, priceLong: number): number {
  return pos.shares * sidePrice(pos.side, priceLong);
}

/** Unrealized P&L = current value − cost. */
export function positionPnl(pos: Position, priceLong: number): number {
  return positionValue(pos, priceLong) - pos.cost;
}

/** P&L as a fraction of cost. */
export function positionPnlPct(pos: Position, priceLong: number): number {
  if (pos.cost === 0) return 0;
  return positionPnl(pos, priceLong) / pos.cost;
}

/** Final settlement payout for a position given resolved PS (0..100). */
export function settlementPayout(pos: Position, ps: number): number {
  const factor = pos.side === "LONG" ? ps / 100 : (100 - ps) / 100;
  return pos.shares * factor;
}

/** Max payout if the side resolves perfectly (price -> 1). */
export function maxPayout(pos: Position): number {
  return pos.shares; // each share is worth at most 1 USDC
}

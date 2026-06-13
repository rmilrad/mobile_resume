import { FpmmMarket, ONE_USDC, type Side } from "../market/fpmm";
import { computePS } from "../ps/computePS";
import type { StatLine } from "../types";
import { makeRng } from "./rng";
import type { MatchResult } from "./gameSim";

export interface PricePoint {
  minute: number;
  priceLong: number;
  livePS: number;
  fairPrice: number; // livePS / 100
}

export interface MarketSimResult {
  playerId: number;
  history: PricePoint[];
  finalPS: number;
  finalPriceLong: number;
  /** absolute gap between final price and fair value (PS/100) */
  convergenceGap: number;
  trades: number;
}

export interface MarketSimConfig {
  seedUsdc?: number;
  /** number of trader actions per simulated minute */
  tradersPerMinute?: number;
  /** fraction of traders that are "informed" (trade toward live fair value) */
  informedFraction?: number;
  /** price band within which informed traders do nothing */
  informedBand?: number;
  /** max USDC per trade */
  maxTradeUsdc?: number;
}

const DEFAULTS: Required<MarketSimConfig> = {
  seedUsdc: 5000,
  tradersPerMinute: 6,
  informedFraction: 0.6,
  informedBand: 0.03,
  maxTradeUsdc: 150,
};

/**
 * Simulate a live, continuously-traded market for one player over a match.
 * Informed traders push the price toward live PS/100; noise traders add churn.
 * Returns the price/PS time series and convergence diagnostics.
 */
export function simulatePlayerMarket(
  playerId: number,
  match: MatchResult,
  seed: number,
  config: MarketSimConfig = {},
): MarketSimResult {
  const cfg = { ...DEFAULTS, ...config };
  const rng = makeRng(seed);
  const market = new FpmmMarket(BigInt(cfg.seedUsdc) * ONE_USDC);
  const history: PricePoint[] = [];
  let trades = 0;

  for (const { minute, stats } of match.timeline) {
    const stat = stats.get(playerId)!;
    const livePS = computePS(stat).ps;
    const fair = livePS / 100;

    for (let i = 0; i < cfg.tradersPerMinute; i++) {
      const informed = rng() < cfg.informedFraction;
      const price = market.priceLong();
      let side: Side;
      if (informed) {
        if (price < fair - cfg.informedBand) side = "LONG";
        else if (price > fair + cfg.informedBand) side = "SHORT";
        else continue; // within band, informed trader passes
      } else {
        side = rng() < 0.5 ? "LONG" : "SHORT";
      }
      const usdc = BigInt(1 + Math.floor(rng() * cfg.maxTradeUsdc)) * ONE_USDC;
      try {
        market.buy(side, usdc);
        trades += 1;
        market.assertCollateralized();
      } catch {
        // skip pathological trades (e.g. extreme price); model stays valid
      }
    }

    history.push({ minute, priceLong: market.priceLong(), livePS, fairPrice: fair });
  }

  const finalStat = match.final.get(playerId)!;
  const finalPS = computePS(finalStat).ps;
  market.resolve(finalPS);
  const finalPriceLong = history.length ? history[history.length - 1]!.priceLong : market.priceLong();

  return {
    playerId,
    history,
    finalPS,
    finalPriceLong,
    convergenceGap: Math.abs(finalPriceLong - finalPS / 100),
    trades,
  };
}

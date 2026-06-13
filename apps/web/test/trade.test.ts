import { describe, it, expect } from "vitest";
import {
  sidePrice, estimateShares, positionValue, positionPnl, positionPnlPct,
  settlementPayout, type Position,
} from "../src/lib/trade";

const longPos: Position = { playerId: 1, fixtureId: 1, side: "LONG", shares: 200, entryPrice: 0.5, cost: 100 };
const shortPos: Position = { playerId: 1, fixtureId: 1, side: "SHORT", shares: 200, entryPrice: 0.5, cost: 100 };

describe("trade math", () => {
  it("sidePrice inverts for SHORT", () => {
    expect(sidePrice("LONG", 0.6)).toBeCloseTo(0.6);
    expect(sidePrice("SHORT", 0.6)).toBeCloseTo(0.4);
  });

  it("estimateShares ~ usdc/price", () => {
    expect(estimateShares(100, "LONG", 0.5)).toBeCloseTo(200);
    expect(estimateShares(100, "SHORT", 0.25)).toBeCloseTo(133.33, 1);
    expect(estimateShares(100, "LONG", 0)).toBe(0);
  });

  it("LONG position gains when price rises", () => {
    expect(positionValue(longPos, 0.5)).toBeCloseTo(100);
    expect(positionPnl(longPos, 0.7)).toBeCloseTo(40); // 200*0.7 - 100
    expect(positionPnlPct(longPos, 0.7)).toBeCloseTo(0.4);
  });

  it("SHORT position gains when price falls", () => {
    expect(positionPnl(shortPos, 0.3)).toBeCloseTo(40); // 200*0.7 - 100
    expect(positionPnl(shortPos, 0.7)).toBeCloseTo(-40);
  });

  it("settlement payout follows PS", () => {
    expect(settlementPayout(longPos, 75)).toBeCloseTo(150); // 200 * 0.75
    expect(settlementPayout(shortPos, 75)).toBeCloseTo(50); // 200 * 0.25
    expect(settlementPayout(longPos, 100)).toBeCloseTo(200);
  });

  it("a complete hedge (long+short same shares) always returns shares USDC", () => {
    for (const ps of [0, 25, 50, 75, 100]) {
      const total = settlementPayout(longPos, ps) + settlementPayout(shortPos, ps);
      expect(total).toBeCloseTo(200);
    }
  });
});

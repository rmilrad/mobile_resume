import { describe, it, expect } from "vitest";
import { FpmmMarket, ONE_USDC, ONE_TOKEN } from "../src/market/fpmm";

function freshMarket(seedUsdc = 1000) {
  // seed with 1000 USDC of liquidity -> equal reserves, price 0.5
  return new FpmmMarket(BigInt(seedUsdc) * ONE_USDC);
}

describe("FpmmMarket — initialization", () => {
  it("seeds equal reserves and price 0.5", () => {
    const m = freshMarket(1000);
    expect(m.priceLong()).toBeCloseTo(0.5, 9);
    expect(m.priceShort()).toBeCloseTo(0.5, 9);
    // collateral equals seed
    expect(m.usdcBalance).toBe(1000n * ONE_USDC);
  });

  it("priceLong + priceShort == 1 exactly (parity)", () => {
    const m = freshMarket(1000);
    expect(m.priceLong18() + m.priceShort18()).toBe(ONE_TOKEN);
  });
});

describe("FpmmMarket — trading mechanics", () => {
  it("buying LONG raises the LONG price", () => {
    const m = freshMarket(1000);
    const before = m.priceLong();
    m.buy("LONG", 100n * ONE_USDC);
    expect(m.priceLong()).toBeGreaterThan(before);
  });

  it("buying SHORT lowers the LONG price", () => {
    const m = freshMarket(1000);
    const before = m.priceLong();
    m.buy("SHORT", 100n * ONE_USDC);
    expect(m.priceLong()).toBeLessThan(before);
  });

  it("buying with X USDC at price 0.5 returns ~2X tokens (minus slippage)", () => {
    const m = freshMarket(100000); // deep liquidity -> low slippage
    const out = m.buy("LONG", 100n * ONE_USDC);
    // ~200 tokens, but less due to slippage
    const tokens = Number(out) / Number(ONE_TOKEN);
    expect(tokens).toBeGreaterThan(190);
    expect(tokens).toBeLessThan(200);
  });

  it("buy then sell round-trips approximately (no value creation)", () => {
    const m = freshMarket(100000);
    const usdcIn = 500n * ONE_USDC;
    const tokens = m.buy("LONG", usdcIn);
    const usdcOut = m.sell("LONG", tokens);
    // should get back close to what we put in (slightly less due to rounding)
    expect(usdcOut).toBeLessThanOrEqual(usdcIn);
    const ratio = Number(usdcOut) / Number(usdcIn);
    expect(ratio).toBeGreaterThan(0.99);
  });

  it("price always strictly within (0,1)", () => {
    const m = freshMarket(1000);
    for (let i = 0; i < 50; i++) {
      m.buy(i % 2 === 0 ? "LONG" : "SHORT", 50n * ONE_USDC);
      expect(m.priceLong18()).toBeGreaterThan(0n);
      expect(m.priceLong18()).toBeLessThan(ONE_TOKEN);
    }
  });
});

describe("FpmmMarket — invariants under heavy random trading", () => {
  it("stays fully collateralized across 10,000 random trades", () => {
    const m = freshMarket(5000);
    // deterministic PRNG
    let seed = 123456789;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 10000; i++) {
      const side = rnd() < 0.5 ? "LONG" : "SHORT";
      if (rnd() < 0.6) {
        const amt = BigInt(1 + Math.floor(rnd() * 200)) * ONE_USDC;
        m.buy(side, amt);
      } else {
        // sell a fraction of AMM-available tokens we "own" — emulate by buying small then selling
        const amt = BigInt(1 + Math.floor(rnd() * 50)) * ONE_USDC;
        const t = m.buy(side, amt);
        m.sell(side, t / 2n);
      }
      // INVARIANT 1: full collateralization
      m.assertCollateralized();
      // INVARIANT 2 & 3: price bounds + parity
      expect(m.priceLong18()).toBeGreaterThan(0n);
      expect(m.priceLong18()).toBeLessThan(ONE_TOKEN);
      expect(m.priceLong18() + m.priceShort18()).toBe(ONE_TOKEN);
    }
  });
});

describe("FpmmMarket — settlement & redemption", () => {
  it("LONG redeems PS/100, SHORT redeems (100-PS)/100", () => {
    const m = freshMarket(1000);
    const longTokens = m.buy("LONG", 100n * ONE_USDC);
    m.resolve(75);
    const longPayout = m.redeemLong(longTokens);
    // 75% of token count, in USDC (6dp)
    const expected = (longTokens * 75n) / 100n / 1_000_000_000_000n;
    expect(longPayout).toBe(expected);
  });

  it("total redemptions never exceed collateral held (conservation)", () => {
    const m = freshMarket(2000);
    // simulate many holders
    let totalLong = 0n;
    let totalShort = 0n;
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 1000; i++) {
      const side = rnd() < 0.5 ? "LONG" : "SHORT";
      const t = m.buy(side, BigInt(1 + Math.floor(rnd() * 100)) * ONE_USDC);
      if (side === "LONG") totalLong += t;
      else totalShort += t;
    }
    const collateralBefore = m.usdcBalance;
    m.resolve(60);
    // payout to all user-held tokens + remaining AMM reserves redeemed
    const longPay = (totalLong * 60n) / 100n / 1_000_000_000_000n;
    const shortPay = (totalShort * 40n) / 100n / 1_000_000_000_000n;
    const ammLongPay = (m.reserveLong * 60n) / 100n / 1_000_000_000_000n;
    const ammShortPay = (m.reserveShort * 40n) / 100n / 1_000_000_000_000n;
    const totalPay = longPay + shortPay + ammLongPay + ammShortPay;
    expect(totalPay).toBeLessThanOrEqual(collateralBefore);
  });
});

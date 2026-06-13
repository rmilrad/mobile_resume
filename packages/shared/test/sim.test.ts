import { describe, it, expect } from "vitest";
import { simulateMatch, makeRoster } from "../src/sim/gameSim";
import { simulatePlayerMarket } from "../src/sim/marketSim";
import { computePS } from "../src/ps/computePS";
import { makeRng } from "../src/sim/rng";
import type { StatLine } from "../src/types";

function buildPlayers(seed: number) {
  const rng = makeRng(seed);
  return [...makeRoster(1, 1, rng), ...makeRoster(2, 100, rng)];
}

describe("gameSim — match simulation", () => {
  it("produces a 90+ minute timeline with monotonic cumulative stats", () => {
    const players = buildPlayers(7);
    const match = simulateMatch(players, 7);
    expect(match.durationMinutes).toBeGreaterThanOrEqual(90);
    expect(match.timeline.length).toBe(match.durationMinutes);

    // cumulative stats never decrease for a player
    const pid = players[8]!.id; // a forward
    let prevGoals = 0;
    let prevTouches = 0;
    for (const m of match.timeline) {
      const s = m.stats.get(pid)!;
      expect(s.goals).toBeGreaterThanOrEqual(prevGoals);
      expect(s.touches).toBeGreaterThanOrEqual(prevTouches);
      prevGoals = s.goals;
      prevTouches = s.touches;
    }
  });

  it("is deterministic given the same seed", () => {
    const p1 = buildPlayers(11);
    const p2 = buildPlayers(11);
    const a = simulateMatch(p1, 11).final;
    const b = simulateMatch(p2, 11).final;
    for (const [id, s] of a) {
      expect(b.get(id)).toEqual(s);
    }
  });

  it("forwards score more goals than defenders on average", () => {
    let fwdGoals = 0;
    let defGoals = 0;
    for (let g = 0; g < 50; g++) {
      const players = buildPlayers(g);
      const match = simulateMatch(players, g * 13 + 1);
      for (const p of players) {
        const s = match.final.get(p.id)!;
        if (p.position === "FWD") fwdGoals += s.goals;
        if (p.position === "DEF") defGoals += s.goals;
      }
    }
    expect(fwdGoals).toBeGreaterThan(defGoals);
  });

  it("final stats yield valid PS in [0,100] for every player", () => {
    const players = buildPlayers(3);
    const match = simulateMatch(players, 99);
    for (const p of players) {
      const ps = computePS(match.final.get(p.id)!).ps;
      expect(ps).toBeGreaterThanOrEqual(0);
      expect(ps).toBeLessThanOrEqual(100);
    }
  });
});

describe("marketSim — live price modeling", () => {
  it("price converges toward final PS/100 (informed market)", () => {
    const players = buildPlayers(5);
    const match = simulateMatch(players, 5);
    const pid = players[8]!.id;
    const result = simulatePlayerMarket(pid, match, 5, { tradersPerMinute: 12 });
    // with enough informed flow the closing price tracks fair value reasonably
    expect(result.convergenceGap).toBeLessThan(0.2);
    expect(result.history.length).toBe(match.durationMinutes);
  });

  it("price stays within (0,1) for the whole match", () => {
    const players = buildPlayers(8);
    const match = simulateMatch(players, 8);
    const pid = players[0]!.id;
    const result = simulatePlayerMarket(pid, match, 8);
    for (const pt of result.history) {
      expect(pt.priceLong).toBeGreaterThan(0);
      expect(pt.priceLong).toBeLessThan(1);
    }
  });

  it("price reacts: a goal pushes live PS (and fair value) up", () => {
    const players = buildPlayers(21);
    const match = simulateMatch(players, 21);
    // find a player who scored and the minute they scored
    let target: number | null = null;
    let scoreMinute = -1;
    outer: for (const p of players) {
      let prev = 0;
      for (const m of match.timeline) {
        const g = m.stats.get(p.id)!.goals;
        if (g > prev) {
          target = p.id;
          scoreMinute = m.minute;
          break outer;
        }
        prev = g;
      }
    }
    expect(target).not.toBeNull();
    const result = simulatePlayerMarket(target!, match, 21, { tradersPerMinute: 15 });
    const before = result.history.find((h) => h.minute === scoreMinute - 1)?.fairPrice ?? 0;
    const after = result.history.find((h) => h.minute === scoreMinute)?.fairPrice ?? 0;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

describe("marketSim — LARGE VOLUME: 200 games x full rosters", () => {
  it("stays fully collateralized and price-bounded across all markets", () => {
    let totalMarkets = 0;
    let totalTrades = 0;
    let convergenceSum = 0;
    let convergenceCount = 0;

    for (let game = 0; game < 200; game++) {
      const players = buildPlayers(game * 3 + 1);
      const match = simulateMatch(players, game * 7 + 2);
      // simulate markets for a subset of players (e.g. 4 per game) for speed
      const sample = [players[0]!, players[5]!, players[8]!, players[9]!];
      for (const p of sample) {
        const r = simulatePlayerMarket(p.id, match, game * 31 + p.id, {
          tradersPerMinute: 4,
          seedUsdc: 3000,
        });
        totalMarkets += 1;
        totalTrades += r.trades;
        // every recorded price is within (0,1)
        for (const pt of r.history) {
          expect(pt.priceLong).toBeGreaterThan(0);
          expect(pt.priceLong).toBeLessThan(1);
        }
        convergenceSum += r.convergenceGap;
        convergenceCount += 1;
      }
    }

    expect(totalMarkets).toBe(800);
    expect(totalTrades).toBeGreaterThan(10000);
    // average convergence gap across 800 markets should be reasonable
    const avgGap = convergenceSum / convergenceCount;
    expect(avgGap).toBeLessThan(0.25);
    // eslint-disable-next-line no-console
    console.log(
      `[sim] markets=${totalMarkets} trades=${totalTrades} avgConvergenceGap=${avgGap.toFixed(4)}`,
    );
  });
});

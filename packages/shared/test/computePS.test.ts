import { describe, it, expect } from "vitest";
import { computePS } from "../src/ps/computePS";
import type { StatLine, Position } from "../src/types";

/** Build a StatLine with all-zero defaults, overriding as needed. */
function stat(overrides: Partial<StatLine> & { position: Position }): StatLine {
  return {
    minutes: 90,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    keyPasses: 0,
    passes: 0,
    passAccuracy: 0,
    touches: 0,
    dribblesSucc: 0,
    tackles: 0,
    interceptions: 0,
    clearances: 0,
    duelsWon: 0,
    saves: 0,
    penScored: 0,
    penMissed: 0,
    penWon: 0,
    foulsCommitted: 0,
    yellow: 0,
    red: 0,
    ownGoals: 0,
    ...overrides,
  };
}

describe("computePS — worked examples (PRD §3.6)", () => {
  it("1. neutral/empty FWD 90' all zero -> raw 6.0, PS 50", () => {
    const r = computePS(stat({ position: "FWD" }));
    expect(r.raw).toBeCloseTo(6.0, 6);
    expect(r.ps).toBe(50);
  });

  it("2. DNP (minutes 0) -> PS 50 regardless of other stats", () => {
    const r = computePS(stat({ position: "FWD", minutes: 0, goals: 3 }));
    expect(r.ps).toBe(50);
  });

  it("3. star forward -> raw 15.94, clamps to PS 100", () => {
    const r = computePS(
      stat({
        position: "FWD",
        goals: 2,
        assists: 1,
        shotsOnTarget: 4,
        shots: 6, // total; non-OT = 6 - 4 = 2
        keyPasses: 3,
        passes: 40,
        passAccuracy: 88,
        touches: 70,
        dribblesSucc: 4,
        duelsWon: 6,
      }),
    );
    expect(r.raw).toBeCloseTo(15.94, 6);
    expect(r.ps).toBe(100);
  });

  it("4. solid center-back -> raw 11.28, PS 94", () => {
    const r = computePS(
      stat({
        position: "DEF",
        tackles: 5,
        interceptions: 4,
        clearances: 7,
        passes: 60,
        passAccuracy: 92,
        touches: 80,
        duelsWon: 8,
        yellow: 1,
      }),
    );
    expect(r.raw).toBeCloseTo(11.28, 6);
    expect(r.ps).toBe(94);
  });

  it("5. goalkeeper clean-ish game -> raw 9.38, PS 78", () => {
    const r = computePS(
      stat({
        position: "GK",
        saves: 5,
        passes: 30,
        passAccuracy: 75,
        touches: 40,
        clearances: 2,
      }),
    );
    expect(r.raw).toBeCloseTo(9.38, 6);
    expect(r.ps).toBe(78);
  });

  it("6. poor forward (missed pen, own goal, red) -> raw 0.5, PS 4", () => {
    const r = computePS(
      stat({
        position: "FWD",
        minutes: 60,
        penMissed: 1,
        ownGoals: 1,
        red: 1,
      }),
    );
    expect(r.raw).toBeCloseTo(0.5, 6);
    expect(r.ps).toBe(4);
  });
});

describe("computePS — properties", () => {
  it("PS is always within [0,100]", () => {
    const positions: Position[] = ["GK", "DEF", "MID", "FWD"];
    for (let i = 0; i < 5000; i++) {
      const s = stat({
        position: positions[i % 4]!,
        minutes: 1 + (i % 90),
        goals: i % 5,
        assists: i % 3,
        shots: i % 10,
        shotsOnTarget: i % 4,
        keyPasses: i % 6,
        passes: (i * 7) % 120,
        passAccuracy: i % 101,
        touches: (i * 3) % 150,
        dribblesSucc: i % 8,
        tackles: i % 9,
        interceptions: i % 7,
        clearances: i % 11,
        duelsWon: i % 12,
        saves: i % 8,
        penScored: i % 2,
        penMissed: (i + 1) % 2,
        penWon: i % 2,
        foulsCommitted: i % 5,
        yellow: i % 2,
        red: i % 2,
        ownGoals: i % 2,
      });
      const r = computePS(s);
      expect(r.ps).toBeGreaterThanOrEqual(0);
      expect(r.ps).toBeLessThanOrEqual(100);
      expect(Number.isInteger(r.ps)).toBe(true);
    }
  });

  it("PS is monotonic non-decreasing in goals", () => {
    let prev = -1;
    for (let g = 0; g <= 10; g++) {
      const r = computePS(stat({ position: "FWD", goals: g }));
      expect(r.ps).toBeGreaterThanOrEqual(prev);
      prev = r.ps;
    }
  });

  it("DNP always resolves neutral 50", () => {
    const r = computePS(stat({ position: "DEF", minutes: 0, tackles: 10, goals: 2 }));
    expect(r.ps).toBe(50);
  });

  it("breakdown sums (plus base) to raw", () => {
    const r = computePS(
      stat({ position: "MID", goals: 1, passes: 55, passAccuracy: 90, tackles: 3 }),
    );
    const sum = Object.values(r.breakdown).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(r.raw, 6);
  });
});

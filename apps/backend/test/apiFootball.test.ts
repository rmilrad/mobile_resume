import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mapToStatLine, mapFixturePlayers, mapPosition } from "../src/sources/apiFootball";
import { computePS } from "@pitchmarket/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(join(__dirname, "fixtures/playersResponse.json"), "utf8"));

describe("apiFootball mapping", () => {
  it("maps position codes", () => {
    expect(mapPosition("G")).toBe("GK");
    expect(mapPosition("D")).toBe("DEF");
    expect(mapPosition("M")).toBe("MID");
    expect(mapPosition("F")).toBe("FWD");
    expect(mapPosition(undefined)).toBe("MID");
  });

  it("maps a striker stat line correctly", () => {
    const players = mapFixturePlayers(sample);
    const s = players.get(101)!;
    expect(s.position).toBe("FWD");
    expect(s.minutes).toBe(90);
    expect(s.goals).toBe(2);
    expect(s.assists).toBe(1);
    expect(s.shots).toBe(6);
    expect(s.shotsOnTarget).toBe(4);
    expect(s.keyPasses).toBe(3);
    expect(s.passes).toBe(40);
    expect(s.passAccuracy).toBe(88);
    expect(s.dribblesSucc).toBe(4);
    expect(s.duelsWon).toBe(6);
    expect(s.foulsCommitted).toBe(1);
  });

  it("maps a goalkeeper with saves and a yellow", () => {
    const s = mapFixturePlayers(sample).get(102)!;
    expect(s.position).toBe("GK");
    expect(s.saves).toBe(5);
    expect(s.yellow).toBe(1);
  });

  it("handles a never-played sub with all-null fields (no NaN)", () => {
    const s = mapFixturePlayers(sample).get(103)!;
    expect(s.minutes).toBe(0);
    for (const v of Object.values(s)) {
      if (typeof v === "number") expect(Number.isNaN(v)).toBe(false);
    }
    // DNP -> neutral PS
    expect(computePS(s).ps).toBe(50);
  });

  it("produces a high PS for the 2-goal striker", () => {
    const s = mapFixturePlayers(sample).get(101)!;
    expect(computePS(s).ps).toBeGreaterThan(90);
  });

  it("clamps a count-like passAccuracy (>100) to 0", () => {
    const s = mapToStatLine({
      player: { id: 1, name: "x" },
      statistics: [{ games: { minutes: 90, position: "M" }, passes: { accuracy: 250 } }],
    });
    expect(s.passAccuracy).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { decideKeeperAction } from "../src/keeper";
import type { StatLine } from "@pitchmarket/shared";

const starStat: StatLine = {
  minutes: 90, position: "FWD", goals: 2, assists: 1, shots: 6, shotsOnTarget: 4,
  keyPasses: 3, passes: 40, passAccuracy: 88, touches: 70, dribblesSucc: 4, tackles: 0,
  interceptions: 0, clearances: 0, duelsWon: 6, saves: 0, penScored: 0, penMissed: 0,
  penWon: 0, foulsCommitted: 0, yellow: 0, red: 0, ownGoals: 0,
};

describe("decideKeeperAction", () => {
  it("does nothing while not started", () => {
    expect(decideKeeperAction({ status: "NS", stat: undefined, alreadyProposed: false, alreadyResolved: false }))
      .toEqual({ kind: "NONE" });
  });

  it("does nothing while live (trading continues)", () => {
    expect(decideKeeperAction({ status: "LIVE", stat: starStat, alreadyProposed: false, alreadyResolved: false }))
      .toEqual({ kind: "NONE" });
  });

  it("proposes the final PS at full time", () => {
    const a = decideKeeperAction({ status: "FT", stat: starStat, alreadyProposed: false, alreadyResolved: false });
    expect(a.kind).toBe("PROPOSE");
    if (a.kind === "PROPOSE") {
      expect(a.ps).toBe(100);
      expect(a.version).toBe("v1");
    }
  });

  it("is idempotent once proposed", () => {
    expect(decideKeeperAction({ status: "FT", stat: starStat, alreadyProposed: true, alreadyResolved: false }))
      .toEqual({ kind: "NONE" });
  });

  it("does nothing once resolved", () => {
    expect(decideKeeperAction({ status: "FT", stat: starStat, alreadyProposed: false, alreadyResolved: true }))
      .toEqual({ kind: "NONE" });
  });

  it("voids an abandoned match", () => {
    expect(decideKeeperAction({ status: "ABANDONED", stat: undefined, alreadyProposed: false, alreadyResolved: false }))
      .toEqual({ kind: "VOID" });
  });

  it("voids a postponed match", () => {
    expect(decideKeeperAction({ status: "POSTPONED", stat: undefined, alreadyProposed: false, alreadyResolved: false }))
      .toEqual({ kind: "VOID" });
  });

  it("proposes neutral 50 at FT if stats are missing", () => {
    const a = decideKeeperAction({ status: "FT", stat: undefined, alreadyProposed: false, alreadyResolved: false });
    expect(a).toEqual({ kind: "PROPOSE", ps: 50, version: "v1" });
  });
});

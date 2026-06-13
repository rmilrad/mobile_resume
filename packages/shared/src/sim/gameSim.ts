import type { Position, StatLine } from "../types";
import { makeRng, chance, randInt } from "./rng";

/** A simulated player with skill attributes that drive event rates. */
export interface SimPlayer {
  id: number;
  name: string;
  position: Position;
  /** 0..1 attacking quality (shooting/scoring). */
  attack: number;
  /** 0..1 defensive quality (tackles/interceptions). */
  defense: number;
  /** 0..1 passing quality. */
  passing: number;
}

export interface MatchMinute {
  minute: number;
  /** cumulative stat line per player id at this minute */
  stats: Map<number, StatLine>;
}

export interface MatchResult {
  durationMinutes: number;
  timeline: MatchMinute[];
  final: Map<number, StatLine>;
}

function emptyStat(position: Position): StatLine {
  return {
    minutes: 0,
    position,
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
  };
}

function clone(s: StatLine): StatLine {
  return { ...s };
}

/** Track successful vs total passes to derive passAccuracy. */
interface PassTally {
  successful: number;
  total: number;
}

/**
 * Simulate a full match minute-by-minute, accumulating per-player StatLines.
 * Deterministic given `seed`. Models realistic, position-dependent event rates.
 */
export function simulateMatch(players: SimPlayer[], seed: number): MatchResult {
  const rng = makeRng(seed);
  const duration = 90 + randInt(rng, 1, 6); // stoppage time
  const cumulative = new Map<number, StatLine>();
  const passTally = new Map<number, PassTally>();
  for (const p of players) {
    cumulative.set(p.id, emptyStat(p.position));
    passTally.set(p.id, { successful: 0, total: 0 });
  }

  const timeline: MatchMinute[] = [];

  for (let minute = 1; minute <= duration; minute++) {
    for (const p of players) {
      const s = cumulative.get(p.id)!;
      const pt = passTally.get(p.id)!;
      s.minutes = minute;

      // Touches & passes (everyone, scaled by position involvement & passing).
      // Rates are tuned so 90-minute totals land in realistic ranges.
      const touchBase =
        p.position === "MID" ? 0.7 : p.position === "DEF" ? 0.55 : p.position === "FWD" ? 0.45 : 0.25;
      const touches = randInt(rng, 0, Math.round(touchBase * 2));
      s.touches += touches;
      // each touch may be a pass attempt
      for (let t = 0; t < touches; t++) {
        if (chance(rng, 0.7)) {
          pt.total += 1;
          if (chance(rng, 0.6 + p.passing * 0.35)) {
            pt.successful += 1;
            s.passes += 1;
          }
          // key pass (leads to a shot)
          if (chance(rng, 0.01 + p.passing * 0.02 * (p.position === "MID" ? 1.5 : 1))) {
            s.keyPasses += 1;
          }
        }
        // dribble
        if (chance(rng, 0.02 + p.attack * 0.03)) s.dribblesSucc += 1;
      }
      s.passAccuracy = pt.total > 0 ? Math.round((pt.successful / pt.total) * 100) : 0;

      // Attacking events (mostly FWD/MID). ~2-3 shots, ~0.4 goals/game for a top FWD.
      const shotRate = (p.position === "FWD" ? 0.025 : p.position === "MID" ? 0.012 : 0.003) * (0.5 + p.attack);
      if (chance(rng, shotRate)) {
        s.shots += 1;
        const onTarget = chance(rng, 0.35 + p.attack * 0.25);
        if (onTarget) {
          s.shotsOnTarget += 1;
          if (chance(rng, 0.18 + p.attack * 0.12)) {
            s.goals += 1;
          }
        }
      }
      // assists (rare, correlated with passing)
      if (chance(rng, 0.0015 + p.passing * 0.002)) s.assists += 1;

      // Defensive events (mostly DEF/MID). ~2-3 tackles/game for a DEF.
      const defRate = (p.position === "DEF" ? 0.022 : p.position === "MID" ? 0.014 : 0.004) * (0.5 + p.defense);
      if (chance(rng, defRate)) s.tackles += 1;
      if (chance(rng, defRate * 0.7)) s.interceptions += 1;
      if (chance(rng, (p.position === "DEF" ? 0.04 : 0.008) * (0.5 + p.defense))) s.clearances += 1;
      if (chance(rng, 0.02)) s.duelsWon += 1;

      // GK saves. ~2-3/game.
      if (p.position === "GK" && chance(rng, 0.02 + (1 - p.defense) * 0.02)) s.saves += 1;

      // Discipline.
      if (chance(rng, 0.012)) s.foulsCommitted += 1;
      if (s.yellow === 0 && chance(rng, 0.0015)) s.yellow = 1;
      if (s.red === 0 && chance(rng, 0.0002)) s.red = 1;

      // Penalties (very rare).
      if (chance(rng, 0.0008) && p.position !== "GK") {
        if (chance(rng, 0.78)) s.penScored += 1;
        else s.penMissed += 1;
      }
      if (chance(rng, 0.0006)) s.penWon += 1;
      if (chance(rng, 0.00015)) s.ownGoals += 1;
    }

    // snapshot
    const snap = new Map<number, StatLine>();
    for (const p of players) snap.set(p.id, clone(cumulative.get(p.id)!));
    timeline.push({ minute, stats: snap });
  }

  const final = new Map<number, StatLine>();
  for (const p of players) final.set(p.id, clone(cumulative.get(p.id)!));

  return { durationMinutes: duration, timeline, final };
}

/** Convenience: a roster of varied players for a fixture. */
export function makeRoster(teamId: number, startId: number, rng: () => number): SimPlayer[] {
  const positions: Position[] = [
    "GK",
    "DEF", "DEF", "DEF", "DEF",
    "MID", "MID", "MID",
    "FWD", "FWD", "FWD",
  ];
  return positions.map((position, i) => ({
    id: startId + i,
    name: `T${teamId} P${i + 1} (${position})`,
    position,
    attack: position === "FWD" ? 0.5 + rng() * 0.5 : position === "MID" ? 0.3 + rng() * 0.4 : rng() * 0.3,
    defense: position === "DEF" ? 0.5 + rng() * 0.5 : position === "MID" ? 0.3 + rng() * 0.4 : rng() * 0.3,
    passing: 0.4 + rng() * 0.6,
  }));
}

import type { Position } from "../types";

/** Every player starts at a neutral 6/10 (SofaScore-style baseline). */
export const BASE = 6.0;

/** raw is on a ~0-12 scale; divide by this then x100 to map into [0,100]. */
export const SCALE_DENOMINATOR = 12;

/** Players with fewer than this many minutes are still scored normally (v1). */
export const MIN_FULL_MINUTES = 15;

/** Weights that apply regardless of position. */
export const UNIVERSAL_WEIGHTS = {
  goals: 2.5,
  assists: 1.5,
  penScored: 1.5,
  penWon: 0.75,
  penMissed: -1.5,
  ownGoals: -2.0,
  yellow: -0.5,
  red: -2.0,
  foulsCommitted: -0.05,
  dribblesSucc: 0.1,
  duelsWon: 0.05,
} as const;

type PosTable = Record<Position, number>;

/**
 * Position-specific weights. `passes` is applied per-10, `passAccuracy` per
 * percentage-point above 70, `touches` per-10 (see computePS).
 */
export const POSITION_WEIGHTS: Record<string, PosTable> = {
  shotsOnTarget: { GK: 0.1, DEF: 0.2, MID: 0.25, FWD: 0.3 },
  shotsOffTarget: { GK: 0.0, DEF: 0.05, MID: 0.05, FWD: 0.1 },
  keyPasses: { GK: 0.1, DEF: 0.2, MID: 0.3, FWD: 0.25 },
  passesPer10: { GK: 0.05, DEF: 0.1, MID: 0.15, FWD: 0.05 },
  passAccuracyPerPct: { GK: 0.01, DEF: 0.02, MID: 0.03, FWD: 0.01 },
  touchesPer10: { GK: 0.02, DEF: 0.03, MID: 0.04, FWD: 0.03 },
  tackles: { GK: 0.05, DEF: 0.3, MID: 0.2, FWD: 0.05 },
  interceptions: { GK: 0.05, DEF: 0.3, MID: 0.2, FWD: 0.05 },
  clearances: { GK: 0.05, DEF: 0.2, MID: 0.05, FWD: 0.0 },
  saves: { GK: 0.6, DEF: 0.1, MID: 0.0, FWD: 0.0 },
};

/** Pass-accuracy only rewards accuracy above this threshold. */
export const PASS_ACCURACY_THRESHOLD = 70;

/** PS value used when a player does not play (minutes < 1). */
export const DNP_NEUTRAL_PS = 50;

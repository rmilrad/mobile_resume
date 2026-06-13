import type { StatLine } from "../types";
import { PS_VERSION } from "../types";
import {
  BASE,
  SCALE_DENOMINATOR,
  UNIVERSAL_WEIGHTS,
  POSITION_WEIGHTS,
  PASS_ACCURACY_THRESHOLD,
  DNP_NEUTRAL_PS,
} from "./weights";

export interface PSResult {
  /** Final settled score, integer in [0,100]. */
  ps: number;
  /** Raw rating on the ~0-12 scale (before normalization). */
  raw: number;
  /** Per-component contributions to `raw` (sums to raw). */
  breakdown: Record<string, number>;
  version: string;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Compute the Performance Score (PS v1) for a player's match stat line.
 * Pure function — identical results in backend (for on-chain posting) and tests.
 * See PRD §3 for the full formula spec.
 */
export function computePS(s: StatLine): PSResult {
  // Special case: did not play -> neutral.
  if (s.minutes < 1) {
    return {
      ps: DNP_NEUTRAL_PS,
      raw: (DNP_NEUTRAL_PS / 100) * SCALE_DENOMINATOR,
      breakdown: { dnpNeutral: (DNP_NEUTRAL_PS / 100) * SCALE_DENOMINATOR },
      version: PS_VERSION,
    };
  }

  const pos = s.position;
  const b: Record<string, number> = {};
  b.base = BASE;

  // Universal contributions.
  b.goals = s.goals * UNIVERSAL_WEIGHTS.goals;
  b.assists = s.assists * UNIVERSAL_WEIGHTS.assists;
  b.penScored = s.penScored * UNIVERSAL_WEIGHTS.penScored;
  b.penWon = s.penWon * UNIVERSAL_WEIGHTS.penWon;
  b.penMissed = s.penMissed * UNIVERSAL_WEIGHTS.penMissed;
  b.ownGoals = s.ownGoals * UNIVERSAL_WEIGHTS.ownGoals;
  b.yellow = s.yellow * UNIVERSAL_WEIGHTS.yellow;
  b.red = s.red * UNIVERSAL_WEIGHTS.red;
  b.foulsCommitted = s.foulsCommitted * UNIVERSAL_WEIGHTS.foulsCommitted;
  b.dribblesSucc = s.dribblesSucc * UNIVERSAL_WEIGHTS.dribblesSucc;
  b.duelsWon = s.duelsWon * UNIVERSAL_WEIGHTS.duelsWon;

  // Position-specific contributions.
  const shotsOffTarget = Math.max(0, s.shots - s.shotsOnTarget);
  const passAccBonus = Math.max(0, s.passAccuracy - PASS_ACCURACY_THRESHOLD);

  b.shotsOnTarget = s.shotsOnTarget * POSITION_WEIGHTS.shotsOnTarget![pos];
  b.shotsOffTarget = shotsOffTarget * POSITION_WEIGHTS.shotsOffTarget![pos];
  b.keyPasses = s.keyPasses * POSITION_WEIGHTS.keyPasses![pos];
  b.passes = Math.floor(s.passes / 10) * POSITION_WEIGHTS.passesPer10![pos];
  b.passAccuracy = passAccBonus * POSITION_WEIGHTS.passAccuracyPerPct![pos];
  b.touches = Math.floor(s.touches / 10) * POSITION_WEIGHTS.touchesPer10![pos];
  b.tackles = s.tackles * POSITION_WEIGHTS.tackles![pos];
  b.interceptions = s.interceptions * POSITION_WEIGHTS.interceptions![pos];
  b.clearances = s.clearances * POSITION_WEIGHTS.clearances![pos];
  b.saves = s.saves * POSITION_WEIGHTS.saves![pos];

  const raw = Object.values(b).reduce((acc, v) => acc + v, 0);
  const ps = clamp(Math.round((raw / SCALE_DENOMINATOR) * 100), 0, 100);

  return { ps, raw, breakdown: b, version: PS_VERSION };
}

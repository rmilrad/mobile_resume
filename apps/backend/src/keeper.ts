import { computePS, type StatLine, type FixtureStatus, PS_VERSION } from "@pitchmarket/shared";

export type KeeperAction =
  | { kind: "NONE" }
  | { kind: "FREEZE" }
  | { kind: "PROPOSE"; ps: number; version: string }
  | { kind: "VOID" };

/**
 * Decide what the oracle keeper should do for a market given the current
 * fixture status and the player's (final) stat line. Pure & deterministic.
 *
 * - FT            -> propose final PS
 * - ABANDONED/POSTPONED -> void
 * - LIVE/HT       -> freeze at the moment the match reaches FT only; while live we
 *                    leave OPEN (trading continues). We freeze just before resolve.
 * - NS            -> nothing
 *
 * `alreadyResolved` / `alreadyProposed` guard idempotency.
 */
export function decideKeeperAction(args: {
  status: FixtureStatus;
  stat: StatLine | undefined;
  alreadyProposed: boolean;
  alreadyResolved: boolean;
}): KeeperAction {
  const { status, stat, alreadyProposed, alreadyResolved } = args;
  if (alreadyResolved) return { kind: "NONE" };

  if (status === "ABANDONED" || status === "POSTPONED") {
    return { kind: "VOID" };
  }

  if (status === "FT") {
    if (alreadyProposed) return { kind: "NONE" };
    const ps = stat ? computePS(stat).ps : 50; // missing stats -> neutral
    return { kind: "PROPOSE", ps, version: PS_VERSION };
  }

  return { kind: "NONE" };
}

/** Compute live PS for display (does not change phase). */
export function livePS(stat: StatLine): number {
  return computePS(stat).ps;
}

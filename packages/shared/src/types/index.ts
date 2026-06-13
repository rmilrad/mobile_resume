// Shared domain types for PitchMarket.

export type Position = "GK" | "DEF" | "MID" | "FWD";

/**
 * Per-player per-fixture statistics. All counters default to 0 when absent.
 * This is the canonical input to the Performance Score (PS) engine.
 */
export interface StatLine {
  minutes: number;
  position: Position;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  keyPasses: number;
  passes: number;
  /** 0-100 percentage */
  passAccuracy: number;
  touches: number;
  dribblesSucc: number;
  tackles: number;
  interceptions: number;
  clearances: number;
  duelsWon: number;
  saves: number;
  penScored: number;
  penMissed: number;
  penWon: number;
  foulsCommitted: number;
  yellow: number;
  red: number;
  ownGoals: number;
}

export type FixtureStatus =
  | "NS" // not started
  | "LIVE"
  | "HT" // half time
  | "FT" // full time
  | "ABANDONED"
  | "POSTPONED";

export interface Player {
  id: number;
  name: string;
  position: Position;
  teamId: number;
  teamName: string;
}

export interface Fixture {
  id: number;
  status: FixtureStatus;
  /** unix seconds */
  kickoff: number;
  /** minute of play, when live */
  minute?: number;
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
}

export type MarketPhase = "OPEN" | "FROZEN" | "RESOLVED" | "VOID";

export interface MarketState {
  playerId: number;
  fixtureId: number;
  phase: MarketPhase;
  /** USDC (6dp) reserves and token (18dp) reserves are tracked in the AMM */
  priceLong: number; // 0..1 (human readable)
  settledPS?: number; // 0..100 when RESOLVED
}

export const PS_VERSION = "v1";

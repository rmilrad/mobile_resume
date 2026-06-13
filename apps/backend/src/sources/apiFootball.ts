import type { Position, StatLine } from "@pitchmarket/shared";

/**
 * API-Football integration. Maps the `fixtures/players` response into our
 * canonical StatLine. Several fields (touches, clearances, ownGoals) are NOT
 * provided by API-Football's per-player stats; they default to 0 and are
 * documented as data-availability gaps (the PS formula tolerates this).
 */

export interface ApiFootballConfig {
  apiKey: string;
  baseUrl?: string;
  host?: string;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Map API-Football position codes (G/D/M/F) to our Position enum. */
export function mapPosition(code: unknown): Position {
  switch (String(code ?? "").toUpperCase()) {
    case "G":
      return "GK";
    case "D":
      return "DEF";
    case "M":
      return "MID";
    case "F":
      return "FWD";
    default:
      return "MID";
  }
}

/** One element of `response[].players[]` from fixtures/players. */
export interface ApiPlayerStats {
  player: { id: number; name: string };
  statistics: Array<Record<string, any>>;
}

/** Pure mapper: API-Football player-stats object -> StatLine. */
export function mapToStatLine(p: ApiPlayerStats): StatLine {
  const s = p.statistics[0] ?? {};
  const games = s.games ?? {};
  const shots = s.shots ?? {};
  const goals = s.goals ?? {};
  const passes = s.passes ?? {};
  const tackles = s.tackles ?? {};
  const duels = s.duels ?? {};
  const dribbles = s.dribbles ?? {};
  const fouls = s.fouls ?? {};
  const cards = s.cards ?? {};
  const penalty = s.penalty ?? {};

  // passAccuracy: API returns either a percentage or a raw count depending on
  // the endpoint; clamp into [0,100].
  let passAccuracy = num(passes.accuracy);
  if (passAccuracy > 100) passAccuracy = 0; // looks like a count, not a percent
  passAccuracy = Math.max(0, Math.min(100, passAccuracy));

  return {
    minutes: num(games.minutes),
    position: mapPosition(games.position),
    goals: num(goals.total),
    assists: num(goals.assists),
    shots: num(shots.total),
    shotsOnTarget: num(shots.on),
    keyPasses: num(passes.key),
    passes: num(passes.total),
    passAccuracy,
    touches: num(s.touches), // not in API-Football -> 0
    dribblesSucc: num(dribbles.success),
    tackles: num(tackles.total),
    interceptions: num(tackles.interceptions),
    clearances: num(tackles.clearances), // not in API-Football -> 0
    duelsWon: num(duels.won),
    saves: num(goals.saves),
    penScored: num(penalty.scored),
    penMissed: num(penalty.missed),
    penWon: num(penalty.won),
    foulsCommitted: num(fouls.committed),
    yellow: num(cards.yellow) > 0 ? 1 : 0,
    red: num(cards.red) > 0 ? 1 : 0,
    ownGoals: num(s.ownGoals), // not in API-Football -> 0
  };
}

/** Map a full fixtures/players response into a map of playerId -> StatLine. */
export function mapFixturePlayers(response: any): Map<number, StatLine> {
  const out = new Map<number, StatLine>();
  const teams = response?.response ?? [];
  for (const team of teams) {
    for (const p of team.players ?? []) {
      out.set(p.player.id, mapToStatLine(p));
    }
  }
  return out;
}

/** Thin HTTP client (used in live mode; mocked in tests). */
export class ApiFootballClient {
  private readonly key: string;
  private readonly baseUrl: string;
  private readonly host: string;

  constructor(cfg: ApiFootballConfig) {
    this.key = cfg.apiKey;
    this.baseUrl = cfg.baseUrl ?? "https://v3.football.api-sports.io";
    this.host = cfg.host ?? "v3.football.api-sports.io";
  }

  private async get(path: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { "x-apisports-key": this.key, "x-rapidapi-host": this.host },
    });
    if (!res.ok) throw new Error(`API-Football ${res.status}: ${path}`);
    return res.json();
  }

  fixturesByDate(date: string): Promise<any> {
    return this.get(`/fixtures?date=${date}`);
  }
  liveFixtures(): Promise<any> {
    return this.get(`/fixtures?live=all`);
  }
  fixturePlayers(fixtureId: number): Promise<any> {
    return this.get(`/fixtures/players?fixture=${fixtureId}`);
  }
}

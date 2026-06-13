import {
  simulateMatch,
  makeRoster,
  makeRng,
  computePS,
  type SimPlayer,
  type MatchResult,
  type Fixture,
  ONE_USDC,
  type Side,
} from "@pitchmarket/shared";
import { Store } from "./store";

const TEAM_NAMES = [
  "Argentina", "France", "Brazil", "England", "Spain", "Germany",
  "Portugal", "Netherlands", "Croatia", "Morocco", "USA", "Mexico",
];

/**
 * Live demo data engine. Spins up a set of fixtures with full rosters and
 * advances them through their match timelines in accelerated real time,
 * driving live PS and market prices with informed/noise trader flow.
 *
 * This is what makes the app fully usable with fake data (no API key needed).
 */
export class SimEngine {
  private fixtures: {
    fixture: Fixture;
    players: SimPlayer[];
    match: MatchResult;
    tickIndex: number;
  }[] = [];

  private rng = makeRng(1);
  private nextFixtureId = 1000;
  private teamCursor = 0;

  constructor(
    private store: Store,
    private opts: { numFixtures?: number; tickMs?: number; seed?: number } = {},
  ) {}

  /** Build fixtures/players/markets and seed the store. */
  init(): void {
    const num = this.opts.numFixtures ?? 6;
    this.rng = makeRng(this.opts.seed ?? 1);
    const liveCount = Math.ceil(num / 2);
    for (let i = 0; i < num; i++) {
      // half live now, half upcoming (staggered kickoffs)
      this.spawnFixture(i < liveCount, i - liveCount);
    }
  }

  /**
   * Create one fixture — roster, per-player markets, and a simulated match —
   * and register it in the store. Used at startup and to regenerate a fresh
   * live match whenever one finishes, so there is always live action.
   */
  private spawnFixture(isLive: boolean, upcomingSlot = 0): void {
    const fixtureId = this.nextFixtureId++;
    const now = Math.floor(Date.now() / 1000);
    const homeId = fixtureId * 2;
    const awayId = fixtureId * 2 + 1;
    const homeName = TEAM_NAMES[this.teamCursor++ % TEAM_NAMES.length]!;
    const awayName = TEAM_NAMES[this.teamCursor++ % TEAM_NAMES.length]!;

    const fixture: Fixture = {
      id: fixtureId,
      status: isLive ? "LIVE" : "NS",
      kickoff: isLive ? now - 60 : now + 1800 * (upcomingSlot + 1),
      minute: isLive ? 1 : undefined,
      homeTeamId: homeId,
      homeTeamName: homeName,
      awayTeamId: awayId,
      awayTeamName: awayName,
    };
    this.store.upsertFixture(fixture);

    const home = makeRoster(homeId, fixtureId * 100, this.rng);
    const away = makeRoster(awayId, fixtureId * 100 + 50, this.rng);
    const players = [...home, ...away];

    const register = (roster: SimPlayer[], teamId: number, teamName: string) => {
      for (const p of roster) {
        p.name = renamePlayer(teamName, p);
        this.store.upsertPlayer({ id: p.id, name: p.name, position: p.position, teamId, teamName });
        this.store.createMarket(p.id, fixtureId);
      }
    };
    register(home, homeId, homeName);
    register(away, awayId, awayName);

    const match = simulateMatch(players, fixtureId + (this.opts.seed ?? 1));
    this.fixtures.push({ fixture, players, match, tickIndex: 0 });
  }

  /** Advance every live fixture by one minute and update markets. */
  tick(): void {
    const finished: number[] = [];
    // iterate a snapshot so regenerated fixtures don't tick within this pass
    for (const entry of [...this.fixtures]) {
      if (entry.fixture.status !== "LIVE" && entry.fixture.status !== "HT") continue;
      const { match, players, fixture } = entry;
      if (entry.tickIndex >= match.timeline.length) {
        // match finished — settle it and queue a fresh live match to replace it
        fixture.status = "FT";
        fixture.minute = match.durationMinutes;
        finished.push(fixture.id);
        continue;
      }
      const frame = match.timeline[entry.tickIndex]!;
      fixture.minute = frame.minute;

      const rng = makeRng((fixture.id + 1) * (frame.minute + 7));
      for (const p of players) {
        const rec = this.store.getMarket(p.id, fixture.id);
        if (!rec) continue;
        const stat = frame.stats.get(p.id)!;
        const livePS = computePS(stat).ps;
        const fair = livePS / 100;
        // a few informed/noise trades to move the price toward fair value
        for (let t = 0; t < 5; t++) {
          const price = rec.market.priceLong();
          let side: Side;
          if (rng() < 0.6) {
            if (price < fair - 0.03) side = "LONG";
            else if (price > fair + 0.03) side = "SHORT";
            else continue;
          } else {
            side = rng() < 0.5 ? "LONG" : "SHORT";
          }
          try {
            rec.market.buy(side, BigInt(1 + Math.floor(rng() * 120)) * ONE_USDC);
          } catch {
            /* skip pathological trade */
          }
        }
        this.store.recordPrice(rec, livePS, frame.minute);
      }
      entry.tickIndex++;
    }

    // Stop ticking finished matches (store keeps them for history) and spawn a
    // fresh live match for each, so the Live tab is never empty.
    if (finished.length) {
      this.fixtures = this.fixtures.filter((e) => !finished.includes(e.fixture.id));
      for (let i = 0; i < finished.length; i++) this.spawnFixture(true);
    }
  }

  /** Start the accelerated clock. Returns a stop function. */
  start(): () => void {
    const interval = setInterval(() => this.tick(), this.opts.tickMs ?? 1000);
    return () => clearInterval(interval);
  }
}

function renamePlayer(team: string, p: SimPlayer): string {
  return `${team} #${(p.id % 100) + 1} (${p.position})`;
}

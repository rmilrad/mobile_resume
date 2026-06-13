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

  constructor(
    private store: Store,
    private opts: { numFixtures?: number; tickMs?: number; seed?: number } = {},
  ) {}

  /** Build fixtures/players/markets and seed the store. */
  init(): void {
    const num = this.opts.numFixtures ?? 6;
    const rng = makeRng(this.opts.seed ?? 1);
    const now = Math.floor(Date.now() / 1000);

    for (let i = 0; i < num; i++) {
      const fixtureId = 1000 + i;
      const homeId = i * 2;
      const awayId = i * 2 + 1;
      const homeName = TEAM_NAMES[(i * 2) % TEAM_NAMES.length]!;
      const awayName = TEAM_NAMES[(i * 2 + 1) % TEAM_NAMES.length]!;

      // half the fixtures are live, half upcoming
      const isLive = i < Math.ceil(num / 2);
      const fixture: Fixture = {
        id: fixtureId,
        status: isLive ? "LIVE" : "NS",
        kickoff: isLive ? now - 600 : now + 3600 * (i + 1),
        minute: isLive ? 1 : undefined,
        homeTeamId: homeId,
        homeTeamName: homeName,
        awayTeamId: awayId,
        awayTeamName: awayName,
      };
      this.store.upsertFixture(fixture);

      const home = makeRoster(homeId, fixtureId * 100, rng);
      const away = makeRoster(awayId, fixtureId * 100 + 50, rng);
      const players = [...home, ...away];

      const register = (roster: SimPlayer[], teamId: number, teamName: string) => {
        for (const p of roster) {
          p.name = renamePlayer(teamName, p);
          this.store.upsertPlayer({
            id: p.id,
            name: p.name,
            position: p.position,
            teamId,
            teamName,
          });
          this.store.createMarket(p.id, fixtureId);
        }
      };
      register(home, homeId, homeName);
      register(away, awayId, awayName);

      const match = simulateMatch(players, fixtureId + (this.opts.seed ?? 1));
      this.fixtures.push({ fixture, players, match, tickIndex: 0 });
    }
  }

  /** Advance every live fixture by one minute and update markets. */
  tick(): void {
    for (const entry of this.fixtures) {
      if (entry.fixture.status !== "LIVE" && entry.fixture.status !== "HT") continue;
      const { match, players, fixture } = entry;
      if (entry.tickIndex >= match.timeline.length) {
        // match finished
        fixture.status = "FT";
        fixture.minute = match.durationMinutes;
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

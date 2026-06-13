/**
 * In-browser sim engine — the self-contained demo data source.
 *
 * Runs the SAME simulation the backend does (shared FPMM market model, PS
 * formula, game sim), but entirely client-side, so the app needs no backend
 * and can be deployed as a standalone static site. Activated when
 * NEXT_PUBLIC_DEMO === "1" (see lib/api.ts). Mirrors the backend REST + SSE
 * responses exactly, so screens are unchanged.
 */

import {
  simulateMatch,
  makeRoster,
  makeRng,
  computePS,
  FpmmMarket,
  ONE_USDC,
  type SimPlayer,
  type MatchResult,
  type Fixture,
  type Player,
  type Side,
} from "@pitchmarket/shared";

interface MarketRecord {
  playerId: number;
  fixtureId: number;
  market: FpmmMarket;
  priceHistory: { t: number; priceLong: number; livePS: number }[];
}

interface PriceEvent {
  fixtureId: number;
  playerId: number;
  priceLong: number;
  livePS: number;
  minute: number;
}

const TEAM_NAMES = [
  "Argentina", "France", "Brazil", "England", "Spain", "Germany",
  "Portugal", "Netherlands", "Croatia", "Morocco", "USA", "Mexico",
];

const renamePlayer = (team: string, p: SimPlayer) => `${team} #${(p.id % 100) + 1} (${p.position})`;

class DemoEngine {
  fixtures = new Map<number, Fixture>();
  players = new Map<number, Player>();
  markets = new Map<string, MarketRecord>();

  private entries: { fixture: Fixture; players: SimPlayer[]; match: MatchResult; tickIndex: number }[] = [];
  private listeners = new Set<(e: PriceEvent) => void>();
  private rng = makeRng(1);
  private nextFixtureId = 1000;
  private teamCursor = 0;
  private started = false;

  key(playerId: number, fixtureId: number) {
    return `${playerId}:${fixtureId}`;
  }

  start() {
    if (this.started) return;
    this.started = true;
    const liveCount = 3;
    for (let i = 0; i < 6; i++) this.spawn(i < liveCount, i - liveCount);
    setInterval(() => this.tick(), 1500);
  }

  private spawn(isLive: boolean, upcomingSlot = 0) {
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
    this.fixtures.set(fixtureId, fixture);

    const home = makeRoster(homeId, fixtureId * 100, this.rng);
    const away = makeRoster(awayId, fixtureId * 100 + 50, this.rng);
    const players = [...home, ...away];

    const register = (roster: SimPlayer[], teamId: number, teamName: string) => {
      for (const p of roster) {
        p.name = renamePlayer(teamName, p);
        this.players.set(p.id, { id: p.id, name: p.name, position: p.position, teamId, teamName });
        const k = this.key(p.id, fixtureId);
        if (!this.markets.has(k)) {
          this.markets.set(k, { playerId: p.id, fixtureId, market: new FpmmMarket(5000n * ONE_USDC), priceHistory: [] });
        }
      }
    };
    register(home, homeId, homeName);
    register(away, awayId, awayName);

    const match = simulateMatch(players, fixtureId + 1);
    this.entries.push({ fixture, players, match, tickIndex: 0 });
  }

  private tick() {
    const finished: number[] = [];
    for (const entry of [...this.entries]) {
      if (entry.fixture.status !== "LIVE" && entry.fixture.status !== "HT") continue;
      const { match, players, fixture } = entry;
      if (entry.tickIndex >= match.timeline.length) {
        fixture.status = "FT";
        fixture.minute = match.durationMinutes;
        finished.push(fixture.id);
        continue;
      }
      const frame = match.timeline[entry.tickIndex]!;
      fixture.minute = frame.minute;
      const rng = makeRng((fixture.id + 1) * (frame.minute + 7));
      for (const p of players) {
        const rec = this.markets.get(this.key(p.id, fixture.id));
        if (!rec) continue;
        const stat = frame.stats.get(p.id)!;
        const livePS = computePS(stat).ps;
        const fair = livePS / 100;
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
        const priceLong = rec.market.priceLong();
        rec.priceHistory.push({ t: Date.now(), priceLong, livePS });
        this.emit({ fixtureId: rec.fixtureId, playerId: rec.playerId, priceLong, livePS, minute: frame.minute });
      }
      entry.tickIndex++;
    }
    if (finished.length) {
      this.entries = this.entries.filter((e) => !finished.includes(e.fixture.id));
      for (let i = 0; i < finished.length; i++) this.spawn(true);
    }
  }

  fixturesByStatus(statuses: string[]) {
    return [...this.fixtures.values()].filter((f) => statuses.includes(f.status));
  }

  fixtureMarkets(id: number) {
    const fixture = this.fixtures.get(id);
    if (!fixture) return undefined;
    const markets = [];
    for (const rec of this.markets.values()) {
      if (rec.fixtureId !== id) continue;
      const player = this.players.get(rec.playerId);
      const last = rec.priceHistory[rec.priceHistory.length - 1];
      markets.push({
        playerId: rec.playerId,
        player,
        priceLong: rec.market.priceLong(),
        livePS: last?.livePS ?? 50,
        phase: rec.market.phase,
      });
    }
    return { fixture, markets };
  }

  marketDetail(playerId: number, fixtureId: number) {
    const rec = this.markets.get(this.key(playerId, fixtureId));
    if (!rec) return undefined;
    return {
      player: this.players.get(playerId),
      fixture: this.fixtures.get(fixtureId),
      priceLong: rec.market.priceLong(),
      phase: rec.market.phase,
      settledPS: undefined,
      history: rec.priceHistory,
    };
  }

  searchPlayers(q: string) {
    const lc = q.toLowerCase();
    return [...this.players.values()].filter(
      (p) => p.name.toLowerCase().includes(lc) || p.teamName.toLowerCase().includes(lc),
    );
  }

  subscribe(fn: (e: PriceEvent) => void, fixtureId?: number) {
    const wrapped = (e: PriceEvent) => {
      if (fixtureId && e.fixtureId !== fixtureId) return;
      fn(e);
    };
    this.listeners.add(wrapped);
    return () => this.listeners.delete(wrapped);
  }

  private emit(e: PriceEvent) {
    for (const l of this.listeners) l(e);
  }
}

let engine: DemoEngine | null = null;

/** Lazily create + start the in-browser engine (client only). */
export function getDemoEngine(): DemoEngine {
  if (!engine) {
    engine = new DemoEngine();
    if (typeof window !== "undefined") engine.start();
  }
  return engine;
}

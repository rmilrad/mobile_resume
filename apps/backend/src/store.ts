import type { Fixture, Player, FixtureStatus } from "@pitchmarket/shared";
import { FpmmMarket, ONE_USDC } from "@pitchmarket/shared";

export interface MarketRecord {
  playerId: number;
  fixtureId: number;
  market: FpmmMarket;
  priceHistory: { t: number; priceLong: number; livePS: number }[];
}

type Listener = (event: PriceEvent) => void;

export interface PriceEvent {
  type: "price";
  fixtureId: number;
  playerId: number;
  priceLong: number;
  livePS: number;
  minute: number;
}

/** In-memory store of fixtures, players, markets and price history (MVP). */
export class Store {
  fixtures = new Map<number, Fixture>();
  players = new Map<number, Player>();
  /** key = `${playerId}:${fixtureId}` */
  markets = new Map<string, MarketRecord>();
  private listeners = new Set<Listener>();

  key(playerId: number, fixtureId: number) {
    return `${playerId}:${fixtureId}`;
  }

  upsertFixture(f: Fixture) {
    this.fixtures.set(f.id, f);
  }
  upsertPlayer(p: Player) {
    this.players.set(p.id, p);
  }

  createMarket(playerId: number, fixtureId: number, seedUsdc = 5000): MarketRecord {
    const k = this.key(playerId, fixtureId);
    let rec = this.markets.get(k);
    if (!rec) {
      rec = {
        playerId,
        fixtureId,
        market: new FpmmMarket(BigInt(seedUsdc) * ONE_USDC),
        priceHistory: [],
      };
      this.markets.set(k, rec);
    }
    return rec;
  }

  getMarket(playerId: number, fixtureId: number): MarketRecord | undefined {
    return this.markets.get(this.key(playerId, fixtureId));
  }

  fixturesByStatus(statuses: FixtureStatus[]): Fixture[] {
    return [...this.fixtures.values()].filter((f) => statuses.includes(f.status));
  }

  searchPlayers(q: string): Player[] {
    const lc = q.toLowerCase();
    return [...this.players.values()].filter(
      (p) => p.name.toLowerCase().includes(lc) || p.teamName.toLowerCase().includes(lc),
    );
  }

  recordPrice(rec: MarketRecord, livePS: number, minute: number) {
    const priceLong = rec.market.priceLong();
    rec.priceHistory.push({ t: Date.now(), priceLong, livePS });
    this.emit({ type: "price", fixtureId: rec.fixtureId, playerId: rec.playerId, priceLong, livePS, minute });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(e: PriceEvent) {
    for (const l of this.listeners) l(e);
  }
}

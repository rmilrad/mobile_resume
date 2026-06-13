/** Backend REST + SSE client. In DEMO mode (NEXT_PUBLIC_DEMO==="1") the data
 * comes from an in-browser sim engine instead — self-contained, no backend, so
 * the app can be hosted as a standalone static site. Screens are unchanged. */

import type { Fixture, Player } from "@pitchmarket/shared";
import { getDemoEngine } from "./demoEngine";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

export interface MarketSummary {
  playerId: number;
  player: Player;
  priceLong: number;
  livePS: number;
  phase: string;
}

export interface MarketDetail {
  player: Player;
  fixture: Fixture;
  priceLong: number;
  phase: string;
  settledPS?: number;
  history: { t: number; priceLong: number; livePS: number }[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

const statusFilter: Record<string, string[]> = {
  live: ["LIVE", "HT"],
  upcoming: ["NS"],
  all: ["LIVE", "HT", "NS", "FT"],
};

export const api = {
  fixtures: (status: "live" | "upcoming" | "all" = "all") => {
    if (DEMO) {
      const e = getDemoEngine();
      const fixtures = status === "all" ? [...e.fixtures.values()] : e.fixturesByStatus(statusFilter[status]!);
      return Promise.resolve({ fixtures });
    }
    return get<{ fixtures: Fixture[] }>(`/fixtures?status=${status}`);
  },
  fixtureMarkets: (id: number) => {
    if (DEMO) {
      const res = getDemoEngine().fixtureMarkets(id);
      return res
        ? Promise.resolve(res as { fixture: Fixture; markets: MarketSummary[] })
        : Promise.reject(new Error("fixture not found"));
    }
    return get<{ fixture: Fixture; markets: MarketSummary[] }>(`/fixtures/${id}/markets`);
  },
  market: (playerId: number, fixtureId: number) => {
    if (DEMO) {
      const res = getDemoEngine().marketDetail(playerId, fixtureId);
      return res ? Promise.resolve(res as MarketDetail) : Promise.reject(new Error("market not found"));
    }
    return get<MarketDetail>(`/markets/${playerId}/${fixtureId}`);
  },
  search: (q: string) => {
    if (DEMO) return Promise.resolve({ players: q ? getDemoEngine().searchPlayers(q) : [] });
    return get<{ players: Player[] }>(`/players/search?q=${encodeURIComponent(q)}`);
  },
};

/** Subscribe to live price events. SSE against the backend, or the in-browser
 * engine's event bus in DEMO mode. Returns an unsubscribe function. */
export function subscribePrices(
  onPrice: (e: { fixtureId: number; playerId: number; priceLong: number; livePS: number; minute: number }) => void,
  fixtureId?: number,
): () => void {
  if (typeof window === "undefined") return () => {};
  if (DEMO) return getDemoEngine().subscribe(onPrice, fixtureId);
  const url = `${BASE}/stream${fixtureId ? `?fixture=${fixtureId}` : ""}`;
  const es = new EventSource(url);
  es.addEventListener("price", (ev) => {
    try {
      onPrice(JSON.parse((ev as MessageEvent).data));
    } catch {
      /* ignore malformed */
    }
  });
  return () => es.close();
}

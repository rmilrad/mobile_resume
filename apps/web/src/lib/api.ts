/** Backend REST + SSE client. */

import type { Fixture, Player } from "@pitchmarket/shared";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

export const api = {
  fixtures: (status: "live" | "upcoming" | "all" = "all") =>
    get<{ fixtures: Fixture[] }>(`/fixtures?status=${status}`),
  fixtureMarkets: (id: number) =>
    get<{ fixture: Fixture; markets: MarketSummary[] }>(`/fixtures/${id}/markets`),
  market: (playerId: number, fixtureId: number) =>
    get<MarketDetail>(`/markets/${playerId}/${fixtureId}`),
  search: (q: string) => get<{ players: Player[] }>(`/players/search?q=${encodeURIComponent(q)}`),
};

/** Subscribe to live price events via SSE. Returns an unsubscribe function. */
export function subscribePrices(
  onPrice: (e: { fixtureId: number; playerId: number; priceLong: number; livePS: number; minute: number }) => void,
  fixtureId?: number,
): () => void {
  if (typeof window === "undefined") return () => {};
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

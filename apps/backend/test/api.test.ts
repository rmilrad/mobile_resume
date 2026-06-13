import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { Store } from "../src/store";
import { SimEngine } from "../src/simEngine";
import { createApi } from "../src/api";
import type { Express } from "express";

let app: Express;
let store: Store;

beforeAll(() => {
  store = new Store();
  const engine = new SimEngine(store, { numFixtures: 4, seed: 7 });
  engine.init();
  // advance a few ticks so there is price history
  for (let i = 0; i < 10; i++) engine.tick();
  app = createApi(store);
});

describe("REST API", () => {
  it("GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("GET /fixtures?status=live returns live fixtures", async () => {
    const res = await request(app).get("/fixtures?status=live");
    expect(res.status).toBe(200);
    expect(res.body.fixtures.length).toBeGreaterThan(0);
    for (const f of res.body.fixtures) expect(["LIVE", "HT"]).toContain(f.status);
  });

  it("GET /fixtures?status=upcoming returns NS fixtures", async () => {
    const res = await request(app).get("/fixtures?status=upcoming");
    expect(res.status).toBe(200);
    for (const f of res.body.fixtures) expect(f.status).toBe("NS");
  });

  it("GET /fixtures/:id/markets returns players with prices", async () => {
    const live = (await request(app).get("/fixtures?status=live")).body.fixtures[0];
    const res = await request(app).get(`/fixtures/${live.id}/markets`);
    expect(res.status).toBe(200);
    expect(res.body.markets.length).toBe(22); // full two rosters
    for (const m of res.body.markets) {
      expect(m.priceLong).toBeGreaterThan(0);
      expect(m.priceLong).toBeLessThan(1);
      expect(m.player).toBeTruthy();
    }
  });

  it("GET /markets/:player/:fixture returns history", async () => {
    const live = (await request(app).get("/fixtures?status=live")).body.fixtures[0];
    const markets = (await request(app).get(`/fixtures/${live.id}/markets`)).body.markets;
    const m = markets[0];
    const res = await request(app).get(`/markets/${m.playerId}/${live.id}`);
    expect(res.status).toBe(200);
    expect(res.body.history.length).toBeGreaterThan(0);
    expect(res.body.player).toBeTruthy();
  });

  it("GET /markets/:player/:fixture/quote returns a token quote", async () => {
    const live = (await request(app).get("/fixtures?status=live")).body.fixtures[0];
    const m = (await request(app).get(`/fixtures/${live.id}/markets`)).body.markets[0];
    const res = await request(app).get(`/markets/${m.playerId}/${live.id}/quote?side=LONG&usdc=100`);
    expect(res.status).toBe(200);
    expect(BigInt(res.body.tokensOut)).toBeGreaterThan(0n);
  });

  it("GET /players/search finds players by team name", async () => {
    const live = (await request(app).get("/fixtures?status=live")).body.fixtures[0];
    const res = await request(app).get(`/players/search?q=${encodeURIComponent(live.homeTeamName)}`);
    expect(res.status).toBe(200);
    expect(res.body.players.length).toBeGreaterThan(0);
  });

  it("GET /fixtures/:id/markets 404 for unknown fixture", async () => {
    const res = await request(app).get(`/fixtures/999999/markets`);
    expect(res.status).toBe(404);
  });
});

describe("SimEngine", () => {
  it("price history accumulates and stays bounded", () => {
    let points = 0;
    for (const rec of store.markets.values()) {
      points += rec.priceHistory.length;
      for (const h of rec.priceHistory) {
        expect(h.priceLong).toBeGreaterThan(0);
        expect(h.priceLong).toBeLessThan(1);
      }
    }
    expect(points).toBeGreaterThan(0);
  });
});

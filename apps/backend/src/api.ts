import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import { computePS } from "@pitchmarket/shared";
import { Store } from "./store";

/** Build the REST + SSE API over a Store. */
export function createApi(store: Store): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // List fixtures by status: ?status=live|upcoming|all
  app.get("/fixtures", (req: Request, res: Response) => {
    const status = String(req.query.status ?? "all");
    let fixtures;
    if (status === "live") fixtures = store.fixturesByStatus(["LIVE", "HT"]);
    else if (status === "upcoming") fixtures = store.fixturesByStatus(["NS"]);
    else fixtures = [...store.fixtures.values()];
    res.json({ fixtures });
  });

  // Players for a fixture, with current market price + live PS.
  app.get("/fixtures/:id/markets", (req: Request, res: Response) => {
    const fixtureId = Number(req.params.id);
    const fixture = store.fixtures.get(fixtureId);
    if (!fixture) return res.status(404).json({ error: "fixture not found" });
    const out = [];
    for (const rec of store.markets.values()) {
      if (rec.fixtureId !== fixtureId) continue;
      const player = store.players.get(rec.playerId);
      const last = rec.priceHistory[rec.priceHistory.length - 1];
      out.push({
        playerId: rec.playerId,
        player,
        priceLong: rec.market.priceLong(),
        livePS: last?.livePS ?? 50,
        phase: rec.market.phase,
      });
    }
    res.json({ fixture, markets: out });
  });

  // Single market detail: price history + current state.
  app.get("/markets/:player/:fixture", (req: Request, res: Response) => {
    const playerId = Number(req.params.player);
    const fixtureId = Number(req.params.fixture);
    const rec = store.getMarket(playerId, fixtureId);
    if (!rec) return res.status(404).json({ error: "market not found" });
    const player = store.players.get(playerId);
    const fixture = store.fixtures.get(fixtureId);
    res.json({
      player,
      fixture,
      priceLong: rec.market.priceLong(),
      phase: rec.market.phase,
      settledPS: rec.market.phase === "RESOLVED" ? rec.market.settledPS : undefined,
      history: rec.priceHistory,
    });
  });

  // Player search.
  app.get("/players/search", (req: Request, res: Response) => {
    const q = String(req.query.q ?? "");
    res.json({ players: q ? store.searchPlayers(q) : [] });
  });

  // Quote a trade (pure read off the in-memory market model).
  app.get("/markets/:player/:fixture/quote", (req: Request, res: Response) => {
    const rec = store.getMarket(Number(req.params.player), Number(req.params.fixture));
    if (!rec) return res.status(404).json({ error: "market not found" });
    const side = String(req.query.side ?? "LONG") === "SHORT" ? "SHORT" : "LONG";
    const usdc = BigInt(Math.max(1, Math.floor(Number(req.query.usdc ?? 10)))) * 1_000_000n;
    try {
      const tokensOut = rec.market.calcBuy(side, usdc);
      res.json({ side, usdcIn: usdc.toString(), tokensOut: tokensOut.toString() });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // SSE stream of live price updates (optionally filtered by ?fixture=).
  app.get("/stream", (req: Request, res: Response) => {
    const fixtureFilter = req.query.fixture ? Number(req.query.fixture) : undefined;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    res.write(`event: ping\ndata: {}\n\n`);

    const unsub = store.subscribe((e) => {
      if (fixtureFilter && e.fixtureId !== fixtureFilter) return;
      res.write(`event: price\ndata: ${JSON.stringify(e)}\n\n`);
    });
    req.on("close", () => unsub());
  });

  return app;
}

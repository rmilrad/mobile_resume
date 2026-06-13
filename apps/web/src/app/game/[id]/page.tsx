"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Fixture } from "@pitchmarket/shared";
import { api, type MarketSummary } from "../../../lib/api";
import { useLivePrices, tickKey } from "../../../lib/useLivePrices";
import { formatPriceCents } from "../../../lib/format";

export default function GamePage() {
  const params = useParams();
  const fixtureId = Number(params.id);
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [markets, setMarkets] = useState<MarketSummary[] | null>(null);
  const ticks = useLivePrices(fixtureId);

  useEffect(() => {
    api.fixtureMarkets(fixtureId)
      .then((r) => { setFixture(r.fixture); setMarkets(r.markets); })
      .catch(() => setMarkets([]));
  }, [fixtureId]);

  const sorted = markets
    ? [...markets].sort((a, b) => priceFor(b) - priceFor(a))
    : null;

  function priceFor(m: MarketSummary): number {
    return ticks[tickKey(m.playerId, fixtureId)]?.priceLong ?? m.priceLong;
  }

  return (
    <div>
      <Link href="/" className="muted">← Back</Link>
      {fixture && (
        <div style={{ margin: "12px 0 20px" }}>
          <div className="teams" style={{ fontSize: 22 }}>{fixture.homeTeamName} vs {fixture.awayTeamName}</div>
          {(fixture.status === "LIVE" || fixture.status === "HT") && (
            <span className="live-badge"><span className="live-dot" /> {fixture.status === "HT" ? "Half time" : `${fixture.minute}'`}</span>
          )}
        </div>
      )}

      {sorted === null && (<><div className="skeleton" /><div className="skeleton" /></>)}

      {sorted && (
        <div className="card" style={{ cursor: "default" }}>
          <div className="row muted" style={{ marginBottom: 4 }}>
            <span>Player</span><span>LONG price</span>
          </div>
          {sorted.map((m) => {
            const price = priceFor(m);
            const ps = ticks[tickKey(m.playerId, fixtureId)]?.livePS ?? m.livePS;
            return (
              <Link key={m.playerId} href={`/market/${m.playerId}/${fixtureId}`} className="market-row">
                <div className="player-meta">
                  <div className="avatar">{(m.player?.name ?? "?").slice(0, 2)}</div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{m.player?.name}</div>
                    <div className="muted">PS {ps} · live</div>
                  </div>
                </div>
                <div className="player-meta">
                  <span className="pos-chip">{m.player?.position}</span>
                  <span className="price-tag">{formatPriceCents(price)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

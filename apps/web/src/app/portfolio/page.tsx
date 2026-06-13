"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "../../wallet/WalletContext";
import { useLivePrices, tickKey } from "../../lib/useLivePrices";
import { positionValue, positionPnl, positionPnlPct } from "../../lib/trade";
import { formatUsd, formatSigned, formatPct, formatPriceCents } from "../../lib/format";
import { api } from "../../lib/api";

export default function PortfolioPage() {
  const wallet = useWallet();
  const ticks = useLivePrices();
  const [names, setNames] = useState<Record<number, string>>({});

  // resolve player names for display
  useEffect(() => {
    const missing = wallet.positions.map((p) => p.playerId).filter((id) => !names[id]);
    if (missing.length === 0) return;
    // best-effort: pull each market for the player name
    Promise.all(
      wallet.positions.map((p) =>
        api.market(p.playerId, p.fixtureId).then((m) => [p.playerId, m.player?.name ?? `Player ${p.playerId}`] as const).catch(() => [p.playerId, `Player ${p.playerId}`] as const),
      ),
    ).then((pairs) => setNames(Object.fromEntries(pairs)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.positions.length]);

  if (!wallet.connected) {
    return <div className="empty">Connect your wallet to view positions.<br /><br /><button className="btn btn-primary" onClick={wallet.connect}>Connect</button></div>;
  }
  if (wallet.positions.length === 0) {
    return <div className="empty">No open positions yet.<br /><br /><Link href="/" className="btn btn-primary" style={{ display: "inline-block", textDecoration: "none" }}>Browse markets</Link></div>;
  }

  let totalValue = 0;
  let totalPnl = 0;
  for (const pos of wallet.positions) {
    const price = ticks[tickKey(pos.playerId, pos.fixtureId)]?.priceLong ?? pos.entryPrice;
    totalValue += positionValue(pos, price);
    totalPnl += positionPnl(pos, price);
  }

  return (
    <div>
      <div className="card" style={{ cursor: "default" }}>
        <div className="muted">Positions value</div>
        <div style={{ fontSize: 30, fontWeight: 800 }}>{formatUsd(totalValue)}</div>
        <div className={totalPnl >= 0 ? "delta-up" : "delta-down"} style={{ fontWeight: 700 }}>
          {formatSigned(totalPnl)} ({formatPct(totalValue > 0 ? totalPnl / (totalValue - totalPnl || 1) : 0)})
        </div>
      </div>

      {wallet.positions.map((pos) => {
        const price = ticks[tickKey(pos.playerId, pos.fixtureId)]?.priceLong ?? pos.entryPrice;
        const pnl = positionPnl(pos, price);
        const pnlPct = positionPnlPct(pos, price);
        return (
          <Link key={`${pos.playerId}:${pos.fixtureId}:${pos.side}`} href={`/market/${pos.playerId}/${pos.fixtureId}`} className="card">
            <div className="row">
              <div>
                <div style={{ fontWeight: 700 }}>{names[pos.playerId] ?? `Player ${pos.playerId}`}</div>
                <div className="muted">{pos.shares.toFixed(1)} {pos.side} · entry {formatPriceCents(pos.entryPrice)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 800 }}>{formatUsd(positionValue(pos, price))}</div>
                <div className={pnl >= 0 ? "delta-up" : "delta-down"}>{formatSigned(pnl)} ({formatPct(pnlPct)})</div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, type MarketDetail } from "../../../../lib/api";
import { useLivePrices, tickKey } from "../../../../lib/useLivePrices";
import { useWallet } from "../../../../wallet/WalletContext";
import { PriceChart } from "../../../../components/Sparkline";
import { formatPriceCents, formatUsd } from "../../../../lib/format";
import { estimateShares, type Side } from "../../../../lib/trade";

export default function MarketPage() {
  const params = useParams();
  const playerId = Number(params.player);
  const fixtureId = Number(params.fixture);
  const wallet = useWallet();
  const ticks = useLivePrices(fixtureId);

  const [detail, setDetail] = useState<MarketDetail | null>(null);
  const [side, setSide] = useState<Side>("LONG");
  const [amount, setAmount] = useState(25);
  const [showSheet, setShowSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.market(playerId, fixtureId).then(setDetail).catch(() => setDetail(null));
  }, [playerId, fixtureId]);

  const live = ticks[tickKey(playerId, fixtureId)];
  const priceLong = live?.priceLong ?? detail?.priceLong ?? 0.5;
  const livePS = live?.livePS ?? 50;
  const sidePriceVal = side === "LONG" ? priceLong : 1 - priceLong;
  const estShares = estimateShares(amount, side, priceLong);

  const history = useMemo(() => {
    const base = detail?.history.map((h) => h.priceLong) ?? [];
    if (live) return [...base, live.priceLong];
    return base;
  }, [detail, live]);

  function confirmBuy() {
    if (!wallet.connected) { wallet.connect(); return; }
    if (wallet.usdc < amount) { setToast("Insufficient USDC — use the faucet"); return; }
    wallet.buy({ playerId, fixtureId, side, usdc: amount, priceLong });
    setShowSheet(false);
    setToast(`Bought ${estShares.toFixed(1)} ${side} shares`);
    setTimeout(() => setToast(null), 2500);
  }

  if (!detail) return <div className="skeleton" style={{ height: 200 }} />;

  const isOpen = detail.phase === "OPEN" || !detail.phase;
  const frozen = detail.phase === "FROZEN";

  return (
    <div>
      <Link href={`/game/${fixtureId}`} className="muted">← {detail.fixture?.homeTeamName} vs {detail.fixture?.awayTeamName}</Link>

      <div style={{ margin: "12px 0" }}>
        <div className="row">
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{detail.player?.name}</div>
            <div className="muted">{detail.player?.teamName} · {detail.player?.position}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 30, fontWeight: 800 }}>{formatPriceCents(priceLong)}</div>
            <div className="muted">LONG price</div>
          </div>
        </div>
      </div>

      <PriceChart data={history} />

      <div className="stat-grid">
        <div className="stat-box"><div className="label">Live Perf. Score</div><div className="value">{livePS}/100</div></div>
        <div className="stat-box"><div className="label">SHORT price</div><div className="value">{formatPriceCents(1 - priceLong)}</div></div>
      </div>

      {frozen && <div className="card" style={{ cursor: "default", textAlign: "center" }}>⏸ Trading frozen — awaiting settlement</div>}
      {detail.phase === "RESOLVED" && (
        <div className="card" style={{ cursor: "default", textAlign: "center" }}>
          ✅ Settled at PS {detail.settledPS}/100
        </div>
      )}

      {isOpen && (
        <>
          <div className="segmented">
            <button className={side === "LONG" ? "long-active" : ""} onClick={() => setSide("LONG")}>
              Long {formatPriceCents(priceLong)}
            </button>
            <button className={side === "SHORT" ? "short-active" : ""} onClick={() => setSide("SHORT")}>
              Short {formatPriceCents(1 - priceLong)}
            </button>
          </div>

          <input
            className="amount-input"
            type="number"
            value={amount}
            min={1}
            onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
          />
          <div className="chips">
            {[5, 25, 100].map((v) => (
              <button key={v} className="chip" onClick={() => setAmount(v)}>${v}</button>
            ))}
            <button className="chip" onClick={() => setAmount(Math.floor(wallet.usdc))}>Max</button>
          </div>

          <div className="sheet-row muted"><span>Est. shares</span><span>{estShares.toFixed(1)}</span></div>
          <div className="sheet-row muted"><span>Max payout</span><span>{formatUsd(estShares)}</span></div>

          <button
            className={side === "LONG" ? "btn btn-green" : "btn btn-red"}
            style={{ marginTop: 12 }}
            disabled={amount <= 0}
            onClick={() => (wallet.connected ? setShowSheet(true) : wallet.connect())}
          >
            {wallet.connected ? `${side === "LONG" ? "Go Long" : "Go Short"} · ${formatUsd(amount, 0)}` : "Connect to trade"}
          </button>
        </>
      )}

      {showSheet && (
        <div className="sheet-backdrop" onClick={() => setShowSheet(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm {side.toLowerCase()} · {detail.player?.name}</h3>
            <div className="sheet-row"><span className="muted">Side</span><span>{side}</span></div>
            <div className="sheet-row"><span className="muted">Price</span><span>{formatPriceCents(sidePriceVal)}</span></div>
            <div className="sheet-row"><span className="muted">Amount</span><span>{formatUsd(amount)}</span></div>
            <div className="sheet-row"><span className="muted">Est. shares</span><span>{estShares.toFixed(1)}</span></div>
            <div className="sheet-row"><span className="muted">Max payout</span><span>{formatUsd(estShares)}</span></div>
            <div className="sheet-row muted" style={{ fontSize: 12 }}><span>Gas</span><span>Sponsored (Paymaster)</span></div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={confirmBuy}>
              Confirm — sign once
            </button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Fixture, Player } from "@pitchmarket/shared";
import { api } from "../lib/api";

export default function HomePage() {
  const [tab, setTab] = useState<"live" | "upcoming">("live");
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[]>([]);

  useEffect(() => {
    setFixtures(null);
    api.fixtures(tab).then((r) => setFixtures(r.fixtures)).catch(() => setFixtures([]));
  }, [tab]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api.search(query).then((r) => setResults(r.players)).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div>
      <input
        className="search"
        placeholder="Search players or teams…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {results.length > 0 && (
        <div className="card" style={{ cursor: "default" }}>
          <div className="muted" style={{ marginBottom: 8 }}>Players</div>
          {results.slice(0, 8).map((p) => (
            <div key={p.id} className="market-row">
              <div className="player-meta">
                <div className="avatar">{p.name.slice(0, 2)}</div>
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div className="muted">{p.teamName}</div>
                </div>
              </div>
              <span className="pos-chip">{p.position}</span>
            </div>
          ))}
        </div>
      )}

      <div className="tabs">
        <div className={`tab ${tab === "live" ? "active" : ""}`} onClick={() => setTab("live")}>
          🔴 Live
        </div>
        <div className={`tab ${tab === "upcoming" ? "active" : ""}`} onClick={() => setTab("upcoming")}>
          Upcoming
        </div>
      </div>

      {fixtures === null && (
        <>
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </>
      )}

      {fixtures?.length === 0 && (
        <div className="empty">No {tab} matches right now.</div>
      )}

      {fixtures?.map((f) => (
        <Link key={f.id} href={`/game/${f.id}`} className="card">
          <div className="row">
            {f.status === "LIVE" || f.status === "HT" ? (
              <span className="live-badge">
                <span className="live-dot" /> {f.status === "HT" ? "Half time" : `${f.minute}'`}
              </span>
            ) : (
              <span className="muted">{new Date(f.kickoff * 1000).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
            )}
            <span className="muted">World Cup</span>
          </div>
          <div className="teams">{f.homeTeamName} vs {f.awayTeamName}</div>
          <div className="muted">Tap to trade player performance →</div>
        </Link>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState, useRef } from "react";
import { subscribePrices } from "./api";

export interface LiveTick {
  priceLong: number;
  livePS: number;
  minute: number;
}

/** Subscribe to SSE price ticks; returns a map keyed by `playerId:fixtureId`. */
export function useLivePrices(fixtureId?: number) {
  const [ticks, setTicks] = useState<Record<string, LiveTick>>({});
  const ref = useRef(ticks);
  ref.current = ticks;

  useEffect(() => {
    const unsub = subscribePrices((e) => {
      const key = `${e.playerId}:${e.fixtureId}`;
      setTicks((prev) => ({ ...prev, [key]: { priceLong: e.priceLong, livePS: e.livePS, minute: e.minute } }));
    }, fixtureId);
    return unsub;
  }, [fixtureId]);

  return ticks;
}

export function tickKey(playerId: number, fixtureId: number) {
  return `${playerId}:${fixtureId}`;
}

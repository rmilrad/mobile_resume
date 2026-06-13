"use client";

/**
 * Wallet + positions context.
 *
 * DEFAULT: a self-contained DEMO wallet (passkey-free) backed by localStorage so
 * the whole app is usable without a chain connection — a faucet grants test USDC,
 * "buy" records a position at the live price, and P&L marks to the live SSE price.
 *
 * REAL MODE (Base Sepolia): swap this provider for the OnchainKit/wagmi provider
 * in `src/wallet/onchainkit.tsx.example` and back these actions with contract
 * calls (approve+buy batched via Smart Wallet + Paymaster). The component API
 * below (balance, faucet, buy, positions, redeem) is intentionally identical so
 * screens do not change.
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Position, Side } from "../lib/trade";

const LS_KEY = "pm_demo_wallet_v1";
const FAUCET_AMOUNT = 1000;

interface WalletState {
  connected: boolean;
  address: string | null;
  usdc: number;
  positions: Position[];
}

interface WalletApi extends WalletState {
  connect: () => void;
  disconnect: () => void;
  faucet: () => void;
  buy: (input: { playerId: number; fixtureId: number; side: Side; usdc: number; priceLong: number }) => void;
  redeem: (playerId: number, fixtureId: number, payout: number) => void;
  positionFor: (playerId: number, fixtureId: number, side: Side) => Position | undefined;
}

const WalletCtx = createContext<WalletApi | null>(null);

function load(): WalletState {
  if (typeof window === "undefined") return { connected: false, address: null, usdc: 0, positions: [] };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as WalletState;
  } catch {
    /* ignore */
  }
  return { connected: false, address: null, usdc: 0, positions: [] };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({ connected: false, address: null, usdc: 0, positions: [] });

  useEffect(() => setState(load()), []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(state));
  }, [state]);

  const connect = useCallback(() => {
    setState((s) => ({
      ...s,
      connected: true,
      address: s.address ?? "0xDemo" + Math.random().toString(16).slice(2, 8),
    }));
  }, []);

  const disconnect = useCallback(() => setState((s) => ({ ...s, connected: false })), []);

  const faucet = useCallback(() => setState((s) => ({ ...s, usdc: s.usdc + FAUCET_AMOUNT })), []);

  const buy: WalletApi["buy"] = useCallback((input) => {
    setState((s) => {
      if (s.usdc < input.usdc) return s;
      const price = input.side === "LONG" ? input.priceLong : 1 - input.priceLong;
      const shares = price > 0 ? input.usdc / price : 0;
      const positions = [...s.positions];
      const idx = positions.findIndex(
        (p) => p.playerId === input.playerId && p.fixtureId === input.fixtureId && p.side === input.side,
      );
      if (idx >= 0) {
        const ex = positions[idx]!;
        const newShares = ex.shares + shares;
        const newCost = ex.cost + input.usdc;
        positions[idx] = { ...ex, shares: newShares, cost: newCost, entryPrice: newCost / newShares };
      } else {
        positions.push({
          playerId: input.playerId,
          fixtureId: input.fixtureId,
          side: input.side,
          shares,
          entryPrice: price,
          cost: input.usdc,
        });
      }
      return { ...s, usdc: s.usdc - input.usdc, positions };
    });
  }, []);

  const redeem: WalletApi["redeem"] = useCallback((playerId, fixtureId, payout) => {
    setState((s) => ({
      ...s,
      usdc: s.usdc + payout,
      positions: s.positions.filter((p) => !(p.playerId === playerId && p.fixtureId === fixtureId)),
    }));
  }, []);

  const positionFor: WalletApi["positionFor"] = useCallback(
    (playerId, fixtureId, side) =>
      state.positions.find((p) => p.playerId === playerId && p.fixtureId === fixtureId && p.side === side),
    [state.positions],
  );

  return (
    <WalletCtx.Provider value={{ ...state, connect, disconnect, faucet, buy, redeem, positionFor }}>
      {children}
    </WalletCtx.Provider>
  );
}

export function useWallet(): WalletApi {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

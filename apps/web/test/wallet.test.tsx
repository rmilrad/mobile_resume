import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { WalletProvider, useWallet } from "../src/wallet/WalletContext";
import type { ReactNode } from "react";

function wrapper({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}

describe("WalletContext (demo)", () => {
  beforeEach(() => localStorage.clear());

  it("connect + faucet grants USDC", () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    act(() => result.current.connect());
    expect(result.current.connected).toBe(true);
    act(() => result.current.faucet());
    expect(result.current.usdc).toBe(1000);
  });

  it("buy records a position and debits USDC", () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    act(() => { result.current.connect(); result.current.faucet(); });
    act(() => result.current.buy({ playerId: 1, fixtureId: 2, side: "LONG", usdc: 100, priceLong: 0.5 }));
    expect(result.current.usdc).toBe(900);
    const pos = result.current.positionFor(1, 2, "LONG")!;
    expect(pos.shares).toBeCloseTo(200); // 100 / 0.5
    expect(pos.cost).toBe(100);
  });

  it("buying the same side again averages entry", () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    act(() => { result.current.connect(); result.current.faucet(); });
    act(() => result.current.buy({ playerId: 1, fixtureId: 2, side: "LONG", usdc: 100, priceLong: 0.5 }));
    act(() => result.current.buy({ playerId: 1, fixtureId: 2, side: "LONG", usdc: 100, priceLong: 0.25 }));
    const pos = result.current.positionFor(1, 2, "LONG")!;
    // 200 shares @0.5 + 400 shares @0.25 = 600 shares, cost 200, entry 0.333
    expect(pos.shares).toBeCloseTo(600);
    expect(pos.cost).toBe(200);
    expect(pos.entryPrice).toBeCloseTo(200 / 600);
  });

  it("cannot buy more than balance", () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    act(() => result.current.connect());
    act(() => result.current.buy({ playerId: 1, fixtureId: 2, side: "LONG", usdc: 100, priceLong: 0.5 }));
    expect(result.current.positions.length).toBe(0); // no funds
  });

  it("redeem clears positions and credits payout", () => {
    const { result } = renderHook(() => useWallet(), { wrapper });
    act(() => { result.current.connect(); result.current.faucet(); });
    act(() => result.current.buy({ playerId: 1, fixtureId: 2, side: "LONG", usdc: 100, priceLong: 0.5 }));
    act(() => result.current.redeem(1, 2, 150));
    expect(result.current.usdc).toBe(900 + 150);
    expect(result.current.positions.length).toBe(0);
  });
});

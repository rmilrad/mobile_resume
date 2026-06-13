"use client";

/**
 * Real on-chain wallet backed by Coinbase Smart Wallet + wagmi on Base Sepolia.
 *
 * Exposes the identical WalletApi as the demo WalletContext so every screen
 * continues to work without change. Activated by setting
 * NEXT_PUBLIC_FACTORY_ADDRESS in .env.local (see .env.local.example).
 *
 * Buy flow: EIP-5792 sendCalls (approve + buy in one wallet prompt, Paymaster
 * sponsored). Falls back to sequential writeContract if the wallet doesn't
 * support wallet_sendCalls.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useSendCalls,
} from "wagmi";
import { coinbaseWallet } from "wagmi/connectors";
import { readContract } from "wagmi/actions";
import { MarketFactoryAbi, MarketAbi, MockUSDCAbi, OutcomeTokenAbi } from "@pitchmarket/shared/abis";
import { wagmiConfig } from "./wagmi";
import { WalletCtx, type WalletApi } from "./WalletContext";
import type { Side } from "../lib/trade";

type Address = `0x${string}`;

const USDC_ADDR = (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "") as Address;
const FACTORY_ADDR = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? "") as Address;
const PAYMASTER_URL = process.env.NEXT_PUBLIC_PAYMASTER_URL as string | undefined;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// ── Local position metadata (cost/entryPrice are off-chain; shares come from chain) ──

interface PositionMeta {
  playerId: number;
  fixtureId: number;
  side: Side;
  marketAddress: Address;
  tokenAddress: Address;
  cost: number;
  entryPrice: number;
}

const LS_KEY = "pm_onchain_meta_v1";

function loadMetas(): PositionMeta[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as PositionMeta[]) : [];
  } catch { return []; }
}
function saveMetas(m: PositionMeta[]) {
  if (typeof window !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(m));
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function OnchainWalletProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync } = useWriteContract();
  const { sendCallsAsync } = useSendCalls();

  const [metas, setMetas] = useState<PositionMeta[]>([]);
  useEffect(() => setMetas(loadMetas()), []);
  useEffect(() => saveMetas(metas), [metas]);

  // Live USDC balance
  const { data: usdcData, refetch: refetchUsdc } = useReadContract(
    address && USDC_ADDR
      ? { address: USDC_ADDR, abi: MockUSDCAbi, functionName: "balanceOf", args: [address] }
      : undefined,
  );
  const usdc = usdcData ? Number(usdcData as bigint) / 1e6 : 0;

  // Live LONG/SHORT token balances for all tracked positions
  const tokenCalls = useMemo(
    () =>
      address
        ? metas.map((m) => ({
            address: m.tokenAddress,
            abi: OutcomeTokenAbi,
            functionName: "balanceOf" as const,
            args: [address] as const,
          }))
        : [],
    [metas, address],
  );
  const { data: tokenData, refetch: refetchTokens } = useReadContracts({ contracts: tokenCalls });

  const refetch = useCallback(() => {
    void refetchUsdc();
    void refetchTokens();
  }, [refetchUsdc, refetchTokens]);

  // Merge metas with live balances → positions
  const positions = useMemo(
    () =>
      metas
        .map((m, i) => {
          const raw = tokenData?.[i]?.result as bigint | undefined;
          const shares = raw ? Number(raw) / 1e18 : 0;
          return { playerId: m.playerId, fixtureId: m.fixtureId, side: m.side, shares, entryPrice: m.entryPrice, cost: m.cost };
        })
        .filter((p) => p.shares > 1e-9),
    [metas, tokenData],
  );

  // ── Actions ───────────────────────────────────────────────────────────────

  const connect = useCallback(() => {
    void connectAsync({
      connector: coinbaseWallet({ appName: "PitchMarket", preference: "smartWalletOnly" }),
    });
  }, [connectAsync]);

  const faucet = useCallback(() => {
    if (!address || !USDC_ADDR) return;
    void (async () => {
      await writeContractAsync({
        address: USDC_ADDR,
        abi: MockUSDCAbi,
        functionName: "mint",
        args: [address, 1_000_000_000n], // 1000 USDC (6dp)
      });
      refetch();
    })();
  }, [address, writeContractAsync, refetch]);

  const buy: WalletApi["buy"] = useCallback(
    (input) => {
      if (!address || !USDC_ADDR || !FACTORY_ADDR) return;
      void (async () => {
        // Resolve market + token addresses from on-chain registry
        const marketAddr = (await readContract(wagmiConfig, {
          address: FACTORY_ADDR,
          abi: MarketFactoryAbi,
          functionName: "getMarket",
          args: [BigInt(input.playerId), BigInt(input.fixtureId)],
        })) as Address;

        if (!marketAddr || marketAddr === ZERO_ADDR) {
          console.error("PitchMarket: market not found on-chain for", input.playerId, input.fixtureId);
          return;
        }

        const tokenAddr = (await readContract(wagmiConfig, {
          address: marketAddr,
          abi: MarketAbi,
          functionName: input.side === "LONG" ? "long" : "short",
        })) as Address;

        const usdcAmount = BigInt(Math.round(input.usdc * 1e6));
        const isLong = input.side === "LONG";

        // Batched approve+buy — one wallet prompt, gas sponsored by Paymaster
        try {
          await sendCallsAsync({
            calls: [
              { to: USDC_ADDR, abi: MockUSDCAbi, functionName: "approve", args: [marketAddr, usdcAmount] },
              { to: marketAddr, abi: MarketAbi, functionName: "buy", args: [isLong, usdcAmount, 0n] },
            ],
            capabilities: PAYMASTER_URL
              ? { paymasterService: { url: PAYMASTER_URL } }
              : undefined,
          });
        } catch {
          // Wallet doesn't support EIP-5792 — fall back to sequential writes
          await writeContractAsync({ address: USDC_ADDR, abi: MockUSDCAbi, functionName: "approve", args: [marketAddr, usdcAmount] });
          await writeContractAsync({ address: marketAddr, abi: MarketAbi, functionName: "buy", args: [isLong, usdcAmount, 0n] });
        }

        // Update local cost/entryPrice metadata
        const price = isLong ? input.priceLong : 1 - input.priceLong;
        setMetas((prev) => {
          const idx = prev.findIndex(
            (m) => m.playerId === input.playerId && m.fixtureId === input.fixtureId && m.side === input.side,
          );
          if (idx >= 0) {
            const ex = prev[idx]!;
            const newCost = ex.cost + input.usdc;
            const oldShares = ex.cost / ex.entryPrice;
            const newSharesEst = price > 0 ? input.usdc / price : 0;
            const totalShares = oldShares + newSharesEst;
            const updated = [...prev];
            updated[idx] = { ...ex, cost: newCost, entryPrice: totalShares > 0 ? newCost / totalShares : price };
            return updated;
          }
          return [
            ...prev,
            { playerId: input.playerId, fixtureId: input.fixtureId, side: input.side, marketAddress: marketAddr, tokenAddress: tokenAddr, cost: input.usdc, entryPrice: price },
          ];
        });

        // Refresh balances after a moment for tx confirmation
        setTimeout(refetch, 4000);
      })();
    },
    [address, sendCallsAsync, writeContractAsync, refetch],
  );

  const redeem: WalletApi["redeem"] = useCallback(
    (playerId, fixtureId, _payout) => {
      if (!address || !FACTORY_ADDR) return;
      void (async () => {
        const marketAddr = (await readContract(wagmiConfig, {
          address: FACTORY_ADDR,
          abi: MarketFactoryAbi,
          functionName: "getMarket",
          args: [BigInt(playerId), BigInt(fixtureId)],
        })) as Address;

        if (!marketAddr || marketAddr === ZERO_ADDR) return;

        const longPos = positions.find((p) => p.playerId === playerId && p.fixtureId === fixtureId && p.side === "LONG");
        const shortPos = positions.find((p) => p.playerId === playerId && p.fixtureId === fixtureId && p.side === "SHORT");
        const longIn = longPos ? BigInt(Math.floor(longPos.shares * 1e18)) : 0n;
        const shortIn = shortPos ? BigInt(Math.floor(shortPos.shares * 1e18)) : 0n;

        if (longIn === 0n && shortIn === 0n) return;

        await writeContractAsync({
          address: marketAddr,
          abi: MarketAbi,
          functionName: "redeem",
          args: [longIn, shortIn],
        });

        setMetas((prev) => prev.filter((m) => !(m.playerId === playerId && m.fixtureId === fixtureId)));
        setTimeout(refetch, 4000);
      })();
    },
    [address, positions, writeContractAsync, refetch],
  );

  const positionFor: WalletApi["positionFor"] = useCallback(
    (playerId, fixtureId, side) =>
      positions.find((p) => p.playerId === playerId && p.fixtureId === fixtureId && p.side === side),
    [positions],
  );

  const api: WalletApi = {
    connected: isConnected,
    address: address ?? null,
    usdc,
    positions,
    connect,
    disconnect: () => disconnect(),
    faucet,
    buy,
    redeem,
    positionFor,
  };

  return <WalletCtx.Provider value={api}>{children}</WalletCtx.Provider>;
}

export function useWallet(): WalletApi {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}

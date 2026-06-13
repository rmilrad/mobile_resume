"use client";

/**
 * Top-level app provider composition.
 *
 * Demo mode (default, no env vars needed): just the localStorage demo wallet.
 * Onchain mode (set NEXT_PUBLIC_FACTORY_ADDRESS): wagmi + react-query +
 *   Coinbase Smart Wallet + the real OnchainWalletProvider.
 */

import { type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider } from "./WalletContext";
import { OnchainWalletProvider } from "./OnchainWalletContext";
import { wagmiConfig } from "./wagmi";

const queryClient = new QueryClient();

const FACTORY_ADDR = process.env.NEXT_PUBLIC_FACTORY_ADDRESS;

export function AppProviders({ children }: { children: ReactNode }) {
  if (!FACTORY_ADDR) {
    return <WalletProvider>{children}</WalletProvider>;
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainWalletProvider>{children}</OnchainWalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

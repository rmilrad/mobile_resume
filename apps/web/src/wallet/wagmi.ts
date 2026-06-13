import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { coinbaseWallet } from "wagmi/connectors";

export const chain = baseSepolia;

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [
    coinbaseWallet({ appName: "PitchMarket", preference: "smartWalletOnly" }),
  ],
  transports: {
    [chain.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined),
  },
  ssr: true,
});

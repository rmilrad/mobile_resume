import "./globals.css";
import type { Metadata, Viewport } from "next";
import { WalletProvider } from "../wallet/WalletContext";
import { Header } from "../components/Header";
import { BottomNav } from "../components/BottomNav";

export const metadata: Metadata = {
  title: "PitchMarket — trade player performance",
  description: "Go long or short on live soccer player performance. Testnet demo.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b0e11",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <div className="app">
            <div className="testnet-ribbon">⚽ TESTNET — PLAY MONEY · NOT FINANCIAL ADVICE</div>
            <Header />
            <div className="content">{children}</div>
            <BottomNav />
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}

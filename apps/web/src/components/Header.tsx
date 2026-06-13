"use client";

import Link from "next/link";
import { useWallet } from "../wallet/WalletContext";
import { formatUsd } from "../lib/format";

export function Header() {
  const { connected, usdc, connect } = useWallet();
  return (
    <div className="header">
      <Link href="/" className="logo" style={{ textDecoration: "none", color: "inherit" }}>
        <h1>
          Pitch<span>Market</span>
        </h1>
      </Link>
      {connected ? (
        <Link href="/wallet" className="balance-pill">
          {formatUsd(usdc, 0)} USDC
        </Link>
      ) : (
        <button className="balance-pill" onClick={connect}>
          Connect
        </button>
      )}
    </div>
  );
}

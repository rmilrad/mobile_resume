"use client";

import { useWallet } from "../../wallet/WalletContext";
import { formatUsd } from "../../lib/format";

export default function WalletPage() {
  const wallet = useWallet();

  return (
    <div>
      <div className="card" style={{ cursor: "default" }}>
        <div className="muted">Network</div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Base Sepolia · Testnet</div>
      </div>

      {wallet.connected ? (
        <>
          <div className="card" style={{ cursor: "default" }}>
            <div className="muted">Smart Wallet (passkey)</div>
            <div style={{ fontWeight: 700, fontFamily: "monospace" }}>{wallet.address}</div>
            <div style={{ marginTop: 16 }} className="muted">Balance</div>
            <div style={{ fontSize: 30, fontWeight: 800 }}>{formatUsd(wallet.usdc)} USDC</div>
          </div>

          <button className="btn btn-green" onClick={wallet.faucet}>💧 Get 1,000 test USDC</button>
          <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={wallet.disconnect}>Disconnect</button>

          <div className="card" style={{ cursor: "default", marginTop: 16 }}>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
              Gas is sponsored by the Base Paymaster — you never need ETH. Trades batch
              approve + buy into a single passkey signature via your Coinbase Smart Wallet.
              This is a testnet demo using play-money USDC.
            </div>
          </div>
        </>
      ) : (
        <div className="empty">
          Sign in with a passkey — no seed phrase, no extension.
          <br /><br />
          <button className="btn btn-primary" onClick={wallet.connect}>Create / Connect Smart Wallet</button>
        </div>
      )}
    </div>
  );
}

# PitchMarket Contracts (Foundry)

Scalar LONG/SHORT performance prediction market on Base. Complete-set minting
keeps the vault fully collateralized; a Gnosis-style FPMM provides continuous
pricing. Mirrors `packages/shared/src/market/fpmm.ts` exactly.

## Contracts
- `MockUSDC` — 6dp test USDC with a capped public faucet (deployer uncapped).
- `OutcomeToken` — 18dp LONG/SHORT token, mint/burn gated to its Market.
- `Market` — vault + FPMM + settlement/redemption for one (player, fixture).
- `MarketFactory` — deploys & seeds markets; registry.
- `Resolver` — oracle: propose -> dispute window -> finalize; void.

## Test
```
forge test            # unit + fuzz + invariant
forge test -vvv       # verbose
```

## Deploy (Base Sepolia)
```
export DEPLOYER_PRIVATE_KEY=0x...
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
```

## Re-export ABIs to shared
After changing contracts, rebuild and re-run the ABI export (see repo root
README) so `packages/shared/src/abis` stays in sync.

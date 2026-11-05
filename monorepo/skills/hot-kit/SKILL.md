---
name: hot-kit
description: >
  Use HOT Kit (@hot-labs/kit) when Torch needs more than NEAR: connecting EVM, Solana, TON,
  Stellar, TRON or Cosmos wallets, Google login via HOT MPC, omni balances, cross-chain swaps
  and bridging through NEAR Intents, or HOT's JWT auth. Covers setup in Next.js, the
  OmniWallet interface, tokens/balances, the exchange flow and server-side usage. Do not use
  for NEAR-only wallet connect (use hot-wallet-connect).
---

# HOT Kit (multi-chain)

HOT Kit wraps NEAR Connect plus connectors for other chains, a token/price registry, omni
balances (HOT Bridge + NEAR Intents) and a swap/bridge UI. It is heavier than NEAR Connect
(React UI, MobX, Node polyfills) and needs a HOT API key. Only add it when a feature needs
another chain, e.g. "deposit USDC from Base or Solana straight into a Torch basket".

Docs: https://docs.hotdao.ai/hot-kit · Repo: https://github.com/hot-dao/kit

## Install

```bash
pnpm --filter web add @hot-labs/kit mobx mobx-react-lite
```

- API key (free): https://pay.hot-labs.org/admin/api-keys → `NEXT_PUBLIC_HOT_API_KEY`
- WalletConnect project id (optional): https://dashboard.reown.com
- The docs show Vite with `vite-plugin-node-polyfills`. In Next.js, client-only dynamic import is
  usually enough. If the build complains about `Buffer`/`process`, add polyfills in
  `next.config.ts` for the client bundle only, and verify with `pnpm --filter web build`.

## Setup (client only)

```tsx
"use client";
import { useEffect, useState } from "react";
import type { HotConnector } from "@hot-labs/kit";

export function useHotKit() {
  const [kit, setKit] = useState<HotConnector | null>(null);
  useEffect(() => {
    (async () => {
      const [{ HotConnector }, { defaultConnectors }] = await Promise.all([
        import("@hot-labs/kit"),
        import("@hot-labs/kit/defaults"),
      ]);
      setKit(new HotConnector({
        apiKey: process.env.NEXT_PUBLIC_HOT_API_KEY!,
        connectors: defaultConnectors, // NEAR, EVM, Solana, TON, Stellar, TRON
        walletConnect: {
          projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
          metadata: { name: "Torch", description: "NFT ETFs on NEAR", url: location.origin, icons: [`${location.origin}/favicon.ico`] },
        },
      }));
    })();
  }, []);
  return kit;
}
```

Create one instance per app (put it in a provider, like `NearProvider`). Extra connectors:
`@hot-labs/kit/cosmos`, and `@hot-labs/kit/hot-wallet` for Google login (experimental).

## Wallets

```ts
kit.onConnect(({ wallet }) => {});      // wallet.type: WalletType.NEAR / EVM / Solana / TON / Stellar / Cosmos
kit.onDisconnect(({ wallet }) => {});

const wallet = await kit.connect();                // picker, or kit.connect(WalletType.EVM)
await kit.disconnect(wallet);

kit.priorityWallet;  // main connected wallet
kit.near; kit.evm;   // per-chain wallet or null
```

All chains share one `OmniWallet` interface:

```ts
wallet.address        // chain-native address
wallet.omniAddress    // deterministic omni (intents) address
await wallet.transfer({ token, receiver, amount });      // bigint amount, returns tx hash
await wallet.transferFee(token, receiver, amount);
await wallet.sendTransaction(chainSpecificTx);
await wallet.fetchBalances(chainId);
await wallet.signIntents(intents);                       // NEAR Intents commitment
await wallet.auth();                                     // JWT, verify with api.validateAuth(jwt)
```

State is MobX-observable: wrap components reading `kit.*` with `observer` from `mobx-react-lite`.

## Tokens and balances

```ts
import { tokens, chains, Network } from "@hot-labs/kit";

const usdcBase = tokens.get("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", Network.Base);
usdcBase.int(10);         // 10 USDC to bigint with decimals
usdcBase.float(1_000_000n);
usdcBase.usd;             // live USD rate (refreshed ~5 min)
// token.id === `${token.chain}:${token.address}`, native tokens use address "native"

kit.walletsTokens.forEach(({ wallet, token, balance }) => {});
await kit.fetchTokens(kit.evm);
kit.openProfile();        // built-in portfolio popup
```

## Swap / bridge

```ts
kit.openBridge(); // built-in UI

const review = await kit.exchange.reviewSwap({ /* from token, to token, amount, sender, receiver */ });
await kit.exchange.makeSwap(review);
```

The exchange and intents builder docs are marked WIP. Check the installed package's types before
relying on exact params, and test with small amounts on mainnet (cross-chain liquidity is
mainnet-only).

## Server side (apps/api)

`HotConnector` is browser-only. On the server use the core modules with a key you control:

```ts
import { tokens, Network } from "@hot-labs/kit/core";
import { NearWallet } from "@hot-labs/kit/near";

tokens.startTokenPolling();
const wallet = await NearWallet.fromPrivateKey(Buffer.from(process.env.KEEPER_PRIVATE_KEY!, "hex"), process.env.KEEPER_ACCOUNT_ID!);
const balances = await wallet.fetchBalances(Network.Near);
```

Only for accounts the backend owns (e.g. a keeper). Never accept user private keys.

## Common mistakes

- Using HOT Kit just to connect NEAR wallets: use `@hot-labs/near-connect`, which is lighter and already included in Kit.
- Constructing `HotConnector` during SSR or at module scope.
- Forgetting `observer`: balances never re-render.
- Shipping the API key in server-only env: it is a public client key (`NEXT_PUBLIC_*`), scoped by HOT.
- Floats for amounts: use `token.int()` → `bigint`.

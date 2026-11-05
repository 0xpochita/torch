---
name: hot-wallet-connect
description: >
  Set up HOT Wallet and every other NEAR wallet in the Torch Next.js app (apps/web) using
  @hot-labs/near-connect. Covers install, a client-only React provider for the App Router,
  sign in / sign out, restoring a session, network selection, WalletConnect for mobile wallets,
  and CSP. Use when adding a "Connect wallet" button, touching wallet state, or debugging
  wallets that do not show up.
---

# HOT Wallet connect (NEAR Connect)

HOT Labs maintains `@hot-labs/near-connect`, the connector NEAR docs recommend. HOT Wallet,
Meteor, Intear, MyNearWallet, Nightly, OKX, NEAR Mobile and WalletConnect wallets are all listed
in one remote manifest. Wallet code runs in sandboxed iframes and updates without an app
redeploy. **Do not use `@near-wallet-selector/*`**: it is a different API.

## Install

```bash
pnpm --filter web add @hot-labs/near-connect near-api-js
```

Env (`apps/web/.env.local`, all public):

```
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_NEAR_CONTRACT_ID=torch.testnet
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=   # optional, from dashboard.reown.com
```

## Provider (App Router)

`NearConnector` touches `window`, `localStorage` and IndexedDB, so it must never run during SSR.
Keep it in one `"use client"` provider. Construct it inside `useEffect`, not at module scope.

`apps/web/src/providers/near-provider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";

export const NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet") as "mainnet" | "testnet";

type NearCtx = {
  ready: boolean;
  accountId: string | null;
  wallet: NearWalletBase | null;
  connector: NearConnector | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<NearCtx | null>(null);

export function NearProvider({ children }: { children: ReactNode }) {
  const connectorRef = useRef<NearConnector | null>(null);
  const [wallet, setWallet] = useState<NearWalletBase | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let connector: NearConnector | undefined;

    const onSignIn = ({ wallet, accounts }: { wallet: NearWalletBase; accounts: { accountId: string }[] }) => {
      setWallet(wallet);
      setAccountId(accounts[0]?.accountId ?? null);
    };
    const onSignOut = () => {
      setWallet(null);
      setAccountId(null);
    };

    (async () => {
      const { NearConnector } = await import("@hot-labs/near-connect");
      if (cancelled) return;
      connector = new NearConnector({
        network: NETWORK,
        features: { signMessage: true, signAndSendTransaction: true },
        footerBranding: { heading: "Torch", link: "https://hot-labs.org/wallet", linkText: "Get HOT Wallet", icon: "/favicon.ico" },
      });
      connectorRef.current = connector;
      connector.on("wallet:signIn", onSignIn);
      connector.on("wallet:signOut", onSignOut);

      await connector.whenManifestLoaded;
      const existing = await connector.getConnectedWallet().catch(() => null);
      if (!cancelled && existing) onSignIn(existing);
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      connector?.off("wallet:signIn", onSignIn);
      connector?.off("wallet:signOut", onSignOut);
    };
  }, []);

  const signIn = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) return;
    await connector.whenManifestLoaded;
    await connector.connect(); // opens the wallet picker; fires wallet:signIn
  }, []);

  const signOut = useCallback(async () => {
    if (wallet) await connectorRef.current?.disconnect(wallet); // fires wallet:signOut
  }, [wallet]);

  return (
    <Ctx.Provider value={{ ready, accountId, wallet, connector: connectorRef.current, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNear() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNear must be used inside <NearProvider>");
  return ctx;
}
```

Wrap the app in `src/app/layout.tsx` (the layout stays a Server Component):

```tsx
import { NearProvider } from "@/providers/near-provider";
// ...
<body>
  <NearProvider>{children}</NearProvider>
</body>
```

Button:

```tsx
"use client";
import { useNear } from "@/providers/near-provider";

export function ConnectButton() {
  const { ready, accountId, signIn, signOut } = useNear();
  if (!ready) return <button disabled>Loading…</button>;
  return accountId
    ? <button onClick={signOut}>{accountId} · Disconnect</button>
    : <button onClick={signIn}>Connect wallet</button>;
}
```

## Options worth knowing

| Option | Purpose |
| --- | --- |
| `network: "mainnet" \| "testnet"` | Set it explicitly. Testnet hides wallets without `testnet` support (HOT Wallet is mainnet-only in the manifest; test HOT on mainnet). |
| `features: {...}` | Only show wallets that support what the app needs (`signMessage`, `signAndSendTransaction`, `signAndSendTransactions`, `signDelegateActions`, `testnet`, `mainnet`). |
| `connect({ walletId: "hot-wallet" })` | Skip the picker and open HOT Wallet directly (e.g. a dedicated "Continue with HOT" button). |
| `connect({ signMessageParams })` | Sign in and sign a NEP-413 message in one popup. See `near-wallet-auth`. |
| `providers: { mainnet: [...], testnet: [...] }` | RPC URLs, e.g. `https://free.rpc.fastnear.com`, `https://test.rpc.fastnear.com`. |
| `excludedWallets: ["..."]` | Hide specific wallet ids. |
| `switchNetwork("mainnet")` | Disconnects and reconnects on the other network. |
| `cspNonce` | Required if the site uses a nonce-based `script-src` CSP; otherwise the wallet iframes load but do nothing. |

## WalletConnect (mobile wallets)

Wallets that need WalletConnect are **silently dropped** from the picker when no client is passed.
Add it only if mobile wallets matter:

```bash
pnpm --filter web add @walletconnect/sign-client
```

```ts
const { default: SignClient } = await import("@walletconnect/sign-client");
const walletConnect = SignClient.init({
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  metadata: { name: "Torch", description: "NFT ETFs on NEAR", url: location.origin, icons: [`${location.origin}/favicon.ico`] },
});
new NearConnector({ network: NETWORK, walletConnect });
```

## Common mistakes

- Calling `connect()` before `await connector.whenManifestLoaded`: no wallets, throws.
- Creating the connector at module top level or in a Server Component: SSR crash (`window is not defined`).
- Creating a new connector per render: duplicate listeners and lost session. Use one per app.
- Not handling `wallet:signOut`: the user revokes access in the wallet, and the UI keeps showing a stale account.
- Using the deprecated `signIn: { contractId, methodNames }` constructor option. Use
  `connect({ addFunctionCallKey })` later, after the user is engaged (see `near-transactions`).
- Trusting `accountId` from the client for anything server-side. Prove it with NEP-413 (`near-wallet-auth`).

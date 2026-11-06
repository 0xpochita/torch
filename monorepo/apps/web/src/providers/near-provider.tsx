"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";

// Wallet connect via @hot-labs/near-connect (skills/hot-wallet-connect). Client-only: the connector
// touches window, localStorage and IndexedDB, so it is built inside an effect, never during SSR.

export const NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet") as "mainnet" | "testnet";
export const RPC = process.env.NEXT_PUBLIC_NEAR_RPC || (NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");

type NearCtx = {
  ready: boolean;
  accountId: string | null;
  /** Liquid NEAR balance of `accountId`, null until loaded. */
  balance: number | null;
  wallet: NearWalletBase | null;
  connector: NearConnector | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<NearCtx | null>(null);

export function NearProvider({ children }: { children: ReactNode }) {
  // State rather than a ref so render never reads a ref (React Compiler rule).
  const [connector, setConnector] = useState<NearConnector | null>(null);
  const [wallet, setWallet] = useState<NearWalletBase | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [balance, setBalance] = useState<{ accountId: string; near: number } | null>(null);

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
        providers: { [NETWORK]: [RPC] },
        features: { signMessage: true, signAndSendTransaction: true },
        // HOT Wallet has no `testnet` flag in the manifest, so the picker hides it on testnet and lists it first on mainnet.
        footerBranding: { heading: "Torch", link: "https://hot-labs.org/wallet", linkText: NETWORK === "testnet" ? "HOT Wallet: mainnet only" : "Get HOT Wallet", icon: "/icon.png" },
      });
      setConnector(connector);
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

  // Liquid balance for the topbar chip. Keyed by account so a stale value never shows for a new one.
  useEffect(() => {
    if (!accountId) return;
    let live = true;
    fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "torch", method: "query", params: { request_type: "view_account", finality: "final", account_id: accountId } }),
    })
      .then((r) => r.json())
      .then((j: { result?: { amount: string } }) => {
        // yocto (1e24) → NEAR with 4 decimals, without losing precision in a float
        if (live && j.result) setBalance({ accountId, near: Number(BigInt(j.result.amount) / BigInt(1e20)) / 1e4 });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [accountId]);

  const signIn = useCallback(async () => {
    if (!connector) return;
    await connector.whenManifestLoaded;
    await connector.connect().catch(() => {}); // opens the wallet picker; fires wallet:signIn. Rejects when the user closes it.
  }, [connector]);

  const signOut = useCallback(async () => {
    if (wallet) await connector?.disconnect(wallet); // fires wallet:signOut
  }, [connector, wallet]);

  return (
    <Ctx.Provider value={{ ready, accountId, balance: balance?.accountId === accountId ? balance.near : null, wallet, connector, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNear() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNear must be used inside <NearProvider>");
  return ctx;
}

/** The connected NEAR account id, or null when signed out. */
export const useAccount = () => useNear().accountId;

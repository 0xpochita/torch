// Transaction builders + send/read helpers for the Torch contracts (skills/near-transactions).
// Builders are pure: they return `{ receiverId, actions }` in near-connect's ConnectorAction shape,
// so they can be unit-tested and batched into one `signAndSendTransactions` approval.
import type { NearWalletBase } from "@hot-labs/near-connect";
import { JsonRpcProvider, nearToYocto } from "near-api-js";
import { useEffect, useState } from "react";
import { COLLECTION, GACHA, MARKET, NETWORK, RPC, WNEAR, vaultOf } from "./contracts";

export type Action = { type: "FunctionCall"; params: { methodName: string; args: object; gas: string; deposit: string } };
export type Tx = { receiverId: string; actions: Action[] };

const TGAS = BigInt(10) ** BigInt(12);
const gas = (tgas: number) => (BigInt(tgas) * TGAS).toString();
const ONE_YOCTO = "1";
/** NEP-145 minimum for the mock FTs and wNEAR (125 bytes); excess is refunded with registration_only. */
export const FT_STORAGE = nearToYocto("0.00125").toString();
/** Collection `MINT_DEPOSIT`: creates the vault account and pays the token's storage. */
export const MINT_DEPOSIT = nearToYocto("0.11").toString();
/** nft_approve storage for one approval (~37 bytes); the rest is refunded. */
const APPROVE_DEPOSIT = nearToYocto("0.001").toString();

const call = (methodName: string, args: object, tgas: number, deposit = "0"): Action => ({
  type: "FunctionCall",
  params: { methodName, args, gas: gas(tgas), deposit },
});

/* ---------- market ---------- */

/** Wave 1 delta: buy ~200 Tgas. Attached deposit must equal the listing price exactly. */
export const buyTx = (tokenId: string, priceYocto: string): Tx => ({ receiverId: MARKET, actions: [call("buy", { token_id: tokenId }, 200, priceYocto)] });

/** Escrows `amountYocto` (≥ 0.01 NEAR) until `expiresAt` (ms). */
export const offerTx = (tokenId: string, amountYocto: string, expiresAt: number): Tx => ({
  receiverId: MARKET,
  actions: [call("offer", { token_id: tokenId, expires_at: expiresAt }, 30, amountYocto)],
});

export const cancelOfferTx = (tokenId: string): Tx => ({ receiverId: MARKET, actions: [call("cancel_offer", { token_id: tokenId }, 30)] });

/** List = approve the market with a price msg; the market's nft_on_approve records the listing. */
export const listTx = (tokenId: string, priceYocto: string): Tx => ({
  receiverId: COLLECTION,
  actions: [call("nft_approve", { token_id: tokenId, account_id: MARKET, msg: JSON.stringify({ list: { price: priceYocto } }) }, 100, APPROVE_DEPOSIT)],
});

/** Accept an offer in one tx (wave 1 delta: ~250 Tgas). */
export const acceptTx = (tokenId: string, buyerId: string): Tx => ({
  receiverId: COLLECTION,
  actions: [call("nft_approve", { token_id: tokenId, account_id: MARKET, msg: JSON.stringify({ accept_offer: { buyer_id: buyerId } }) }, 250, APPROVE_DEPOSIT)],
});

/** Delist on the market, then revoke the approval so the vault can withdraw again. */
export const delistTxs = (tokenId: string): Tx[] => [
  { receiverId: MARKET, actions: [call("delist", { token_id: tokenId }, 30)] },
  { receiverId: COLLECTION, actions: [call("nft_revoke", { token_id: tokenId, account_id: MARKET }, 30, ONE_YOCTO)] },
];

/* ---------- collection / vault ---------- */

export type TokenMetadata = { title: string; description?: string; extra: string };

/** Permissionless mint; the vault id is only known once it resolves (read `vault_created`). */
export const mintTx = (metadata: TokenMetadata): Tx => ({ receiverId: COLLECTION, actions: [call("mint", { metadata, receiver_id: null }, 100, MINT_DEPOSIT)] });

/** Register the vault on the token, then ft_transfer_call into it. One tx, two actions. */
export const depositTx = (tokenId: string, ftId: string, amount: string): Tx => ({
  receiverId: ftId,
  actions: [
    call("storage_deposit", { account_id: vaultOf(tokenId), registration_only: true }, 30, FT_STORAGE),
    call("ft_transfer_call", { receiver_id: vaultOf(tokenId), amount, msg: "" }, 100, ONE_YOCTO),
  ],
});

/** Collection → vault → ft_transfer back to the owner, then on_vault_op. */
export const withdrawTx = (tokenId: string, ftId: string, amount: string): Tx => ({
  receiverId: COLLECTION,
  actions: [call("withdraw", { token_id: tokenId, ft_id: ftId, amount }, 100, ONE_YOCTO)],
});

export const transferTx = (tokenId: string, receiverId: string): Tx => ({
  receiverId: COLLECTION,
  actions: [call("nft_transfer", { receiver_id: receiverId, token_id: tokenId }, 30, ONE_YOCTO)],
});

/* ---------- gacha / faucet ---------- */

/** 10-pull costs 9× and needs the full 1 PGas (gacha README); 1-pull fits in 300 Tgas. */
export const pullTx = (count: 1 | 10, pricePerPullYocto: string): Tx => ({
  receiverId: GACHA,
  actions: [call("pull", { count }, count === 10 ? 1000 : 300, (BigInt(pricePerPullYocto) * BigInt(count === 10 ? 9 : 1)).toString())],
});

/** Mock FT faucet: registers the caller if needed (rest refunded) and mints 0.1 token. */
export const faucetTx = (ftId: string): Tx => ({ receiverId: ftId, actions: [call("faucet", {}, 30, FT_STORAGE)] });

/** NEAR → wNEAR: register (no-op + refund if already registered), then wrap. */
export const wrapTx = (amountYocto: string): Tx => ({
  receiverId: WNEAR,
  actions: [call("storage_deposit", { registration_only: true }, 10, FT_STORAGE), call("near_deposit", {}, 10, amountYocto)],
});

/* ---------- amounts ---------- */

/** "1.5" with 6 decimals → "1500000". Truncates extra digits, never rounds up. */
export function toUnits(amount: string | number, decimals: number): string {
  // String(0.9) is "0.9"; toFixed would leak float noise. Tiny numbers print as "1e-7", so fall back.
  const s = typeof amount === "number" ? (/e/i.test(String(amount)) ? amount.toFixed(Math.min(decimals, 100)) : String(amount)) : amount.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") throw new Error(`Invalid amount: ${amount}`);
  const [whole, frac = ""] = s.split(".");
  return (BigInt(whole || "0") * BigInt(10) ** BigInt(decimals) + BigInt(frac.slice(0, decimals).padEnd(decimals, "0") || "0")).toString();
}

/** Base units → exact decimal string ("1500000", 6 → "1.5"), safe to feed back into toUnits. */
export function formatUnits(raw: string | bigint, decimals: number): string {
  const s = BigInt(raw).toString().padStart(decimals + 1, "0");
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return s.slice(0, s.length - decimals) + (frac ? `.${frac}` : "");
}

/** Base units → number for display (float is fine here, never sent back on-chain). */
export const fromUnits = (raw: string | bigint, decimals: number) => Number(BigInt(raw)) / 10 ** decimals;

/* ---------- send + read results ---------- */

type Status = { SuccessValue?: string; Failure?: unknown } | string;
export type Outcome = {
  transaction: { hash: string };
  status: Status;
  receipts_outcome: { outcome: { logs: string[]; status: Status; executor_id?: string } }[];
};

export class TxError extends Error {
  constructor(
    message: string,
    readonly outcomes: Outcome[] = [],
  ) {
    super(message);
  }
}

/** First readable string inside a NEAR failure object, e.g. "Smart contract panicked: faucet: wait". */
function failureText(f: unknown): string {
  if (typeof f === "string") return f;
  if (f && typeof f === "object") {
    for (const v of Object.values(f)) {
      const s = failureText(v);
      if (s) return s;
    }
  }
  return "";
}

const failureOf = (s: Status) => (typeof s === "object" && s.Failure ? failureText(s.Failure) || "Transaction failed" : null);

/** The decoded return value of the transaction (the last receipt), or undefined. */
export function lastResult(o: Outcome): unknown {
  const v = typeof o.status === "object" ? o.status.SuccessValue : undefined;
  if (!v) return undefined;
  try {
    return JSON.parse(atob(v));
  } catch {
    return undefined;
  }
}

/**
 * Throws a TxError with the contract's own message when any receipt failed, or when the call
 * resolved to `false` (our callbacks return false after refunding: on_buy, on_accept_offer, on_vault_op…).
 * `partial` only checks the call itself, for calls where a failed sub-promise is expected and refunded (gacha).
 */
export function check(outcomes: Outcome[], partial = false): Outcome[] {
  for (const o of outcomes) {
    const err = failureOf(o.status) ?? (partial ? null : o.receipts_outcome.map((r) => failureOf(r.outcome.status)).find(Boolean));
    if (err) throw new TxError(err.replace(/^Smart contract panicked: /, ""), outcomes);
    if (!partial && lastResult(o) === false) throw new TxError("The contract rolled this back and refunded you. Nothing changed hands.", outcomes);
  }
  return outcomes;
}

/** One approval for every tx; a single tx uses signAndSendTransaction (wider wallet support). */
export async function send(wallet: NearWalletBase, txs: Tx[], { partial = false } = {}): Promise<Outcome[]> {
  let res: unknown;
  try {
    res = txs.length === 1 ? [await wallet.signAndSendTransaction(txs[0])] : await wallet.signAndSendTransactions({ transactions: txs });
  } catch (e) {
    throw new TxError(walletError(e));
  }
  return check(res as Outcome[], partial);
}

/** Wallets reject with strings, Errors or RPC error objects. */
export function walletError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return failureText(e) || "The wallet rejected the request";
}

export type TorchEvent = { event: string; data: Record<string, unknown>[] };

/**
 * NEP-297 `torch` events (or another `standard`) logged by any receipt of these outcomes.
 * `from` keeps only logs written by that contract, so no other receiver in the tx can fake one.
 */
export function events(outcomes: Outcome[], name: string, { standard = "torch", from }: { standard?: string; from?: string } = {}): Record<string, unknown>[] {
  return outcomes.flatMap((o) =>
    o.receipts_outcome.flatMap((r) =>
      (from && r.outcome.executor_id !== from ? [] : r.outcome.logs).flatMap((log) => {
        if (!log.startsWith("EVENT_JSON:")) return [];
        try {
          const e = JSON.parse(log.slice(11)) as TorchEvent & { standard: string };
          return e.standard === standard && e.event === name ? e.data : [];
        } catch {
          return [];
        }
      }),
    ),
  );
}

export const explorerTx = (hash: string) => `https://${NETWORK === "mainnet" ? "" : "testnet."}nearblocks.io/txns/${hash}`;

/* ---------- views ---------- */

let rpc: JsonRpcProvider | null = null;

/**
 * A view call as React state. `contractId: null` skips it; bump `nonce` to re-read after a tx.
 * `data` stays undefined while loading (a contract returning null gives null).
 */
export function useView<T>(contractId: string | null, method: string, args: Record<string, unknown> = {}, nonce = 0) {
  const key = contractId ? JSON.stringify([contractId, method, args, nonce]) : null;
  const [state, setState] = useState<{ key: string; data?: T; error?: string } | null>(null);
  useEffect(() => {
    if (!key) return;
    const [c, m, a] = JSON.parse(key) as [string, string, Record<string, unknown>];
    let live = true;
    view<T>(c, m, a).then(
      (data) => live && setState({ key, data }),
      (e) => live && setState({ key, error: walletError(e) }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  const s = state?.key === key ? state : null;
  return { data: s?.data, error: s?.error ?? null, loading: !!key && !s };
}

export function view<T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
  rpc ??= new JsonRpcProvider({ url: RPC });
  return rpc.callFunction({ contractId, method, args, blockQuery: { finality: "final" } }) as Promise<T>;
}

/** The same view on many contracts at once, keyed by contract id (failed reads are left out). */
export function useEach<T>(contractIds: string[] | null, method: string, args: Record<string, unknown> = {}, nonce = 0) {
  const key = contractIds ? JSON.stringify([contractIds, method, args, nonce]) : null;
  const [state, setState] = useState<{ key: string; data: Record<string, T> } | null>(null);
  useEffect(() => {
    if (!key) return;
    const [ids, m, a] = JSON.parse(key) as [string[], string, Record<string, unknown>];
    let live = true;
    Promise.all(ids.map((id) => view<T>(id, m, a).then((v) => [id, v] as const, () => null))).then(
      (rows) => live && setState({ key, data: Object.fromEntries(rows.filter((r) => r !== null)) }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  return state?.key === key ? state.data : null;
}

/** `ft_balance_of` (raw base units) for every token; missing when unreadable. */
export const useFtBalances = (accountId: string | null, ftIds: string[], nonce = 0) => useEach<string>(accountId ? ftIds : null, "ft_balance_of", { account_id: accountId }, nonce);

/**
 * Re-reads a tx with every receipt (wait for FINAL). Wallets that return early can miss logs from
 * detached promises (gacha mints), so the reveal falls back to this.
 */
export async function txWithReceipts(hash: string, accountId: string): Promise<Outcome> {
  rpc ??= new JsonRpcProvider({ url: RPC });
  return (await rpc.viewTransactionStatusWithReceipts({ txHash: hash, accountId, waitUntil: "FINAL" })) as unknown as Outcome;
}

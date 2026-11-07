// Typed client for apps/api plus mappers from API shapes to the UI's Etf/Listing shapes,
// so the existing components keep rendering the same props.
import { useEffect, useState } from "react";
import type { ActivityItem, MarketListing, NavPoint, VaultSummary } from "../../../api/src/types";
import { TOKENS, type Allocation, type Category, type Etf, type HistoryEvent, type Listing, type TokenKey } from "@/lib/tokens";

export type * from "../../../api/src/types";

// Production serves the API from this app (src/app/api); dev talks to apps/api on :8787.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:8787")).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// NEXT_PUBLIC_API_URL may point at the site itself (the hosted app serves the API under /api).
const base = () =>
  typeof window !== "undefined" && new URL(API_URL, location.href).origin === location.origin && !API_URL.endsWith("/api") ? `${new URL(API_URL, location.href).origin}/api` : API_URL;

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(base() + path);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error ?? `API ${res.status}`, res.status);
  return body as T;
}

/** `at` = when the response arrived (ms): a render-safe "now" for relative times. */
export type Load<T> = { data: T | undefined; error: ApiError | Error | undefined; loading: boolean; at: number };

/** Fetches `path` (null = skip) and keeps the result keyed by path, so a stale response never shows for a new one. */
export function useApi<T>(path: string | null): Load<T> {
  const [res, setRes] = useState<{ path: string; at: number; data?: T; error?: Error }>();
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path).then(
      (data) => live && setRes({ path, at: Date.now(), data }),
      (error: Error) => live && setRes({ path, at: Date.now(), error }),
    );
    return () => {
      live = false;
    };
  }, [path]);
  const hit = path && res?.path === path ? res : undefined;
  return { data: hit?.data, error: hit?.error, loading: !!path && !hit, at: hit?.at ?? 0 };
}

/* ---------- units ---------- */

const YOCTO_PER_MILLI = BigInt("1000000000000000000000");
/** yoctoNEAR string -> NEAR, rounded to 0.001 for display. */
export const toNear = (yocto: string) => Number(BigInt(yocto) / YOCTO_PER_MILLI) / 1000;

// Mirrors apps/api/src/prices.ts: mock FT `t<sym>.<owner>` mirrors the real token, `wrap` is wNEAR.
const DECIMALS: Partial<Record<TokenKey, number>> = { USDC: 6, USDT: 6, BTC: 8, NEAR: 24 };

/** `tusdc.torchvault.testnet` -> "USDC" (a key of the TOKENS logo table), or undefined if unknown. */
export function tokenKey(ftId: string): TokenKey | undefined {
  const label = ftId.split(".")[0];
  const k = label === "wrap" ? "NEAR" : label.slice(1).toUpperCase();
  return k in TOKENS ? (k as TokenKey) : undefined;
}

/** Raw FT amount -> whole tokens. */
export const toUnits = (ftId: string, amount: string) => Number(BigInt(amount)) / 10 ** (DECIMALS[tokenKey(ftId) ?? "NEAR"] ?? 18);

/* ---------- mappers ---------- */

export type Vault = Etf & { mintedAt: number; listedAt: number | null };

export function toVault(v: VaultSummary, navHistory?: NavPoint[]): Vault {
  const allocation = v.basket.flatMap((b): Allocation[] => {
    const token = tokenKey(b.token);
    return token ? [{ token, weight: b.weight }] : [];
  });
  return {
    id: v.tokenId,
    name: v.title ?? `Vault #${v.tokenId}`,
    bg: v.bg ?? "#e5e5ea",
    category: (v.category ?? "Uncategorized") as Category,
    creator: v.creator,
    owner: v.ownerId,
    likes: 0,
    navUsd: v.navUsd,
    // price-only change from the API's snapshots; 0 until the first snapshot older than now exists
    change24h: v.change24h ?? 0,
    priceNear: v.listing ? toNear(v.listing.price) : 0,
    listed: !!v.listing,
    allocation,
    nav30d: navHistory?.length ? navHistory.map((p) => p.navUsd) : [v.navUsd, v.navUsd],
    history: [],
    mintedAt: v.mintedAt,
    listedAt: v.listing?.listedAt ?? null,
  };
}

export type MarketItem = Listing & { etf: Vault; listedAt: number };

export const toListing = (m: MarketListing, now: number): MarketItem => {
  const etf = toVault(m.vault);
  return {
    id: m.tokenId,
    etf,
    name: etf.name,
    seller: m.sellerId,
    priceNear: toNear(m.price),
    navUsd: m.vault.navUsd,
    likes: 0,
    status: "buy",
    listedDaysAgo: Math.floor((now - m.listedAt) / 86_400_000),
    listedAt: m.listedAt,
  };
};

export type VaultEvent = HistoryEvent & { ms: number; tokenId: string; token?: TokenKey; units?: number; near?: number; key: string };

/** ms -> local YYYY-MM-DD. */
export const localDate = (ms: number) => new Date(ms).toLocaleDateString("en-CA");

const fmtUnits = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n < 1 ? 6 : 2 });

/** Indexed event -> the four UI event kinds; listing/offer chatter and plain transfers are skipped. */
export function toEvent(a: ActivityItem): VaultEvent | null {
  const d = a.data as Record<string, string | undefined>;
  const base = { ms: a.at, at: localDate(a.at), tokenId: a.tokenId ?? "", key: String(a.id) };
  const ft = d.ft_id && d.amount ? { token: tokenKey(d.ft_id), units: toUnits(d.ft_id, d.amount) } : {};
  const sym = ft.token ? TOKENS[ft.token].symbol : d.ft_id;
  switch (a.event) {
    case "nft_mint":
      return { ...base, type: "mint", account: d.owner_id ?? "", detail: `Vault #${base.tokenId} minted` };
    case "vault_deposit":
      return { ...base, ...ft, type: "deposit", account: d.sender_id ?? "", detail: `Deposited ${fmtUnits(ft.units ?? 0)} ${sym}` };
    case "vault_withdraw":
      return { ...base, ...ft, type: "withdraw", account: d.owner_id ?? "", detail: `Withdrew ${fmtUnits(ft.units ?? 0)} ${sym}` };
    case "sale":
    case "offer_accept": {
      const near = toNear(d.price ?? d.amount ?? "0");
      return { ...base, type: "transfer", near, account: d.buyer_id ?? "", detail: `${d.seller_id} sold to ${d.buyer_id} for ${near} NEAR` };
    }
    default:
      return null;
  }
}

export const toEvents = (items: ActivityItem[]) => items.flatMap((a) => toEvent(a) ?? []);

/** USD value of an event: token amount at the fallback price, sales at the live NEAR price. */
export const eventUsd = (e: VaultEvent, nearUsd: number) => (e.near !== undefined ? e.near * nearUsd : e.token && e.units ? e.units * TOKENS[e.token].price : 0);

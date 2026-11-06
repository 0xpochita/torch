import { Hono } from "hono";
import { cors } from "hono/cors";
import { type Db, all, get, getCursor } from "./db.ts";
import { type Prices, isKnownFt, nearUsd, priceOf, tokenInfo, toUnits } from "./prices.ts";
import { DAY, navSnapshots, pricesAt, priceReturn, valueAt } from "./snapshots.ts";
import type {
  ActivityItem, Balance, GachaPull, Holder, LeaderboardPeriod, LeaderboardRow, LeaderboardSort, Listing, MarketListing,
  NavPoint, Offer, OffersResponse, Orderbook, Rarity, Sale, Stats, VaultDetail, VaultSummary,
} from "./types.ts";

type TokenRow = {
  token_id: string; vault_id: string; owner_id: string; creator: string; title: string | null; category: string | null; bg: string | null;
  rarity: string | null; basket: string; minted_at: number; l_seller: string | null; l_price: string | null; l_at: number | null;
};
type EventRow = { id: number; block_height: number; ts: number; tx_hash: string | null; receipt_id: string; contract_id: string; standard: string; event: string; token_id: string; data: string };
type OfferRow = { token_id: string; buyer_id: string; amount: string; expires_at: number; created_at: number };

const PERIODS: Record<LeaderboardPeriod, number> = { "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, all: Infinity };
const cmp = (a: number | bigint, b: number | bigint) => (a > b ? 1 : a < b ? -1 : 0);
const byAmountDesc = <T>(f: (x: T) => string) => (a: T, b: T) => cmp(BigInt(f(b)), BigInt(f(a)));
const sum = (xs: string[]) => xs.reduce((s, x) => s + BigInt(x), 0n).toString();

function balance(ftId: string, amount: string, px: Prices): Balance {
  const { symbol, decimals } = tokenInfo(ftId);
  const priceUsd = priceOf(px, ftId);
  return { ftId, symbol, decimals, amount, priceUsd, valueUsd: toUnits(amount, decimals) * priceUsd };
}

const toOffer = (r: OfferRow): Offer => ({ tokenId: r.token_id, buyerId: r.buyer_id, amount: r.amount, expiresAt: r.expires_at, createdAt: r.created_at });

const toActivity = (r: EventRow): ActivityItem => ({
  id: r.id, at: r.ts, blockHeight: r.block_height, txHash: r.tx_hash, receiptId: r.receipt_id, contractId: r.contract_id,
  standard: r.standard as ActivityItem["standard"], event: r.event, tokenId: r.token_id || null, data: JSON.parse(r.data),
});

export function createApp(db: Db, prices: () => Promise<Prices>) {
  const liveOffers = (where: string, ...p: string[]) =>
    all<OfferRow>(db, `SELECT o.* FROM offers o JOIN tokens t USING (token_id) WHERE o.expires_at > ? AND ${where}`, Date.now(), ...p)
      .map(toOffer)
      .sort(byAmountDesc((o) => o.amount));

  const sales = (where: string, ...p: (string | number)[]): Sale[] =>
    all<EventRow>(db, `SELECT * FROM events WHERE event IN ('sale', 'offer_accept') AND ${where} ORDER BY ts DESC, id DESC`, ...p).map((r) => {
      const d = JSON.parse(r.data);
      return { tokenId: r.token_id, sellerId: d.seller_id, buyerId: d.buyer_id, price: String(d.price ?? d.amount), at: r.ts };
    });

  const balancesOf = (px: Prices) => {
    const m = new Map<string, Balance[]>();
    for (const r of all<{ token_id: string; ft_id: string; amount: string }>(db, "SELECT token_id, ft_id, amount FROM vault_balances ORDER BY ft_id"))
      if (isKnownFt(r.ft_id)) m.set(r.token_id, [...(m.get(r.token_id) ?? []), balance(r.ft_id, r.amount, px)]);
    return m;
  };

  // ponytail: loads every balance per request; add per-token queries once there are thousands of vaults.
  function vaults(px: Prices, where = "", ...p: string[]): (VaultSummary & { balances: Balance[] })[] {
    const bal = balancesOf(px);
    const dayAgo = pricesAt(db, Date.now() - DAY);
    return all<TokenRow>(
      db,
      `SELECT t.*, l.seller_id AS l_seller, l.price AS l_price, l.listed_at AS l_at FROM tokens t LEFT JOIN listings l ON l.token_id = t.token_id AND l.seller_id = t.owner_id
       WHERE t.vault_id IS NOT NULL ${where} ORDER BY t.minted_at DESC, CAST(t.token_id AS INTEGER) DESC`,
      ...p,
    ).map((r) => {
      const balances = bal.get(r.token_id) ?? [];
      const listing: Listing | null = r.l_price ? { tokenId: r.token_id, sellerId: r.l_seller!, price: r.l_price, listedAt: r.l_at! } : null;
      return {
        tokenId: r.token_id, vaultId: r.vault_id, title: r.title, ownerId: r.owner_id, creator: r.creator, category: r.category, bg: r.bg,
        rarity: r.rarity as Rarity | null, basket: JSON.parse(r.basket), navUsd: balances.reduce((s, b) => s + b.valueUsd, 0),
        change24h: priceReturn(balances, dayAgo, px), mintedAt: r.minted_at, listing, balances,
      };
    });
  }
  const summary = ({ balances: _, ...v }: VaultSummary & { balances: Balance[] }): VaultSummary => v;

  const app = new Hono();
  app.use("*", cors());

  app.get("/health", (c) => c.json({ ok: true, lastHeight: getCursor(db) }));

  app.get("/vaults", async (c) => {
    const q = c.req.query();
    const conds: string[] = [];
    const p: string[] = [];
    for (const [k, col] of [["owner", "owner_id"], ["creator", "creator"], ["category", "category"]] as const)
      if (q[k]) conds.push(`AND t.${col} = ?`), p.push(q[k]);
    const list = vaults(await prices(), conds.join(" "), ...p).map(summary);
    if (q.sort === "old") list.reverse();
    if (q.sort === "nav") list.sort((a, b) => b.navUsd - a.navUsd);
    // cheapest listed first, unlisted last
    if (q.sort === "price") list.sort((a, b) => (!a.listing || !b.listing ? Number(!a.listing) - Number(!b.listing) : cmp(BigInt(a.listing.price), BigInt(b.listing.price))));
    return c.json<VaultSummary[]>(list);
  });

  app.get("/vaults/:id", async (c) => {
    const id = c.req.param("id");
    const px = await prices();
    const v = vaults(px, "AND t.token_id = ?", id)[0];
    if (!v) return c.json({ error: "vault not found" }, 404);

    const holders: Holder[] = [];
    for (const e of all<EventRow>(db, "SELECT * FROM events WHERE token_id = ? AND event IN ('nft_mint', 'nft_transfer') ORDER BY ts, id", id)) {
      const d = JSON.parse(e.data);
      if (holders.length) holders[holders.length - 1].until = e.ts;
      holders.push({ accountId: d.owner_id ?? d.new_owner_id, since: e.ts, until: null });
    }

    const now = Date.now();
    const navHistory: NavPoint[] = navSnapshots(db, id, now - 30 * DAY);
    if (!navHistory.length) {
      // No snapshot yet: replay deposits/withdrawals as balance snapshots, valued at today's prices.
      const held = new Map<string, bigint>();
      navHistory.push({ at: v.mintedAt, navUsd: 0 });
      for (const e of all<EventRow>(db, "SELECT * FROM events WHERE token_id = ? AND event IN ('vault_deposit', 'vault_withdraw') ORDER BY ts, id", id)) {
        const d = JSON.parse(e.data);
        if (!isKnownFt(d.ft_id)) continue;
        held.set(d.ft_id, (held.get(d.ft_id) ?? 0n) + (e.event === "vault_deposit" ? 1n : -1n) * BigInt(d.amount));
        const navUsd = [...held].reduce((s, [ft, amt]) => s + balance(ft, (amt < 0n ? 0n : amt).toString(), px).valueUsd, 0);
        if (navHistory.at(-1)!.at === e.ts) navHistory.at(-1)!.navUsd = navUsd;
        else navHistory.push({ at: e.ts, navUsd });
      }
    }
    navHistory.push({ at: now, navUsd: v.navUsd });

    return c.json<VaultDetail>({ ...v, navHistory, holders, offers: liveOffers("o.token_id = ?", id), sales: sales("token_id = ?", id) });
  });

  app.get("/market/listings", async (c) => {
    const list: MarketListing[] = vaults(await prices(), "AND l.price IS NOT NULL").map((v) => ({ ...v.listing!, vault: summary(v) }));
    if (c.req.query("sort") !== "new") list.sort((a, b) => cmp(BigInt(a.price), BigInt(b.price)));
    return c.json(list);
  });

  app.get("/market/orderbook/:id", (c) => {
    const id = c.req.param("id");
    if (!get(db, "SELECT 1 FROM tokens WHERE token_id = ?", id)) return c.json({ error: "vault not found" }, 404);
    const l = get<{ seller_id: string; price: string; listed_at: number }>(
      db,
      "SELECT l.* FROM listings l JOIN tokens t ON t.token_id = l.token_id AND t.owner_id = l.seller_id WHERE l.token_id = ?",
      id,
    );
    return c.json<Orderbook>({
      tokenId: id,
      ask: l ? { tokenId: id, sellerId: l.seller_id, price: l.price, listedAt: l.listed_at } : null,
      bids: liveOffers("o.token_id = ?", id),
      sales: sales("token_id = ?", id).slice(0, 20),
    });
  });

  app.get("/offers", (c) => {
    const owner = c.req.query("owner");
    if (!owner) return c.json({ error: "owner is required" }, 400);
    return c.json<OffersResponse>({ made: liveOffers("o.buyer_id = ?", owner), received: liveOffers("t.owner_id = ?", owner) });
  });

  app.get("/activity", (c) => {
    const q = c.req.query();
    const conds = ["ts >= ?"];
    const p: (string | number)[] = [Number(q.since) || 0];
    if (q.account) conds.push("EXISTS (SELECT 1 FROM json_each(events.data) WHERE value = ?)"), p.push(q.account);
    if (q.type) {
      const types = q.type.split(",");
      conds.push(`event IN (${types.map(() => "?").join(",")})`), p.push(...types);
    }
    if (q.token) conds.push("token_id = ?"), p.push(q.token);
    const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);
    const rows = all<EventRow>(db, `SELECT * FROM events WHERE ${conds.join(" AND ")} ORDER BY ts DESC, id DESC LIMIT ${limit}`, ...p);
    return c.json<ActivityItem[]>(rows.map(toActivity));
  });

  app.get("/leaderboard", async (c) => {
    const period = (c.req.query("period") ?? "all") as LeaderboardPeriod;
    const sort = (c.req.query("sort") ?? "value") as LeaderboardSort;
    if (!(period in PERIODS)) return c.json({ error: "period must be 24h|7d|30d|all" }, 400);
    if (!["value", "return", "volume", "sales", "vaults", "holders"].includes(sort)) return c.json({ error: "sort must be value|return|volume|sales|vaults|holders" }, 400);

    const since = PERIODS[period] === Infinity ? 0 : Date.now() - PERIODS[period];
    const px = await prices();
    const then = pricesAt(db, since);
    const all_ = vaults(px);
    const creatorOf = new Map(all_.map((v) => [v.tokenId, v.creator]));
    const rows = new Map<string, { vaults: number; valueUsd: number; valueThen: number; holders: Set<string>; volume: string[] }>();
    const row = (a: string) => rows.get(a) ?? rows.set(a, { vaults: 0, valueUsd: 0, valueThen: 0, holders: new Set(), volume: [] }).get(a)!;
    for (const v of all_) {
      const r = row(v.creator);
      r.vaults++;
      r.valueUsd += v.navUsd;
      if (then) r.valueThen += valueAt(v.balances, then);
    }
    for (const e of all<EventRow>(db, "SELECT token_id, data FROM events WHERE event IN ('nft_mint', 'nft_transfer')")) {
      const creator = creatorOf.get(e.token_id);
      const d = JSON.parse(e.data);
      if (creator) row(creator).holders.add(d.owner_id ?? d.new_owner_id);
    }
    for (const s of sales("ts >= ?", since)) {
      const creator = creatorOf.get(s.tokenId);
      if (creator) row(creator).volume.push(s.price);
    }

    const out: LeaderboardRow[] = [...rows].map(([accountId, r]) => ({
      rank: 0, accountId, vaults: r.vaults, valueUsd: r.valueUsd, holders: r.holders.size,
      return: r.valueThen > 0 ? (r.valueUsd / r.valueThen - 1) * 100 : null, sales: r.volume.length, volume: sum(r.volume),
    }));
    const key: Record<LeaderboardSort, (r: LeaderboardRow) => number | bigint> = {
      value: (r) => r.valueUsd, return: (r) => r.return ?? -Infinity, volume: (r) => BigInt(r.volume), sales: (r) => r.sales, vaults: (r) => r.vaults, holders: (r) => r.holders,
    };
    out.sort((a, b) => cmp(key[sort](b), key[sort](a)) || a.accountId.localeCompare(b.accountId));
    out.forEach((r, i) => (r.rank = i + 1));
    return c.json<LeaderboardRow[]>(out);
  });

  app.get("/gacha/recent", async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 20, 1), 100);
    const byId = new Map(vaults(await prices()).map((v) => [v.tokenId, summary(v)]));
    const rows = all<{ token_id: string; player_id: string; rarity: string; pity_after: number; price: string; ts: number }>(db, `SELECT * FROM pulls ORDER BY ts DESC LIMIT ${limit}`);
    return c.json<GachaPull[]>(
      rows.map((r) => ({ tokenId: r.token_id, playerId: r.player_id, rarity: r.rarity as Rarity, pityAfter: r.pity_after, price: r.price, at: r.ts, vault: byId.get(r.token_id) ?? null })),
    );
  });

  app.get("/stats", async (c) => {
    const px = await prices();
    const vs = vaults(px);
    const all_sales = sales("1");
    const count = (sql: string, ...p: number[]) => get<{ n: number }>(db, sql, ...p)!.n;
    return c.json<Stats>({
      vaults: vs.length,
      tvlUsd: vs.reduce((s, v) => s + v.navUsd, 0),
      listings: count("SELECT COUNT(*) AS n FROM listings l JOIN tokens t ON t.token_id = l.token_id AND t.owner_id = l.seller_id"),
      offers: count("SELECT COUNT(*) AS n FROM offers WHERE expires_at > ?", Date.now()),
      sales: all_sales.length,
      volume: sum(all_sales.map((s) => s.price)),
      volume24h: sum(all_sales.filter((s) => s.at >= Date.now() - PERIODS["24h"]).map((s) => s.price)),
      pulls: count("SELECT COUNT(*) AS n FROM pulls"),
      holders: new Set(vs.map((v) => v.ownerId)).size,
      nearUsd: nearUsd(px),
      lastHeight: getCursor(db),
    });
  });

  return app;
}

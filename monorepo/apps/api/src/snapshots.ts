// Price + NAV history. The API process writes a snapshot every SNAPSHOT_MS; returns are price-only
// (today's balances valued at then vs now prices) so deposits and withdrawals never count as gains.
import { type Db, all, get, run } from "./db.ts";
import { type Prices, priceOf, tokenInfo, toUnits } from "./prices.ts";
import type { NavPoint } from "./types.ts";

type Holding = { ftId: string; amount: string };

const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** USD value of `holdings` at `px`. */
export const valueAt = (holdings: Holding[], px: Prices) =>
  holdings.reduce((s, h) => s + toUnits(h.amount, tokenInfo(h.ftId).decimals) * priceOf(px, h.ftId), 0);

function holdingsByVault(db: Db) {
  const m = new Map<string, Holding[]>();
  for (const r of all<{ token_id: string; ft_id: string; amount: string }>(db, "SELECT token_id, ft_id, amount FROM vault_balances"))
    m.set(r.token_id, [...(m.get(r.token_id) ?? []), { ftId: r.ft_id, amount: r.amount }]);
  return m;
}

function write(db: Db, fn: () => void) {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

const putPrices = (db: Db, px: Prices, at: number) => {
  for (const [key, usd] of Object.entries(px)) run(db, "INSERT OR REPLACE INTO price_snapshots (at, key, usd) VALUES (?, ?, ?)", at, key, usd);
};
const putNav = (db: Db, tokenId: string, at: number, navUsd: number) =>
  run(db, "INSERT OR REPLACE INTO nav_snapshots (token_id, at, nav_usd) VALUES (?, ?, ?)", tokenId, at, navUsd);

/** Current prices plus every vault's NAV (from the indexed balances) at `at`. */
export function takeSnapshot(db: Db, px: Prices, at: number) {
  const held = holdingsByVault(db);
  write(db, () => {
    putPrices(db, px, at);
    for (const { token_id } of all<{ token_id: string }>(db, "SELECT token_id FROM tokens WHERE vault_id IS NOT NULL"))
      putNav(db, token_id, at, valueAt(held.get(token_id) ?? [], px));
  });
}

/** Prices of the last snapshot at or before `t` (the oldest one if all are newer); null when there are none. */
export function pricesAt(db: Db, t: number): Prices | null {
  const at = get<{ at: number | null }>(db, "SELECT COALESCE((SELECT MAX(at) FROM price_snapshots WHERE at <= ?), (SELECT MIN(at) FROM price_snapshots)) AS at", t)?.at;
  if (at == null) return null;
  return Object.fromEntries(all<{ key: string; usd: number }>(db, "SELECT key, usd FROM price_snapshots WHERE at = ?", at).map((r) => [r.key, r.usd]));
}

/** % change of holding `holdings` from `then` to `now` prices; null when unmeasurable (no snapshot, empty vault). */
export function priceReturn(holdings: Holding[], then: Prices | null, now: Prices): number | null {
  if (!then) return null;
  const before = valueAt(holdings, then);
  return before > 0 ? (valueAt(holdings, now) / before - 1) * 100 : null;
}

export const navSnapshots = (db: Db, tokenId: string, since: number): NavPoint[] =>
  all<{ at: number; nav_usd: number }>(db, "SELECT at, nav_usd FROM nav_snapshots WHERE token_id = ? AND at >= ? ORDER BY at", tokenId, since).map((r) => ({
    at: r.at,
    navUsd: r.nav_usd,
  }));

/* ---------- FIXTURE=1: synthetic history ---------- */

const STABLE = ["tusdc", "tusdt"];

/** Deterministic multiplier for `key` at hour `i` of `n`; exactly 1 at i = n so the walk ends at today's price. */
function drift(key: string, i: number, n: number) {
  const seed = [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
  const amp = STABLE.includes(key) ? 0.002 : 0.08;
  const f = (x: number) => 1 + amp * Math.sin(x / 37 + seed) + (amp / 3) * Math.sin(x / 5 + seed * 2);
  return f(i) / f(n);
}

/**
 * Hourly price walk over the last `days` ending at `px`, and each vault's NAV at those hours
 * (balances replayed from its deposit/withdraw events, valued at that hour's prices).
 */
export function fixtureSnapshots(db: Db, px: Prices, now: number, days = 30) {
  const n = days * 24;
  const at = (i: number) => now - (n - i) * HOUR;
  const priceAt = (i: number): Prices => Object.fromEntries(Object.entries(px).map(([k, usd]) => [k, usd * drift(k, i, n)]));
  const flows = all<{ token_id: string; ts: number; event: string; data: string }>(
    db,
    "SELECT token_id, ts, event, data FROM events WHERE event IN ('vault_deposit', 'vault_withdraw') ORDER BY ts, id",
  );
  const vaults = all<{ token_id: string; minted_at: number }>(db, "SELECT token_id, minted_at FROM tokens WHERE vault_id IS NOT NULL");

  write(db, () => {
    for (let i = 0; i <= n; i++) {
      const p = priceAt(i);
      putPrices(db, p, at(i));
      for (const v of vaults) {
        if (at(i) < v.minted_at) continue;
        const held = new Map<string, bigint>();
        for (const f of flows) {
          if (f.token_id !== v.token_id || f.ts > at(i)) continue;
          const d = JSON.parse(f.data);
          held.set(d.ft_id, (held.get(d.ft_id) ?? 0n) + (f.event === "vault_deposit" ? 1n : -1n) * BigInt(d.amount));
        }
        putNav(db, v.token_id, at(i), valueAt([...held].map(([ftId, amt]) => ({ ftId, amount: (amt < 0n ? 0n : amt).toString() })), p));
      }
    }
  });
}

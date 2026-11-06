import type { Config } from "./config.ts";
import { type Db, getCursor, run, setCursor } from "./db.ts";

/** One successful receipt execution, reduced to what the indexer needs. */
export type Outcome = { receiptId: string; txHash: string | null; executorId: string; logs: string[] };
export type Block = { height: number; timestamp: number; outcomes: Outcome[] };

/** Source of blocks + view calls: testnet (neardata, RPC fallback) or the offline fixture. */
export type Chain = {
  finalHeight(): Promise<number>;
  /** null when the height was skipped (no block produced). */
  block(height: number): Promise<Block | null>;
  view<T>(accountId: string, method: string, args: object): Promise<T>;
};

type Event = { standard: "torch" | "nep171"; event: string; data: Record<string, any>[] };

export function parseEvent(log: string): Event | null {
  if (!log.startsWith("EVENT_JSON:")) return null;
  try {
    const j = JSON.parse(log.slice("EVENT_JSON:".length));
    if ((j.standard === "torch" || j.standard === "nep171") && typeof j.event === "string" && Array.isArray(j.data)) return j;
  } catch {}
  return null;
}

export const watched = (cfg: Config, id: string) =>
  id === cfg.collectionId || id === cfg.marketId || id === cfg.gachaId || id.endsWith(`.${cfg.collectionId}`) || cfg.ftIds.includes(id);

const MARKET_EVENTS = ["list", "delist", "sale", "offer", "offer_cancel", "offer_accept"];

/** Only trust an event when it comes from the contract that is allowed to emit it. */
function trusted(cfg: Config, executor: string, ev: Event, d: Record<string, any>): boolean {
  if (ev.standard === "nep171") return executor === cfg.collectionId && (ev.event === "nft_mint" || ev.event === "nft_transfer");
  if (ev.event === "vault_created" || ev.event === "vault_withdraw") return executor === cfg.collectionId;
  if (ev.event === "vault_deposit") return executor === `${d.token_id}.${cfg.collectionId}`;
  if (MARKET_EVENTS.includes(ev.event)) return executor === cfg.marketId;
  if (ev.event === "gacha_pull") return executor === cfg.gachaId;
  return false;
}

type Followups = { balances: { tokenId: string; ftId: string }[]; titles: string[] };

function applyEvent(db: Db, cfg: Config, event: string, d: Record<string, any>, tokenId: string, ts: number, out: Followups) {
  const str = (v: unknown) => String(v);
  switch (event) {
    case "nft_mint":
    case "nft_transfer":
      run(db, "INSERT INTO tokens (token_id, owner_id) VALUES (?, ?) ON CONFLICT (token_id) DO UPDATE SET owner_id = excluded.owner_id", tokenId, str(d.owner_id ?? d.new_owner_id));
      if (event === "nft_transfer") run(db, "DELETE FROM listings WHERE token_id = ?", tokenId);
      break;
    case "vault_created": {
      const extra = (typeof d.extra === "string" ? JSON.parse(d.extra) : d.extra) ?? {};
      const creator = str(d.creator ?? extra.creator);
      // Anyone can mint with any metadata; rarity only means something on gacha mints (INTERFACES wave 1 deltas).
      const rarity = creator === cfg.gachaId ? (extra.rarity ?? null) : null;
      run(
        db,
        `INSERT INTO tokens (token_id, vault_id, owner_id, creator, category, bg, rarity, basket, minted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (token_id) DO UPDATE SET vault_id = excluded.vault_id, owner_id = COALESCE(tokens.owner_id, excluded.owner_id),
           creator = excluded.creator, category = excluded.category, bg = excluded.bg, rarity = excluded.rarity, basket = excluded.basket, minted_at = excluded.minted_at`,
        tokenId, str(d.vault_id), str(d.owner_id), creator, extra.category ?? null, extra.bg ?? null, rarity, JSON.stringify(extra.basket ?? []), ts,
      );
      out.titles.push(tokenId);
      break;
    }
    case "vault_deposit":
    case "vault_withdraw":
      out.balances.push({ tokenId, ftId: str(d.ft_id) });
      break;
    case "list":
      run(db, "INSERT OR REPLACE INTO listings (token_id, seller_id, price, listed_at) VALUES (?, ?, ?, ?)", tokenId, str(d.seller_id), str(d.price), ts);
      break;
    case "delist":
    case "sale":
      run(db, "DELETE FROM listings WHERE token_id = ?", tokenId);
      break;
    case "offer":
      // Wave 2 market: `created_at` (and `min_balances`) are in the event; older events only have the block time.
      run(db, "INSERT OR REPLACE INTO offers (token_id, buyer_id, amount, expires_at, created_at) VALUES (?, ?, ?, ?, ?)", tokenId, str(d.buyer_id), str(d.amount), Number(d.expires_at), Number(d.created_at ?? ts));
      break;
    case "offer_cancel":
    case "offer_accept":
      run(db, "DELETE FROM offers WHERE token_id = ? AND buyer_id = ?", tokenId, str(d.buyer_id));
      if (event === "offer_accept") run(db, "DELETE FROM listings WHERE token_id = ?", tokenId);
      break;
    case "gacha_pull":
      run(db, "INSERT OR REPLACE INTO pulls (token_id, player_id, rarity, pity_after, price, ts) VALUES (?, ?, ?, ?, ?, ?)", tokenId, str(d.player_id), str(d.rarity), Number(d.pity_after), str(d.price), ts);
      break;
  }
}

/** Store every trusted event of a block and update the tables, atomically with the cursor. */
export function applyBlock(db: Db, cfg: Config, b: Block): Followups {
  const out: Followups = { balances: [], titles: [] };
  db.exec("BEGIN");
  try {
    for (const o of b.outcomes) {
      if (!watched(cfg, o.executorId)) continue;
      o.logs.forEach((log, li) => {
        const ev = parseEvent(log);
        ev?.data.forEach((d, di) => {
          if (!d || typeof d !== "object" || !trusted(cfg, o.executorId, ev, d)) return;
          const tokenIds: string[] = ev.standard === "nep171" ? (Array.isArray(d.token_ids) ? d.token_ids.map(String) : []) : [d.token_id == null ? "" : String(d.token_id)];
          for (const tokenId of tokenIds) {
            const r = run(
              db,
              `INSERT OR IGNORE INTO events (block_height, ts, tx_hash, receipt_id, log_index, item_index, contract_id, standard, event, token_id, data)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              b.height, b.timestamp, o.txHash, o.receiptId, li, di, o.executorId, ev.standard, ev.event, tokenId, JSON.stringify(d),
            );
            if (r.changes) applyEvent(db, cfg, ev.event, d, tokenId, b.timestamp, out); // replayed blocks are no-ops
          }
        });
      });
    }
    setCursor(db, b.height);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return out;
}

// ponytail: refresh failures are only logged (cursor already moved); the next event on that vault fixes it.
async function followUp(db: Db, chain: Chain, cfg: Config, f: Followups, ts: number) {
  const seen = new Set<string>();
  for (const { tokenId, ftId } of f.balances) {
    if (seen.has(tokenId + ftId)) continue;
    seen.add(tokenId + ftId);
    try {
      const amount = await chain.view<string>(ftId, "ft_balance_of", { account_id: `${tokenId}.${cfg.collectionId}` });
      run(db, "INSERT OR REPLACE INTO vault_balances (token_id, ft_id, amount, updated_at) VALUES (?, ?, ?, ?)", tokenId, ftId, String(amount), ts);
    } catch (e) {
      console.warn(`balance refresh ${tokenId}/${ftId} failed:`, (e as Error).message);
    }
  }
  for (const tokenId of f.titles) {
    try {
      const t = await chain.view<{ metadata?: { title?: string | null } } | null>(cfg.collectionId, "nft_token", { token_id: tokenId });
      if (t?.metadata?.title) run(db, "UPDATE tokens SET title = ? WHERE token_id = ?", t.metadata.title, tokenId);
    } catch (e) {
      console.warn(`nft_token ${tokenId} failed:`, (e as Error).message);
    }
  }
}

/** Index from the stored cursor (or START_HEIGHT, or the tip) up to the final height; returns blocks handled. */
export async function indexOnce(db: Db, chain: Chain, cfg: Config, max = 100): Promise<number> {
  const tip = await chain.finalHeight();
  let h = getCursor(db) ?? (cfg.startHeight ?? tip) - 1;
  let n = 0;
  for (; h < tip && n < max; n++) {
    h++;
    const b = await chain.block(h);
    if (!b) setCursor(db, h);
    else await followUp(db, chain, cfg, applyBlock(db, cfg, b), b.timestamp);
  }
  return n;
}

export async function runIndexer(db: Db, chain: Chain, cfg: Config, signal: AbortSignal) {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  while (!signal.aborted) {
    try {
      if ((await indexOnce(db, chain, cfg)) === 0) await sleep(1000);
    } catch (e) {
      console.error("indexer:", (e as Error).message);
      await sleep(5000);
    }
  }
}

/* ---------- testnet chain: neardata.xyz, falling back to RPC ---------- */

async function rpc<T>(url: string, method: string, params: object): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "api", method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const j: any = await res.json();
  if (j.error) throw new Error(j.error.cause?.name ?? j.error.message ?? JSON.stringify(j.error));
  if (j.result?.error) throw new Error(j.result.error);
  return j.result;
}

const failed = (status: unknown) => !!status && typeof status === "object" && "Failure" in status;

export function nearChain(cfg: Config): Chain {
  const neardata = async (path: string) => {
    const res = await fetch(`${cfg.neardataUrl}${path}`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`neardata ${res.status}`);
    return (await res.json()) as any;
  };

  async function neardataBlock(h: number): Promise<Block | null> {
    const j = await neardata(`/v0/block/${h}`);
    if (!j) return null;
    const outcomes: Outcome[] = [];
    for (const shard of j.shards ?? [])
      for (const o of shard.receipt_execution_outcomes ?? []) {
        const eo = o.execution_outcome;
        if (failed(eo.outcome.status)) continue;
        outcomes.push({ receiptId: eo.id, txHash: o.tx_hash ?? null, executorId: eo.outcome.executor_id, logs: eo.outcome.logs });
      }
    const ns = j.block.header.timestamp_nanosec ?? String(j.block.header.timestamp);
    return { height: h, timestamp: Number(BigInt(ns) / 1_000_000n), outcomes };
  }

  // Chunks carry no logs, so pull every tx sent to one of our accounts and read its receipt outcomes.
  async function rpcBlock(h: number): Promise<Block | null> {
    let b: any;
    try {
      b = await rpc(cfg.rpcUrl, "block", { block_id: h });
    } catch (e) {
      if ((e as Error).message === "UNKNOWN_BLOCK") return null;
      throw e;
    }
    const outcomes: Outcome[] = [];
    for (const ch of b.chunks) {
      if (ch.height_included !== h) continue;
      const c: any = await rpc(cfg.rpcUrl, "chunk", { chunk_id: ch.chunk_hash });
      for (const tx of c.transactions) {
        if (!watched(cfg, tx.receiver_id)) continue;
        const s: any = await rpc(cfg.rpcUrl, "EXPERIMENTAL_tx_status", { tx_hash: tx.hash, sender_account_id: tx.signer_id, wait_until: "FINAL" });
        for (const ro of s.receipts_outcome)
          if (!failed(ro.outcome.status)) outcomes.push({ receiptId: ro.id, txHash: tx.hash, executorId: ro.outcome.executor_id, logs: ro.outcome.logs });
      }
    }
    return { height: h, timestamp: Number(BigInt(b.header.timestamp_nanosec) / 1_000_000n), outcomes };
  }

  return {
    async finalHeight() {
      if (!cfg.neardataUrl) return (await rpc<any>(cfg.rpcUrl, "block", { finality: "final" })).header.height;
      try {
        return (await neardata("/v0/last_block/final")).block.header.height;
      } catch {
        return (await rpc<any>(cfg.rpcUrl, "block", { finality: "final" })).header.height;
      }
    },
    async block(h) {
      if (!cfg.neardataUrl) return rpcBlock(h);
      try {
        return await neardataBlock(h);
      } catch (e) {
        console.warn(`neardata block ${h} failed (${(e as Error).message}), using RPC`);
        return rpcBlock(h);
      }
    },
    async view<T>(accountId: string, method: string, args: object) {
      const r = await rpc<{ result: number[] }>(cfg.rpcUrl, "query", {
        request_type: "call_function",
        finality: "final",
        account_id: accountId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      });
      return JSON.parse(Buffer.from(r.result).toString()) as T;
    },
  };
}

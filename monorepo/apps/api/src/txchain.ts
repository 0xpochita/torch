// A Chain built from transaction history instead of walking every block: FastNEAR's tx API lists
// every transaction that touched one of our accounts, and returns their receipts with logs. Only the
// heights that carry our receipts exist; every other height is a skipped block, so indexOnce walks
// them for free. Used where no long-running indexer is possible (the hosted web app).
import type { Config } from "./config.ts";
import { type Block, type Chain, type Outcome, nearChain, parseEvent } from "./indexer.ts";

const TX_API = process.env.FASTNEAR_TX_URL ?? "https://tx.test.fastnear.com";

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(TX_API + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`fastnear ${path} ${res.status}`);
  return res.json() as Promise<T>;
}

type AccountTxs = { account_txs: { transaction_hash: string; tx_block_height: number }[]; txs_count: number };
type ReceiptOutcome = {
  execution_outcome: { block_height: number; block_timestamp: number | string; id: string; outcome: { logs: string[]; executor_id: string; status: unknown } };
};
type FullTx = { transaction: { hash: string }; receipts: ReceiptOutcome[] };

const failed = (status: unknown) => !!status && typeof status === "object" && "Failure" in status;

export type TxChain = Chain & { sync(): Promise<void>; first(): number | null };

export function txChain(cfg: Config): TxChain {
  const rpc = nearChain({ ...cfg, neardataUrl: "", rpcUrl: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" }); // views only
  // Views read final state, so within one sync the same call always answers the same: ask once.
  let views = new Map<string, Promise<unknown>>();
  const blocks = new Map<number, Block>();
  const seen = new Set<string>();
  let tip = 0;

  // Every tx hash for one account; the API pages backwards with max_block_height.
  async function hashesOf(accountId: string): Promise<string[]> {
    const out: string[] = [];
    let max: number | undefined;
    for (let page = 0; page < 50; page++) {
      const r = await post<AccountTxs>("/v0/account", { account_id: accountId, max_block_height: max });
      const fresh = r.account_txs.filter((t) => !out.includes(t.transaction_hash));
      out.push(...fresh.map((t) => t.transaction_hash));
      if (!fresh.length || out.length >= r.txs_count) break;
      max = Math.min(...r.account_txs.map((t) => t.tx_block_height)) - 1;
    }
    return out;
  }

  async function addTxs(hashes: string[]) {
    for (let i = 0; i < hashes.length; i += 20) {
      const { transactions } = await post<{ transactions: (FullTx | null)[] }>("/v0/transactions", { tx_hashes: hashes.slice(i, i + 20) });
      for (const tx of transactions) {
        if (!tx) continue;
        seen.add(tx.transaction.hash);
        for (const r of tx.receipts ?? []) {
          const eo = r.execution_outcome;
          if (failed(eo.outcome.status)) continue;
          const o: Outcome = { receiptId: eo.id, txHash: tx.transaction.hash, executorId: eo.outcome.executor_id, logs: eo.outcome.logs };
          const b = blocks.get(eo.block_height) ?? { height: eo.block_height, timestamp: Number(BigInt(eo.block_timestamp) / 1_000_000n), outcomes: [] };
          if (!b.outcomes.some((x) => x.receiptId === o.receiptId)) b.outcomes.push(o);
          blocks.set(eo.block_height, b);
          tip = Math.max(tip, eo.block_height);
        }
      }
    }
  }

  return {
    /** Pull new transactions of the collection, market, gacha and every vault account. */
    async sync() {
      views = new Map();
      const tokens = await rpc.view<{ token_id: string }[]>(cfg.collectionId, "nft_tokens", { from_index: "0", limit: 1000 }).catch(() => []);
      const accounts = [cfg.collectionId, cfg.marketId, cfg.gachaId, ...tokens.map((t) => `${t.token_id}.${cfg.collectionId}`)];
      const lists = await Promise.all(accounts.map(hashesOf));
      await addTxs([...new Set(lists.flat())].filter((h) => !seen.has(h)));
      // Warm, in parallel, the views the indexer's follow-ups will ask for one by one.
      const want: [string, string, object][] = [];
      for (const b of blocks.values())
        for (const o of b.outcomes)
          for (const log of o.logs) {
            const ev = parseEvent(log);
            for (const d of ev?.data ?? []) {
              if (ev!.event === "vault_deposit" || ev!.event === "vault_withdraw") want.push([d.ft_id, "ft_balance_of", { account_id: `${d.token_id}.${cfg.collectionId}` }]);
              if (ev!.event === "vault_created") want.push([cfg.collectionId, "nft_token", { token_id: d.token_id }]);
            }
          }
      await Promise.allSettled(want.map(([a, m, x]) => this.view(a, m, x)));
    },
    first: () => (blocks.size ? Math.min(...blocks.keys()) : null),
    finalHeight: async () => tip,
    block: async (h) => blocks.get(h) ?? null,
    next: async (h) => Math.min(...[...blocks.keys()].filter((k) => k > h), tip),
    view<T>(accountId: string, method: string, args: object) {
      const key = `${accountId}|${method}|${JSON.stringify(args)}`;
      if (!views.has(key)) views.set(key, rpc.view<T>(accountId, method, args));
      return views.get(key) as Promise<T>;
    },
  };
}

// The REST API of apps/api, served from the web app itself so the hosted site needs no separate
// server. Instead of a long-running block indexer it replays the transaction history of our
// contracts (FastNEAR tx API) into an in-memory SQLite, and refreshes it at most every 30 s.
import { createApp } from "../../../../../api/src/app.ts";
import { config } from "../../../../../api/src/config.ts";
import { openDb } from "../../../../../api/src/db.ts";
import { indexOnce } from "../../../../../api/src/indexer.ts";
import { livePrices } from "../../../../../api/src/prices.ts";
import { txChain } from "../../../../../api/src/txchain.ts";

export const maxDuration = 60;

const REFRESH_MS = 30_000;
const db = openDb(":memory:");
const chain = txChain(config);
const app = createApp(db, livePrices);
let synced = 0;
let pending: Promise<void> | null = null;

async function refresh() {
  await chain.sync();
  const cfg = { ...config, startHeight: chain.first() };
  while (await indexOnce(db, chain, cfg, 1000));
  synced = Date.now();
}

async function ready() {
  if (Date.now() - synced > REFRESH_MS && !pending) pending = refresh().finally(() => (pending = null));
  // First request waits for the index; later ones answer from the last one while it refreshes.
  if (!synced && pending) await pending;
}

async function handle(req: Request) {
  try {
    await ready();
  } catch (e) {
    return Response.json({ error: `index unavailable: ${(e as Error).message}` }, { status: 503 });
  }
  const url = new URL(req.url);
  url.pathname = url.pathname.replace(/^\/api/, "") || "/";
  return app.fetch(new Request(url, req));
}

export const GET = handle;

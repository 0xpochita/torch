import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { FIXTURE_START, fixtureChain } from "./fixture.ts";
import { indexOnce, nearChain, runIndexer } from "./indexer.ts";
import { livePrices, staticPrices } from "./prices.ts";
import { fixtureSnapshots, takeSnapshot } from "./snapshots.ts";

const fixture = process.env.FIXTURE === "1";
// Fixture mode replays into memory so it never touches the real index.
const db = openDb(fixture ? ":memory:" : fileURLToPath(new URL("../data/torch.db", import.meta.url)));
const chain = fixture ? fixtureChain(config) : nearChain(config);
const cfg = fixture ? { ...config, startHeight: FIXTURE_START } : config;

const prices = fixture ? async () => staticPrices() : livePrices;
const SNAPSHOT_MS = Number(process.env.SNAPSHOT_MS) || 10 * 60_000;

// Fixture: replay every block first, then backfill 30 days of synthetic hourly history.
if (fixture) {
  while (await indexOnce(db, chain, cfg));
  fixtureSnapshots(db, staticPrices(), Date.now());
}

const stop = new AbortController();
void runIndexer(db, chain, cfg, stop.signal);

const snapshot = () =>
  prices()
    .then((px) => takeSnapshot(db, px, Date.now()))
    .catch((e) => console.error("snapshot:", (e as Error).message));
if (!fixture) void snapshot();
const timer = setInterval(snapshot, SNAPSHOT_MS);

const port = Number(process.env.PORT ?? 8787);
const server = serve({ fetch: createApp(db, prices).fetch, port });
console.log(`api on http://localhost:${port}${fixture ? " (fixture)" : ""}, indexing ${cfg.collectionId} from ${cfg.startHeight ?? "tip"}`);

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    stop.abort();
    clearInterval(timer);
    server.close();
    db.close();
    process.exit(0);
  });

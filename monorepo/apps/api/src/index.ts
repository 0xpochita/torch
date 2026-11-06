import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { FIXTURE_START, fixtureChain } from "./fixture.ts";
import { nearChain, runIndexer } from "./indexer.ts";
import { livePrices, staticPrices } from "./prices.ts";

const fixture = process.env.FIXTURE === "1";
// Fixture mode replays into memory so it never touches the real index.
const db = openDb(fixture ? ":memory:" : fileURLToPath(new URL("../data/torch.db", import.meta.url)));
const chain = fixture ? fixtureChain(config) : nearChain(config);
const cfg = fixture ? { ...config, startHeight: FIXTURE_START } : config;

const stop = new AbortController();
void runIndexer(db, chain, cfg, stop.signal);

const port = Number(process.env.PORT ?? 8787);
const server = serve({ fetch: createApp(db, fixture ? async () => staticPrices() : livePrices).fetch, port });
console.log(`api on http://localhost:${port}${fixture ? " (fixture)" : ""}, indexing ${cfg.collectionId} from ${cfg.startHeight ?? "tip"}`);

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    stop.abort();
    server.close();
    db.close();
    process.exit(0);
  });

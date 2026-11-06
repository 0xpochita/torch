import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { FIXTURE_START, fixtureChain } from "./fixture.ts";
import { indexOnce } from "./indexer.ts";
import { staticPrices } from "./prices.ts";
import type { ActivityItem, GachaPull, LeaderboardRow, MarketListing, OffersResponse, Orderbook, Stats, VaultDetail, VaultSummary } from "./types.ts";

const NEAR = (n: number) => (BigInt(Math.round(n * 1000)) * 10n ** 21n).toString();

test("fixture replay serves every endpoint", async () => {
  const db = openDb(":memory:");
  const chain = fixtureChain(config);
  const cfg = { ...config, startHeight: FIXTURE_START };
  const tip = await chain.finalHeight();
  assert.equal(await indexOnce(db, chain, cfg), tip - FIXTURE_START + 1);
  assert.equal(await indexOnce(db, chain, cfg), 0, "nothing left after reaching the tip");

  const app = createApp(db, async () => staticPrices());
  const get = async <T>(path: string, status = 200) => {
    const res = await app.request(path);
    assert.equal(res.status, status, path);
    return (await res.json()) as T;
  };

  const vaults = await get<VaultSummary[]>("/vaults");
  assert.deepEqual(vaults.map((v) => v.tokenId), ["2", "1", "0"]);
  const [v2, v1, v0] = vaults;
  assert.equal(v0.ownerId, "erin.testnet");
  assert.equal(v0.title, "NEAR Blue Chip");
  assert.equal(v0.category, "Blue Chip");
  assert.equal(v0.vaultId, `0.${config.collectionId}`);
  assert.equal(v0.basket.length, 3);
  assert.equal(v0.listing, null, "sold vaults are no longer listed");
  // 300 USDC + 0.003 BTC @ 98450 + 0.1 ETH @ 3420
  assert.ok(Math.abs(v0.navUsd - (300 + 295.35 + 342)) < 1e-6, String(v0.navUsd));
  assert.equal(v1.navUsd, 1000);
  assert.equal(v1.listing?.price, NEAR(10));
  assert.equal(v2.rarity, "Epic");
  assert.equal(v2.creator, config.gachaId);

  assert.deepEqual((await get<VaultSummary[]>("/vaults?owner=carol.testnet")).map((v) => v.tokenId), ["1"]);
  assert.deepEqual((await get<VaultSummary[]>("/vaults?creator=alice.testnet")).map((v) => v.tokenId), ["0"]);
  assert.deepEqual((await get<VaultSummary[]>("/vaults?category=Meme")).map((v) => v.tokenId), ["2"]);
  assert.deepEqual((await get<VaultSummary[]>("/vaults?sort=nav")).map((v) => v.tokenId), ["1", "0", "2"]);
  assert.deepEqual((await get<VaultSummary[]>("/vaults?sort=price")).map((v) => v.tokenId)[0], "1");

  const d = await get<VaultDetail>("/vaults/0");
  assert.deepEqual(d.holders.map((h) => h.accountId), ["alice.testnet", "bob.testnet", "erin.testnet"]);
  assert.equal(d.holders[2].until, null);
  assert.deepEqual(d.balances.map((b) => [b.symbol, b.amount]), [["BTC", "300000"], ["ETH", "100000000000000000"], ["USDC", "300000000"]]);
  assert.deepEqual(d.navHistory.map((p) => Math.round(p.navUsd)), [0, 1037, 937, 937]);
  assert.deepEqual(d.offers.map((o) => o.buyerId), ["bob.testnet"], "dave cancelled, erin was accepted");
  assert.deepEqual(d.sales.map((s) => [s.buyerId, s.price]), [["erin.testnet", NEAR(6)], ["bob.testnet", NEAR(5)]]);
  await get("/vaults/99", 404);

  const listings = await get<MarketListing[]>("/market/listings");
  assert.deepEqual(listings.map((l) => [l.tokenId, l.sellerId, l.vault.title]), [["1", "carol.testnet", "Stable Harbor"]]);

  const book = await get<Orderbook>("/market/orderbook/1");
  assert.equal(book.ask?.price, NEAR(10));
  assert.deepEqual(book.bids.map((b) => [b.buyerId, b.amount]), [["bob.testnet", NEAR(8)]]);
  assert.equal(book.sales.length, 0, "the spoofed sale was ignored");
  await get("/market/orderbook/99", 404);

  const bob = await get<OffersResponse>("/offers?owner=bob.testnet");
  assert.deepEqual(bob.made.map((o) => o.tokenId).sort(), ["0", "1"]);
  assert.deepEqual((await get<OffersResponse>("/offers?owner=carol.testnet")).received.map((o) => o.buyerId), ["bob.testnet"]);
  await get("/offers", 400);

  const act = await get<ActivityItem[]>("/activity");
  assert.equal(act[0].event, "vault_withdraw");
  assert.ok(!act.some((a) => a.contractId === "spoof.testnet"));
  assert.ok(act.every((a, i) => i === 0 || act[i - 1].at >= a.at));
  const sales = await get<ActivityItem[]>("/activity?type=sale,offer_accept");
  assert.deepEqual(sales.map((a) => a.event), ["offer_accept", "sale"]);
  const dave = await get<ActivityItem[]>("/activity?account=dave.testnet");
  assert.deepEqual(new Set(dave.map((a) => a.event)), new Set(["vault_created", "nft_mint", "gacha_pull", "offer", "offer_cancel"]));
  assert.equal((await get<ActivityItem[]>(`/activity?since=${act[0].at}`)).length, 1);

  const lb = await get<LeaderboardRow[]>("/leaderboard");
  assert.deepEqual(lb.map((r) => [r.rank, r.accountId]), [[1, "carol.testnet"], [2, "alice.testnet"], [3, config.gachaId]]);
  const alice = (await get<LeaderboardRow[]>("/leaderboard?sort=volume&period=all"))[0];
  assert.deepEqual([alice.accountId, alice.sales, alice.volume, alice.holders], ["alice.testnet", 2, NEAR(11), 3]);
  assert.equal((await get<LeaderboardRow[]>("/leaderboard?sort=volume&period=24h"))[0].sales, 1, "only the accepted offer is within 24h");
  await get("/leaderboard?period=1y", 400);

  const pulls = await get<GachaPull[]>("/gacha/recent");
  assert.deepEqual(pulls.map((p) => [p.playerId, p.tokenId, p.rarity, p.price, p.vault?.title]), [["dave.testnet", "2", "Epic", NEAR(0.1), "Lucky Epic"]]);

  const stats = await get<Stats>("/stats");
  assert.deepEqual(
    { ...stats, tvlUsd: Math.round(stats.tvlUsd) },
    { vaults: 3, tvlUsd: Math.round(937.35 + 1000 + 68.4), listings: 1, offers: 2, sales: 2, volume: NEAR(11), volume24h: NEAR(6), pulls: 1, holders: 3, nearUsd: 3.12, lastHeight: tip },
  );

  // Re-applying an already indexed block is a no-op.
  const { applyBlock } = await import("./indexer.ts");
  applyBlock(db, cfg, chain.blocks[3]);
  assert.equal((await get<MarketListing[]>("/market/listings")).length, 1);
});

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { openDb } from "./db.ts";
import { FIXTURE_START, fixtureChain } from "./fixture.ts";
import { indexOnce } from "./indexer.ts";
import { staticPrices } from "./prices.ts";
import { DAY, fixtureSnapshots, takeSnapshot } from "./snapshots.ts";
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
  assert.ok(vaults.every((v) => v.change24h === null), "no snapshots yet");

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
  assert.ok(lb.every((r) => r.return === null));
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

async function replayed(now = Date.now()) {
  const db = openDb(":memory:");
  const chain = fixtureChain(config, now);
  await indexOnce(db, chain, { ...config, startHeight: FIXTURE_START });
  const app = createApp(db, async () => staticPrices());
  const get = async <T>(path: string) => {
    const res = await app.request(path);
    assert.equal(res.status, 200, path);
    return (await res.json()) as T;
  };
  return { db, get, now };
}

test("24h change and leaderboard return are price-only, from snapshots", async () => {
  const { db, get, now } = await replayed();
  const px = staticPrices();
  // ETH was half its price 25h ago and a week ago; nothing else moved.
  takeSnapshot(db, { ...px, teth: px.teth / 2 }, now - 8 * DAY);
  takeSnapshot(db, { ...px, teth: px.teth / 2 }, now - DAY - 3_600_000);
  takeSnapshot(db, px, now - 3_600_000);

  const byId = Object.fromEntries((await get<VaultSummary[]>("/vaults")).map((v) => [v.tokenId, v]));
  assert.equal(Math.round(byId["2"].change24h!), 100, "100% ETH basket doubled");
  assert.equal(byId["1"].change24h, 0, "stables did not move");
  // 0.1 ETH out of a $937.35 basket: 342 / (937.35 - 171) - 1
  assert.ok(Math.abs(byId["0"].change24h! - (937.35 / (937.35 - 171) - 1) * 100) < 1e-6, String(byId["0"].change24h));

  const lb = await get<LeaderboardRow[]>("/leaderboard?sort=return&period=7d");
  assert.deepEqual(lb.map((r) => [r.accountId, Math.round(r.return!)]), [[config.gachaId, 100], ["alice.testnet", 22], ["carol.testnet", 0]]);
  // 24h window: the closest snapshot at or before then is the half-price one too.
  assert.equal(Math.round((await get<LeaderboardRow[]>("/leaderboard?sort=return&period=24h"))[0].return!), 100);

  const d = await get<VaultDetail>("/vaults/2");
  assert.deepEqual(d.navHistory.map((p) => Math.round(p.navUsd)), [34, 34, 68, 68], "snapshots, then the live point");
});

test("fixture snapshots: hourly history ending at today's NAV", async () => {
  const { db, get, now } = await replayed();
  fixtureSnapshots(db, staticPrices(), now);
  const vaults = await get<VaultSummary[]>("/vaults");
  assert.ok(vaults.every((v) => typeof v.change24h === "number" && Number.isFinite(v.change24h)));
  assert.ok(Math.abs(vaults.find((v) => v.tokenId === "1")!.change24h!) < 1, "stables barely move");

  const d = await get<VaultDetail>("/vaults/0");
  const hist = d.navHistory;
  assert.ok(hist.length > 24, String(hist.length));
  assert.ok(hist.every((p, i) => i === 0 || hist[i - 1].at <= p.at));
  assert.ok(hist[0].at >= d.mintedAt, "nothing before the mint");
  assert.ok(Math.abs(hist.at(-2)!.navUsd - d.navUsd) < 1e-6, "last snapshot = live NAV");
  assert.ok((await get<LeaderboardRow[]>("/leaderboard?period=30d")).every((r) => typeof r.return === "number"));
});

/* ---------- xcheck X-1 / X-3 / X-5: synthetic blocks through applyBlock ---------- */

describe("xcheck fixes", async () => {
  const { applyBlock } = await import("./indexer.ts");
  const { priceOf, tokenInfo } = await import("./prices.ts");
  const NFT = config.collectionId;
  const USDC = config.ftIds.find((id) => id.startsWith("tusdc."))!;
  const FAKE = "tusdc.mallory.testnet";
  let height = 1;
  const ev = (standard: string, event: string, data: object) => `EVENT_JSON:${JSON.stringify({ standard, version: "1.0.0", event, data: [data] })}`;
  const block = (db: ReturnType<typeof openDb>, executorId: string, ...logs: string[]) =>
    applyBlock(db, config, { height: height++, timestamp: height * 1000, outcomes: [{ receiptId: `r${height}`, txHash: `t${height}`, executorId, logs }] });
  const fresh = () => {
    const db = openDb(":memory:");
    block(db, NFT, ev("torch", "vault_created", { token_id: "0", vault_id: `0.${NFT}`, owner_id: "alice.testnet", creator: "alice.testnet", extra: "{}" }));
    block(db, NFT, ev("nep171", "nft_mint", { owner_id: "alice.testnet", token_ids: ["0"] }));
    const app = createApp(db, async () => staticPrices());
    const get = async <T>(path: string) => (await (await app.request(path)).json()) as T;
    return { db, get };
  };

  test("X-1: only allow-listed token accounts are indexed or priced", async () => {
    const { db } = fresh();
    const vault = `0.${NFT}`;
    const fake = block(db, vault, ev("torch", "vault_deposit", { token_id: "0", ft_id: FAKE, amount: "1000000000000", sender_id: "mallory.testnet" }));
    const fakeOut = block(db, NFT, ev("torch", "vault_withdraw", { token_id: "0", ft_id: FAKE, amount: "1", owner_id: "alice.testnet" }));
    assert.deepEqual([fake.balances, fakeOut.balances], [[], []], "no balance refresh for an unknown token");
    const real = block(db, vault, ev("torch", "vault_deposit", { token_id: "0", ft_id: USDC, amount: "5", sender_id: "alice.testnet" }));
    assert.deepEqual(real.balances, [{ tokenId: "0", ftId: USDC }]);
    const px = staticPrices();
    assert.deepEqual([priceOf(px, FAKE), tokenInfo(FAKE).symbol], [0, FAKE], "a look-alike id is not priced as USDC");
    assert.deepEqual([priceOf(px, USDC), tokenInfo(USDC).symbol], [1, "USDC"]);
  });

  test("X-3: offer_cancel removes only the offer it refers to", async () => {
    const { db, get } = fresh();
    const offer = (created_at: number) => ev("torch", "offer", { token_id: "0", buyer_id: "bob.testnet", amount: "100", expires_at: Date.now() + DAY, created_at });
    const cancel = (data: object) => ev("torch", "offer_cancel", { token_id: "0", buyer_id: "bob.testnet", amount: "100", ...data });
    block(db, config.marketId, offer(2000));
    // The refund of an older in-flight offer (failed accept) must not delete the live one.
    block(db, config.marketId, cancel({ created_at: 1000 }));
    assert.deepEqual((await get<VaultDetail>("/vaults/0")).offers.map((o) => o.createdAt), [2000]);
    block(db, config.marketId, cancel({ created_at: 2000 }));
    assert.deepEqual((await get<VaultDetail>("/vaults/0")).offers, []);
    // Events without created_at (pre wave 2) still match on token + buyer.
    block(db, config.marketId, offer(3000));
    block(db, config.marketId, cancel({}));
    assert.deepEqual((await get<VaultDetail>("/vaults/0")).offers, []);
  });

  test("X-5: a reverted nft_transfer_call keeps the listing, a real transfer hides it", async () => {
    const { db, get } = fresh();
    block(db, config.marketId, ev("torch", "list", { token_id: "0", seller_id: "alice.testnet", price: "7" }));
    const transfer = (from: string, to: string) => ev("nep171", "nft_transfer", { old_owner_id: from, new_owner_id: to, token_ids: ["0"] });
    block(db, NFT, transfer("alice.testnet", "bob.testnet"));
    block(db, NFT, transfer("bob.testnet", "alice.testnet")); // nft_resolve_transfer handed it back
    assert.deepEqual((await get<MarketListing[]>("/market/listings")).map((l) => [l.sellerId, l.price]), [["alice.testnet", "7"]]);
    assert.equal((await get<Orderbook>("/market/orderbook/0")).ask?.price, "7");
    block(db, NFT, transfer("alice.testnet", "carol.testnet"));
    assert.deepEqual(await get<MarketListing[]>("/market/listings"), []);
    assert.equal((await get<Orderbook>("/market/orderbook/0")).ask, null);
    assert.equal((await get<Stats>("/stats")).listings, 0);
    assert.equal((await get<VaultSummary[]>("/vaults"))[0].listing, null);
  });
});

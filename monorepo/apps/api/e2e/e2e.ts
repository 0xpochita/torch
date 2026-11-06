// End-to-end: real contracts on a local near-sandbox -> indexer over RPC -> API responses.
//
//   pnpm --filter api e2e
//
// Builds the five wasm files with `cargo near` (SKIP_BUILD=1 reuses target/near), starts near-sandbox
// (NEAR_SANDBOX_BIN, else the binary `cargo test` in monorepo/contracts downloads), deploys mock FTs,
// the vault as a global contract by hash, collection, market and gacha, drives the user flows with
// near-api-js, indexes from the deploy height and asserts every endpoint reflects exactly those actions.
import assert from "node:assert/strict";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { existsSync, globSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Account, JsonRpcProvider, KeyPairSigner, actions, baseEncode, nearToYocto, teraToGas, type KeyPairString } from "near-api-js";
import { createApp } from "../src/app.ts";
import { config } from "../src/config.ts";
import { getCursor, openDb } from "../src/db.ts";
import { indexOnce, nearChain } from "../src/indexer.ts";
import { staticPrices } from "../src/prices.ts";
import type { ActivityItem, GachaPull, LeaderboardRow, MarketListing, Stats, VaultDetail, VaultSummary } from "../src/types.ts";

const CONTRACTS = resolve(import.meta.dirname, "../../../contracts");
// Free ports picked at start (other sandboxes, e.g. near-workspaces tests, may be running).
const freePort = () =>
  new Promise<number>((ok) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    });
  });
let RPC = "";
const NEAR = (n: number) => nearToYocto(n).toString();
const log = (...a: unknown[]) => console.log("·", ...a);

/* ---------- wasm + sandbox ---------- */

function wasm(krate: string): Uint8Array {
  if (process.env.SKIP_BUILD !== "1") execFileSync("cargo", ["near", "build", "non-reproducible-wasm", "--no-abi"], { cwd: join(CONTRACTS, krate), stdio: "ignore" });
  const name = krate.replace("-", "_");
  return readFileSync(join(CONTRACTS, "target/near", name, `${name}.wasm`));
}

function sandboxBin() {
  const bin = process.env.NEAR_SANDBOX_BIN ?? globSync(join(CONTRACTS, "target/debug/build/near-sandbox-*/out/.near/near-sandbox-*/near-sandbox"))[0];
  if (!bin || !existsSync(bin)) throw new Error("near-sandbox not found: set NEAR_SANDBOX_BIN, or run `cargo test -p collection --test sandbox` in monorepo/contracts once");
  return bin;
}

async function startSandbox(): Promise<{ proc: ChildProcess; home: string; key: KeyPairString }> {
  const bin = sandboxBin();
  const home = mkdtempSync(join(tmpdir(), "torch-e2e-"));
  const [rpcPort, netPort] = [Number(process.env.SANDBOX_RPC_PORT) || (await freePort()), await freePort()];
  RPC = `http://127.0.0.1:${rpcPort}`;
  execFileSync(bin, ["--home", home, "init"], { stdio: "ignore" });
  const proc = spawn(bin, ["--home", home, "run", "--archive", "--rpc-addr", `127.0.0.1:${rpcPort}`, "--network-addr", `127.0.0.1:${netPort}`], { stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    const ok = await fetch(`${RPC}/status`).then((r) => r.ok, () => false);
    if (ok) break;
    if (proc.exitCode !== null) throw new Error(`near-sandbox exited with ${proc.exitCode} (port ${rpcPort} busy?)`);
    await new Promise((r) => setTimeout(r, 500));
  }
  const key = JSON.parse(readFileSync(join(home, "validator_key.json"), "utf8")).secret_key as KeyPairString;
  return { proc, home, key };
}

/* ---------- chain helpers ---------- */

async function main() {
  log("building wasm:", process.env.SKIP_BUILD === "1" ? "skipped (SKIP_BUILD=1)" : "cargo near build ×5");
  const code = Object.fromEntries(["vault", "collection", "mock-ft", "market", "gacha"].map((k) => [k, wasm(k)]));

  const sb = await startSandbox();
  log(`sandbox up on ${RPC} (home ${sb.home})`);
  try {
    await run(sb.key, code);
  } finally {
    sb.proc.kill("SIGTERM");
    await new Promise((r) => sb.proc.once("exit", r));
    rmSync(sb.home, { recursive: true, force: true });
    log("sandbox stopped");
  }
}

async function run(rootKey: KeyPairString, code: Record<string, Uint8Array>) {
  const provider = new JsonRpcProvider({ url: RPC });
  const signer = KeyPairSigner.fromSecretKey(rootKey);
  const pub = await signer.getPublicKey();
  const root = new Account("test.near", provider, signer);
  const id = (name: string) => `${name}.test.near`;

  // Every account shares the root key; nonces are per (account, key) so that is fine.
  async function create(name: string, near: number, wasmCode?: Uint8Array) {
    const acts = [actions.createAccount(), actions.transfer(nearToYocto(near)), actions.addFullAccessKey(pub)];
    if (wasmCode) acts.push(actions.deployContract(wasmCode));
    await root.signAndSendTransaction({ receiverId: id(name), actions: acts });
    return new Account(id(name), provider, signer);
  }
  const call = async (from: Account, contractId: string, methodName: string, args: Record<string, unknown>, deposit = "0", gas = 100) => {
    const res = await from.callFunctionRaw({ contractId, methodName, args, deposit: BigInt(deposit), gas: teraToGas(gas) });
    return res;
  };
  const view = <T>(contractId: string, method: string, args: Record<string, unknown>) => provider.callFunction({ contractId, method, args }) as Promise<T>;

  // Vault code is published once, by hash (immutable, I1).
  await root.signAndSendTransaction({ receiverId: root.accountId, actions: [actions.deployGlobalContract(code.vault, "codeHash")] });
  const vaultHash = baseEncode(createHash("sha256").update(code.vault).digest());
  log("vault published as global contract", vaultHash);

  const fts = { tusdc: 6, teth: 18, tbtc: 8 } as const;
  for (const [t, decimals] of Object.entries(fts)) {
    await create(t, 5, code["mock-ft"]);
    await call(root, id(t), "new", { owner_id: root.accountId, metadata: { spec: "ft-1.0.0", name: `Test ${t}`, symbol: t.slice(1).toUpperCase(), decimals } });
  }
  const NFT = id("nft"), MARKET = id("market"), GACHA = id("gacha"), USDC = id("tusdc"), ETH = id("teth");
  await create("nft", 20, code.collection);
  await call(root, NFT, "new", { owner_id: root.accountId, vault_code_hash: vaultHash, metadata: { spec: "nft-1.0.0", name: "Torch", symbol: "TORCH" } });
  await create("market", 5, code.market);
  await call(root, MARKET, "new", { collection_id: NFT, fee_receiver_id: root.accountId });
  const basket = { name: "E2E Pull", category: "Stable", bg: "#b8f0d8", items: [{ token: USDC, amount: "5000000" }] };
  await create("gacha", 10, code.gacha);
  await call(root, GACHA, "new", {
    owner_id: root.accountId, collection_id: NFT, price_per_pull: NEAR(0.1), pity: 50,
    tiers: [["Common", 6000], ["Rare", 2800], ["Epic", 1000], ["Legendary", 200]].map(([rarity, weight_bps]) => ({ rarity, weight_bps, baskets: [basket] })),
  });
  const [alice, bob, carol] = await Promise.all(["alice", "bob", "carol"].map((n) => create(n, 20)));
  log("deployed: 3 mock FTs, collection, market, gacha; users alice, bob, carol");

  // The indexer starts here: everything above is setup, everything below must show up in the API.
  const startHeight = (await provider.viewBlock({ finality: "final" })).header.height + 1;
  const reg = (ft: string, who: string) => call(root, ft, "storage_deposit", { account_id: who, registration_only: true }, NEAR(0.00125), 30);
  for (const ft of [USDC, ETH]) await reg(ft, alice.accountId);
  await call(root, USDC, "mint", { account_id: alice.accountId, amount: "1000000000" }); // 1000 USDC
  await call(root, ETH, "mint", { account_id: alice.accountId, amount: "1000000000000000000" }); // 1 ETH = 10^18

  // 1. alice mints a vault. She claims "Legendary" rarity, which the indexer must ignore (not a gacha mint).
  const extra = { basket: [{ token: USDC, weight: 60 }, { token: ETH, weight: 40 }], bg: "#9fd3ff", category: "Blue Chip", creator: alice.accountId, rarity: "Legendary" };
  const mint = await call(alice, NFT, "mint", { metadata: { title: "E2E Blue", extra: JSON.stringify(extra) }, receiver_id: null }, NEAR(0.11), 150);
  const mintResult = Buffer.from((mint.status as { SuccessValue?: string }).SuccessValue ?? "", "base64").toString();
  const vault0 = await view<string>(NFT, "vault_of", { token_id: "0" });
  log(`1. alice minted token 0 (mint resolved to ${mintResult}), vault ${vault0}`);

  // 2. fund it: register the vault on each FT, then ft_transfer_call
  for (const [ft, amount] of [[USDC, "600000000"], [ETH, "100000000000000000"]]) {
    await call(alice, ft, "storage_deposit", { account_id: vault0, registration_only: true }, NEAR(0.00125), 30);
    await call(alice, ft, "ft_transfer_call", { receiver_id: vault0, amount, msg: "" }, "1", 100);
  }
  log("2. alice deposited 600 USDC + 0.1 ETH");

  // 3. withdraw 100 USDC
  await call(alice, NFT, "withdraw", { token_id: "0", ft_id: USDC, amount: "100000000" }, "1", 100);
  log("3. alice withdrew 100 USDC");

  // 4. list for 2 NEAR, bob buys
  await call(alice, NFT, "nft_approve", { token_id: "0", account_id: MARKET, msg: JSON.stringify({ list: { price: NEAR(2) } }) }, NEAR(0.01), 100);
  await call(bob, MARKET, "buy", { token_id: "0" }, NEAR(2), 200);
  log("4. alice listed at 2 NEAR, bob bought");

  // 5. carol offers 1.5 NEAR pinned to the current vault balances (wave 2 market), bob accepts in one approve
  const storage = await view<string>(MARKET, "offer_storage_cost", {});
  const minBalances = [{ ft_id: USDC, amount: "500000000" }, { ft_id: ETH, amount: "100000000000000000" }];
  await call(carol, MARKET, "offer", { token_id: "0", amount: NEAR(1.5), expires_at: Date.now() + 86_400_000, min_balances: minBalances }, (BigInt(NEAR(1.5)) + BigInt(storage)).toString(), 30);
  const offerCreatedAt = (await view<{ created_at: number }[]>(MARKET, "get_offers", { token_id: "0" }))[0].created_at;
  await call(bob, NFT, "nft_approve", { token_id: "0", account_id: MARKET, msg: JSON.stringify({ accept_offer: { buyer_id: carol.accountId, amount: NEAR(1.5) } }) }, NEAR(0.01), 250);
  log(`5. carol offered 1.5 NEAR (+${storage} yocto offer storage, min_balances pinned), bob accepted`);

  // 6. gacha: owner funds the treasury, bob pulls once
  await reg(USDC, GACHA);
  await reg(USDC, root.accountId);
  await call(root, USDC, "mint", { account_id: root.accountId, amount: "100000000" });
  await call(root, USDC, "ft_transfer_call", { receiver_id: GACHA, amount: "50000000", msg: "fund" }, "1", 100);
  await call(bob, GACHA, "pull", { count: 1 }, NEAR(0.1), 300);
  const pity = await view<number>(GACHA, "get_pity", { account_id: bob.accountId });
  log(`6. bob pulled once (pity now ${pity})`);

  /* ---------- index from startHeight over RPC only ---------- */

  const tip = (await provider.viewBlock({ finality: "final" })).header.height;
  const cfg = { ...config, collectionId: NFT, marketId: MARKET, gachaId: GACHA, ftIds: [USDC, ETH, id("tbtc")], rpcUrl: RPC, neardataUrl: "", startHeight };
  const db = openDb(":memory:");
  const chain = nearChain(cfg);
  const t0 = Date.now();
  while ((getCursor(db) ?? 0) < tip) await indexOnce(db, chain, cfg, 1000);
  log(`indexed blocks ${startHeight}..${getCursor(db)} over RPC in ${Date.now() - t0} ms`);

  const app = createApp(db, async () => staticPrices());
  const get = async <T>(path: string) => {
    const res = await app.request(path);
    assert.equal(res.status, 200, path);
    return (await res.json()) as T;
  };

  /* ---------- assertions ---------- */

  const tokenOne = await view<{ owner_id: string } | null>(NFT, "nft_token", { token_id: "1" });
  const pulls = await get<GachaPull[]>("/gacha/recent");
  // Wave 1 collection: mint resolves to `true`, the gacha cannot parse a token id, refunds and logs no gacha_pull
  // (the NFT is still minted, unfunded). Wave 2 (Option<TokenId>) resolves to "1": funded + gacha_pull.
  const gachaWorks = pulls.length === 1;
  log(`gacha: collection mint resolved to ${mintResult}; token 1 ${tokenOne ? `owned by ${tokenOne.owner_id}` : "absent"}; gacha_pull ${gachaWorks ? "indexed" : "not emitted"}`);

  const vaults = await get<VaultSummary[]>("/vaults");
  const v0 = vaults.find((v) => v.tokenId === "0")!;
  assert.ok(v0, "vault 0 indexed");
  assert.deepEqual(
    { owner: v0.ownerId, creator: v0.creator, title: v0.title, category: v0.category, rarity: v0.rarity, listing: v0.listing, vaultId: v0.vaultId },
    { owner: carol.accountId, creator: alice.accountId, title: "E2E Blue", category: "Blue Chip", rarity: null, listing: null, vaultId: vault0 },
  );
  assert.deepEqual(v0.basket, extra.basket);
  assert.equal(Math.round(v0.navUsd * 100) / 100, 500 + 0.1 * 3420, "500 USDC + 0.1 ETH");
  assert.equal(vaults.length, tokenOne ? 2 : 1);
  if (tokenOne) {
    const v1 = vaults.find((v) => v.tokenId === "1")!;
    assert.deepEqual([v1.ownerId, v1.creator, v1.category], [bob.accountId, GACHA, "Stable"]);
    assert.ok(v1.rarity && ["Common", "Rare", "Epic", "Legendary"].includes(v1.rarity), "gacha rarity is trusted");
    assert.equal(v1.navUsd, gachaWorks ? 5 : 0);
  }

  const d = await get<VaultDetail>("/vaults/0");
  assert.deepEqual(d.holders.map((h) => h.accountId), [alice.accountId, bob.accountId, carol.accountId]);
  assert.deepEqual(d.balances.map((b) => [b.ftId, b.amount]), [[ETH, "100000000000000000"], [USDC, "500000000"]]);
  assert.deepEqual(d.sales.map((s) => [s.sellerId, s.buyerId, s.price]), [[bob.accountId, carol.accountId, NEAR(1.5)], [alice.accountId, bob.accountId, NEAR(2)]]);
  assert.deepEqual(d.offers, []);
  assert.deepEqual(d.navHistory.map((p) => Math.round(p.navUsd)), [0, 600, 942, 842, 842]);

  assert.deepEqual(await get<MarketListing[]>("/market/listings"), []);

  const act = await get<ActivityItem[]>("/activity?token=0");
  const count = (xs: ActivityItem[]) => xs.reduce<Record<string, number>>((m, a) => ((m[a.event] = (m[a.event] ?? 0) + 1), m), {});
  assert.deepEqual(count(act), { vault_created: 1, nft_mint: 1, vault_deposit: 2, vault_withdraw: 1, list: 1, sale: 1, nft_transfer: 2, offer: 1, offer_accept: 1 });
  assert.ok(act.every((a, i) => i === 0 || act[i - 1].at >= a.at), "newest first");
  assert.ok(act.every((a) => a.txHash), "every event carries its tx hash");
  const offerEv = act.find((a) => a.event === "offer")!.data;
  assert.deepEqual([offerEv.created_at, offerEv.min_balances], [offerCreatedAt, minBalances], "wave 2 offer fields indexed");
  assert.equal(act.find((a) => a.event === "offer_accept")!.data.created_at, offerCreatedAt);
  const all = await get<ActivityItem[]>("/activity?limit=500");
  assert.equal(all.filter((a) => a.event === "gacha_pull").length, gachaWorks ? 1 : 0);

  const lb = await get<LeaderboardRow[]>("/leaderboard?sort=volume");
  const aliceRow = lb.find((r) => r.accountId === alice.accountId)!;
  assert.deepEqual([aliceRow.rank, aliceRow.vaults, aliceRow.sales, aliceRow.volume, aliceRow.holders], [1, 1, 2, NEAR(3.5), 3]);
  if (tokenOne) assert.deepEqual(lb.find((r) => r.accountId === GACHA)?.vaults, 1);

  if (gachaWorks) assert.deepEqual([pulls[0].playerId, pulls[0].tokenId, pulls[0].price], [bob.accountId, "1", NEAR(0.1)]);

  const stats = await get<Stats>("/stats");
  assert.deepEqual(
    { vaults: stats.vaults, listings: stats.listings, offers: stats.offers, sales: stats.sales, volume: stats.volume, pulls: stats.pulls, holders: stats.holders },
    { vaults: tokenOne ? 2 : 1, listings: 0, offers: 0, sales: 2, volume: NEAR(3.5), pulls: gachaWorks ? 1 : 0, holders: tokenOne ? 2 : 1 },
  );
  assert.equal(stats.lastHeight, getCursor(db));

  log(`/vaults ${vaults.length} · /activity token 0: ${act.length} events · /leaderboard ${lb.length} rows · /gacha/recent ${pulls.length} · /stats ok`);
  console.log(`\nE2E PASSED${gachaWorks ? "" : " (gacha: wave-1 collection mint returns bool; pull minted token 1 unfunded, no gacha_pull)"}`);
}

main().catch((e) => {
  console.error("\nE2E FAILED:", e);
  process.exitCode = 1;
});

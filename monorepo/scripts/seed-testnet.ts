// Seed the testnet deploy so the app is not empty: 6 template vaults (apps/web lib/mock.ts ETFS)
// from up to 3 creators, funded via faucet + ft_transfer_call, 4 listed on the market, 2 offers,
// and one gacha 10-pull (so /gacha/recent has rows).
// Idempotent and resumable: vaults are found by (title, seed creator), and every step checks chain
// state first, so a re-run only does what is still missing.
//
//   SEED_CREATORS="alice.testnet:ed25519:...,bob.testnet,carol.testnet" pnpm seed
//   SEED_CREATORS=... pnpm seed --check           # read chain state, print what is missing, send nothing
//   DRY_RUN=1 SEED_CREATORS=a.testnet,b.testnet pnpm seed   # print the full plan, no network at all
//
// A creator without ":<key>" signs with ~/.near-credentials/<network>/<id>.json.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { Account, JsonRpcProvider, actions, nearToYocto, teraToGas, type KeyPairString } from "near-api-js";
import { ETFS, type Etf, type TokenKey } from "../apps/web/src/lib/mock.ts";

const env = process.env;
const DRY_RUN = env.DRY_RUN === "1";
const CHECK = process.argv.includes("--check");
/** Chain reads happen in a real run and in --check; a dry run touches no network. */
const READ = !DRY_RUN;
const NETWORK = env.NEAR_NETWORK ?? "testnet";
const ROOT = env.NEAR_ROOT_ID ?? "torchvault.testnet";
const NFT = env.NEAR_COLLECTION_ID ?? `nft.${ROOT}`;
const MARKET = env.NEAR_MARKET_ID ?? `market.${ROOT}`;
const GACHA = env.NEAR_GACHA_ID ?? `gacha.${ROOT}`;
const WRAP = env.NEAR_WRAP_ID ?? "wrap.testnet";
const provider = new JsonRpcProvider({ url: env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });

const STORAGE = nearToYocto("0.00125");
const ONE_YOCTO = 1n;
const GAS = teraToGas("100");
// INTERFACES Wave 1 deltas: a 10-pull of 3-item baskets needs the full 1 PGas per tx.
const GAS_PULL = teraToGas("1000");
const WEEK_MS = 7 * 86_400_000;
// Testnet scale: list at mock priceNear / 1000 (610 -> 0.61 NEAR), offer at half of that.
const listPrice = (e: Etf) => nearToYocto(Number((e.priceNear / 1000).toFixed(3)));
const offerPrice = (e: Etf) => nearToYocto(Number((e.priceNear / 2000).toFixed(3)));

/** mock.ts token key -> testnet FT account and decimals. */
function ft(key: TokenKey): { id: string; decimals: number } {
  if (key === "NEAR") return { id: WRAP, decimals: 24 };
  const decimals = key === "USDC" || key === "USDT" ? 6 : key === "BTC" ? 8 : 18;
  return { id: `t${key.toLowerCase()}.${ROOT}`, decimals };
}
/** Each item gets weight% of one faucet drip (0.1 token); two vaults of a creator never exceed 100%. */
const itemAmount = (key: TokenKey, weight: number) =>
  (10n ** BigInt(ft(key).decimals - 1) * BigInt(weight)) / 100n;

const creators: Account[] = (env.SEED_CREATORS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .slice(0, 3)
  .map((entry) => {
    const [id, ...key] = entry.split(":");
    if (DRY_RUN || CHECK) return new Account(id, provider);
    const secret = key.length
      ? key.join(":")
      : JSON.parse(readFileSync(`${homedir()}/.near-credentials/${NETWORK}/${id}.json`, "utf8")).private_key;
    return new Account(id, provider, secret as KeyPairString);
  });
if (!creators.length) throw new Error("set SEED_CREATORS=<account>[:<ed25519 key>],... (1 to 3 accounts)");

const view = async <T>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> =>
  provider.callFunction({ contractId, method, args }) as Promise<T>;

type Call = { method: string; args: Record<string, unknown>; deposit: bigint; gas?: bigint };
let pending = 0;
/** One transaction to `receiverId` with one or more function calls. Sent only in a real run;
 * --check reports it as missing, DRY_RUN prints it as part of the plan. */
async function send(from: Account, receiverId: string, calls: Call[]) {
  pending++;
  for (const c of calls) {
    const line = `${from.accountId} -> ${receiverId}.${c.method}(${JSON.stringify(c.args)}) deposit=${c.deposit}`;
    console.log(CHECK ? `  missing: ${line}` : `+ ${line}`);
  }
  if (DRY_RUN || CHECK) return;
  await from.signAndSendTransaction({
    receiverId,
    actions: calls.map((c) => actions.functionCall(c.method, c.args, c.gas ?? GAS, c.deposit)),
  });
}
const vaultOf = (tokenId: string) => `${tokenId}.${NFT}`;
/** False for a placeholder id (vault not minted yet): its state cannot be read, so all of it is missing. */
const known = (tokenId: string) => READ && !tokenId.startsWith("<");

type Token = { token_id: string; owner_id: string; metadata: { title: string | null; extra: string | null } };
async function allTokens(): Promise<Token[]> {
  const out: Token[] = [];
  for (let from = 0; ; from += 100) {
    const page = await view<Token[]>(NFT, "nft_tokens", { from_index: String(from), limit: 100 });
    out.push(...page);
    if (page.length < 100) return out;
  }
}
const creatorOf = (t: Token): string | undefined => JSON.parse(t.metadata.extra ?? "{}").creator;

/** The seed vault titled `title`, minted by any seed creator (so reordering SEED_CREATORS does not re-mint). */
async function findVault(title: string): Promise<{ tokenId: string; creator: Account } | undefined> {
  if (!READ) return undefined;
  for (const t of await allTokens()) {
    const creator = creators.find((c) => c.accountId === creatorOf(t));
    if (t.metadata.title === title && creator) return { tokenId: t.token_id, creator };
  }
}

async function mint(e: Etf, creator: Account): Promise<{ tokenId: string; creator: Account }> {
  const existing = await findVault(e.name);
  if (existing) {
    console.log(`  skip mint: ${e.name} is token ${existing.tokenId} by ${existing.creator.accountId}`);
    return existing;
  }
  const extra = {
    basket: e.allocation.map((a) => ({ token: ft(a.token).id, weight: a.weight })),
    bg: e.bg,
    category: e.category,
    creator: creator.accountId, // the collection overwrites this with the caller
    rarity: null,
  };
  await send(creator, NFT, [
    {
      method: "mint",
      args: {
        metadata: { title: e.name, description: `${e.category} basket (demo seed)`, extra: JSON.stringify(extra) },
        receiver_id: null,
      },
      deposit: nearToYocto("0.11"),
    },
  ]);
  if (DRY_RUN || CHECK) return { tokenId: `<token id of ${e.name}>`, creator };
  // The mint callback's return type changed between waves, so look the id up instead of parsing it.
  const minted = await findVault(e.name);
  if (!minted) throw new Error(`mint of ${e.name} did not produce a token (check the tx; deposit is refunded)`);
  return minted;
}

/** Get `amount` of the token into the creator's wallet: faucet for mocks, near_deposit for wNEAR. */
async function topUp(creator: Account, key: TokenKey, amount: bigint): Promise<boolean> {
  const { id } = ft(key);
  if (READ) {
    const balance = BigInt(await view<string>(id, "ft_balance_of", { account_id: creator.accountId }));
    if (balance >= amount) return true;
  }
  if (key === "NEAR") {
    const registered = READ && (await view(id, "storage_balance_of", { account_id: creator.accountId })) !== null;
    await send(creator, id, [
      ...(registered ? [] : [{ method: "storage_deposit", args: {}, deposit: STORAGE }]),
      { method: "near_deposit", args: {}, deposit: amount },
    ]);
    return true;
  }
  if (READ && (await view<number>(id, "faucet_next_at", { account_id: creator.accountId })) > 0) {
    console.log(`  wait: ${creator.accountId} already used the ${id} faucet this hour; re-run later`);
    pending++;
    return false;
  }
  await send(creator, id, [{ method: "faucet", args: {}, deposit: STORAGE }]);
  return true;
}

async function fund(e: Etf, creator: Account, tokenId: string) {
  const vault = vaultOf(tokenId);
  for (const { token, weight } of e.allocation) {
    const { id } = ft(token);
    const amount = itemAmount(token, weight);
    if (known(tokenId) && BigInt(await view<string>(id, "ft_balance_of", { account_id: vault })) > 0n) {
      console.log(`  skip fund: ${vault} holds ${id}`);
      continue;
    }
    if (!(await topUp(creator, token, amount))) continue;
    const registered = known(tokenId) && (await view(id, "storage_balance_of", { account_id: vault })) !== null;
    await send(creator, id, [
      ...(registered ? [] : [{ method: "storage_deposit", args: { account_id: vault }, deposit: STORAGE }]),
      { method: "ft_transfer_call", args: { receiver_id: vault, amount: String(amount), msg: "" }, deposit: ONE_YOCTO },
    ]);
  }
}

async function list(e: Etf, creator: Account, tokenId: string) {
  if (known(tokenId) && (await view(MARKET, "get_listing", { token_id: tokenId })) !== null) {
    console.log(`  skip list: ${e.name} (${tokenId}) already listed`);
    return;
  }
  const msg = JSON.stringify({ list: { price: String(listPrice(e)) } });
  await send(creator, NFT, [
    { method: "nft_approve", args: { token_id: tokenId, account_id: MARKET, msg }, deposit: nearToYocto("0.01") },
  ]);
}

async function offer(e: Etf, buyer: Account, tokenId: string) {
  if (known(tokenId)) {
    const offers = await view<{ buyer_id: string }[]>(MARKET, "get_offers", { token_id: tokenId });
    if (offers.some((o) => o.buyer_id === buyer.accountId)) {
      console.log(`  skip offer: ${buyer.accountId} already bid on ${e.name} (${tokenId})`);
      return;
    }
  }
  await send(buyer, MARKET, [
    { method: "offer", args: { token_id: tokenId, expires_at: Date.now() + WEEK_MS }, deposit: offerPrice(e) },
  ]);
}

/** One 10-pull, skipped once the player owns any vault the gacha minted. */
async function gacha(player: Account) {
  if (READ) {
    const won = (await allTokens()).filter((t) => t.owner_id === player.accountId && creatorOf(t) === GACHA);
    if (won.length) {
      console.log(`  skip pull: ${player.accountId} already owns ${won.length} gacha vault(s)`);
      return;
    }
  }
  await send(player, GACHA, [{ method: "pull", args: { count: 10 }, deposit: nearToYocto("0.9"), gas: GAS_PULL }]);
}

const mode = DRY_RUN ? " (DRY_RUN: plan only, no network)" : CHECK ? " (--check: read-only)" : "";
console.log(`seed ${NETWORK}${mode}: ${creators.map((c) => c.accountId).join(", ")}`);
if (READ) {
  for (const id of [NFT, MARKET, GACHA, ...creators.map((c) => c.accountId)]) {
    await provider.viewAccount({ accountId: id }).catch(() => {
      console.error(`${id} does not exist on ${NETWORK}: run scripts/deploy-testnet.sh / fund the creators first`);
      process.exit(1);
    });
  }
}
const minted: { e: Etf; creator: Account; tokenId: string }[] = [];
for (const [i, e] of ETFS.entries()) {
  console.log(`\n== ${e.name} (${e.category})`);
  const { tokenId, creator } = await mint(e, creators[i % creators.length]);
  await fund(e, creator, tokenId);
  minted.push({ e, creator, tokenId });
}

console.log("\n== market: list the 4 templates mock.ts marks as listed");
for (const { e, creator, tokenId } of minted.filter((m) => m.e.listed).slice(0, 4)) await list(e, creator, tokenId);

console.log("\n== market: 2 offers on unlisted vaults from another creator");
for (const { e, creator, tokenId } of minted.filter((m) => !m.e.listed).slice(0, 2)) {
  const buyer = creators.find((c) => c !== creator);
  if (!buyer) {
    console.log(`  skip offer on ${e.name}: needs a second creator account`);
    continue;
  }
  await offer(e, buyer, tokenId);
}

console.log(`\n== gacha: one 10-pull by ${creators[0].accountId}`);
await gacha(creators[0]);

if (CHECK) console.log(pending ? `\n${pending} step(s) missing; run without --check to do them.` : "\nall seeded.");

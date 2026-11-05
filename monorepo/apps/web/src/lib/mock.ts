// Mock data until the collection + vault contracts are live.
// Token logos: CoinGecko (HOT from HOT Labs, it is not listed there).

export type Token = { symbol: string; name: string; color: string; price: number; logo: string };

export const TOKENS = {
  NEAR: { symbol: "NEAR", name: "NEAR Protocol", color: "#00ec97", price: 3.12, logo: "/tokens/near.png" },
  USDC: { symbol: "USDC", name: "USD Coin", color: "#2775ca", price: 1, logo: "/tokens/usdc.png" },
  USDT: { symbol: "USDT", name: "Tether", color: "#26a17b", price: 1, logo: "/tokens/usdt.png" },
  BTC: { symbol: "nBTC", name: "Bitcoin (omni)", color: "#f7931a", price: 98450, logo: "/tokens/btc.png" },
  ETH: { symbol: "ETH", name: "Ether (omni)", color: "#8c8cf0", price: 3420, logo: "/tokens/eth.png" },
  ZEC: { symbol: "ZEC", name: "Zcash (omni)", color: "#f4b728", price: 61.4, logo: "/tokens/zec.png" },
  HOT: { symbol: "HOT", name: "HOT Protocol", color: "#ff6b2c", price: 1.94, logo: "/tokens/hot.png" },
  RHEA: { symbol: "RHEA", name: "RHEA Finance", color: "#7ee0c6", price: 0.21, logo: "/tokens/rhea.png" },
  LINEAR: { symbol: "LiNEAR", name: "LiNEAR staked NEAR", color: "#6dd5ff", price: 3.58, logo: "/tokens/linear.png" },
  STNEAR: { symbol: "stNEAR", name: "Meta Pool stNEAR", color: "#c9a7ff", price: 3.66, logo: "/tokens/stnear.png" },
  AURORA: { symbol: "AURORA", name: "Aurora", color: "#78d64b", price: 0.12, logo: "/tokens/aurora.png" },
  NPRO: { symbol: "NPRO", name: "NEAR Mobile", color: "#4f7cff", price: 0.64, logo: "/tokens/npro.png" },
  DRAGON: { symbol: "BLACKDRAGON", name: "Black Dragon", color: "#9b5cff", price: 0.0000021, logo: "/tokens/blackdragon.png" },
  SHITZU: { symbol: "SHITZU", name: "Shitzu", color: "#ff9f6b", price: 0.0011, logo: "/tokens/shitzu.png" },
  SWEAT: { symbol: "SWEAT", name: "Sweat Economy", color: "#ff4fa3", price: 0.0042, logo: "/tokens/sweat.png" },
} satisfies Record<string, Token>;

export type TokenKey = keyof typeof TOKENS;

export const CATEGORIES = ["Blue Chip", "Stable", "DeFi", "Meme", "Chain Abstraction", "Liquid Staking"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Allocation = { token: TokenKey; weight: number };
export type HistoryEvent = {
  type: "mint" | "deposit" | "rebalance" | "withdraw" | "transfer";
  at: string;
  detail: string;
  account: string;
};

export type Etf = {
  id: string;
  name: string;
  image: string;
  bg: string;
  category: Category;
  creator: string;
  owner: string;
  likes: number;
  navUsd: number;
  change24h: number;
  priceNear: number;
  listed: boolean;
  rebalance: "Daily" | "Weekly" | "Monthly";
  slippageBps: number;
  allocation: Allocation[];
  nav30d: number[];
  history: HistoryEvent[];
};

// Deterministic pseudo-random walk so server and client render the same chart.
function walk(seed: number, start: number, drift: number): number[] {
  let x = seed;
  const out = [start];
  for (let i = 1; i < 30; i++) {
    x = (x * 9301 + 49297) % 233280;
    const r = x / 233280 - 0.5;
    out.push(Math.max(1, out[i - 1] * (1 + drift + r * 0.06)));
  }
  return out;
}

const TODAY = Date.UTC(2026, 10, 5);
const day = (offset: number) => new Date(TODAY + offset * 86_400_000).toISOString().slice(0, 10);

function etf(e: Omit<Etf, "nav30d" | "history"> & { seed: number; drift: number }): Etf {
  const { seed, drift, ...rest } = e;
  const n = Number(rest.id);
  const raw = walk(seed, 100, drift);
  const nav30d = raw.map((v) => (v / raw[raw.length - 1]) * rest.navUsd); // ends exactly at today's NAV
  return {
    ...rest,
    nav30d,
    // Staggered per vault so the activity feed mixes event types.
    history: [
      { type: "mint", at: day(-30 + n), detail: `Vault ${rest.id}.torch.near created`, account: rest.creator },
      { type: "deposit", at: day(-30 + n), detail: `Deposited ${(rest.navUsd * 0.8).toFixed(0)} USDC, swapped to basket`, account: rest.creator },
      { type: "rebalance", at: day(-16 + n), detail: "Rebalanced to target weights (drift 4.1%)", account: "keeper.torch.near" },
      { type: "transfer", at: day(-9 + n), detail: `Sold for ${rest.priceNear} NEAR`, account: rest.owner },
      ...(n % 2 ? [{ type: "withdraw" as const, at: day(-6 + n), detail: "Withdrew 40 USDC to owner", account: rest.owner }] : []),
      { type: n % 3 ? ("deposit" as const) : ("rebalance" as const), at: day(-n), detail: n % 3 ? "Topped up 120 USDC" : "Rebalanced to target weights (drift 2.7%)", account: n % 3 ? rest.owner : "keeper.torch.near" },
    ],
  };
}

export const ETFS: Etf[] = [
  etf({ id: "0", name: "NEAR Blue Chip", image: "/nfts/blue-chip.png", bg: "#9fd3ff", category: "Blue Chip", creator: "alice.near", owner: "bob.near", likes: 214, navUsd: 1840, change24h: 2.4, priceNear: 610, listed: true, rebalance: "Weekly", slippageBps: 50, seed: 11, drift: 0.004,
    allocation: [{ token: "NEAR", weight: 40 }, { token: "BTC", weight: 30 }, { token: "ETH", weight: 20 }, { token: "USDC", weight: 10 }] }),
  etf({ id: "1", name: "Stable Harbor", image: "/nfts/stable.png", bg: "#b8f0d8", category: "Stable", creator: "carol.near", owner: "carol.near", likes: 98, navUsd: 5020, change24h: 0.1, priceNear: 1620, listed: false, rebalance: "Monthly", slippageBps: 10, seed: 23, drift: 0.0003,
    allocation: [{ token: "USDC", weight: 50 }, { token: "USDT", weight: 30 }, { token: "STNEAR", weight: 20 }] }),
  etf({ id: "2", name: "DeFi Engine", image: "/nfts/defi.png", bg: "#ffd8a8", category: "DeFi", creator: "dave.near", owner: "bob.near", likes: 167, navUsd: 920, change24h: -1.8, priceNear: 300, listed: true, rebalance: "Weekly", slippageBps: 100, seed: 37, drift: 0.002,
    allocation: [{ token: "RHEA", weight: 35 }, { token: "LINEAR", weight: 25 }, { token: "AURORA", weight: 20 }, { token: "NEAR", weight: 20 }] }),
  etf({ id: "3", name: "Meme Lab", image: "/nfts/meme.png", bg: "#e5c8ff", category: "Meme", creator: "frank.near", owner: "frank.near", likes: 402, navUsd: 310, change24h: 12.7, priceNear: 140, listed: true, rebalance: "Daily", slippageBps: 300, seed: 41, drift: 0.01,
    allocation: [{ token: "DRAGON", weight: 40 }, { token: "SHITZU", weight: 35 }, { token: "SWEAT", weight: 25 }] }),
  etf({ id: "4", name: "Omni Hot", image: "/nfts/omni.png", bg: "#ffc2a8", category: "Chain Abstraction", creator: "grace.near", owner: "heidi.near", likes: 256, navUsd: 1330, change24h: 4.9, priceNear: 455, listed: true, rebalance: "Weekly", slippageBps: 80, seed: 53, drift: 0.005,
    allocation: [{ token: "HOT", weight: 35 }, { token: "NEAR", weight: 25 }, { token: "ZEC", weight: 20 }, { token: "BTC", weight: 20 }] }),
  etf({ id: "5", name: "Staked Garden", image: "/nfts/staking.png", bg: "#c5f5b0", category: "Liquid Staking", creator: "ivan.near", owner: "bob.near", likes: 131, navUsd: 2260, change24h: 1.2, priceNear: 730, listed: false, rebalance: "Monthly", slippageBps: 30, seed: 67, drift: 0.002,
    allocation: [{ token: "LINEAR", weight: 40 }, { token: "STNEAR", weight: 40 }, { token: "NPRO", weight: 20 }] }),
];

export const getEtf = (id: string) => ETFS.find((e) => e.id === id);

/** The mock connected wallet. */
export const ME = "bob.near";
/** Vaults the mock wallet holds (owner) plus ones it created. */
export const MY_VAULTS = { owned: ["0", "2", "5"], created: ["0"] } as const;
export const MY_FAVORITES = ["3", "4", "0"];

/** Every vault event across the marketplace, newest first. */
export const ALL_ACTIVITY = ETFS.flatMap((e) => e.history.map((h) => ({ ...h, etf: e }))).sort((a, b) => b.at.localeCompare(a.at));

export const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 6 : 0 });

/* ---------- Creator leaderboard (mock) ---------- */

export type CreatorStat = {
  account: string;
  vaults: number;
  valueUsd: number;
  return30d: number;
  holders: number;
  followers: number;
  /** positions moved since last period; positive = climbed */
  move: number;
  etf?: Etf;
};

// Real creators come from the ETFs above; a few extra accounts make the table feel lived-in.
const EXTRA: Omit<CreatorStat, "etf">[] = [
  { account: "nearwhale.near", vaults: 4, valueUsd: 3_920, return30d: 6.4, holders: 11, followers: 412, move: 2 },
  { account: "intents.near", vaults: 2, valueUsd: 2_740, return30d: 9.1, holders: 7, followers: 298, move: 5 },
  { account: "kat.near", vaults: 3, valueUsd: 1_480, return30d: -2.3, holders: 5, followers: 156, move: -1 },
  { account: "degen.near", vaults: 5, valueUsd: 960, return30d: 21.7, holders: 14, followers: 804, move: 3 },
  { account: "rhea-maxi.near", vaults: 1, valueUsd: 640, return30d: 3.2, holders: 2, followers: 64, move: -2 },
  { account: "staker.near", vaults: 2, valueUsd: 2_100, return30d: 1.9, holders: 6, followers: 120, move: 0 },
];

export const CREATOR_STATS: CreatorStat[] = [
  ...Object.values(
    ETFS.reduce<Record<string, CreatorStat>>((acc, e, i) => {
      const c = (acc[e.creator] ??= { account: e.creator, vaults: 0, valueUsd: 0, return30d: 0, holders: 0, followers: 120 + e.likes * 2, move: (i % 3) - 1, etf: e });
      const first = e.nav30d[0];
      c.vaults += 1;
      c.valueUsd += e.navUsd;
      c.return30d = ((e.navUsd - first) / first) * 100;
      c.holders += 1 + (e.likes % 5);
      return acc;
    }, {}),
  ),
  ...EXTRA,
];

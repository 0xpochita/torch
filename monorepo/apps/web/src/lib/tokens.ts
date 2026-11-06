// Static UI data: token logos/colors with fallback USD prices (testnet tokens have no market), the shared
// vault/listing shapes, and gacha tier colors. Everything on-chain is read through lib/api.ts.
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
  type: "mint" | "deposit" | "withdraw" | "transfer";
  at: string;
  detail: string;
  account: string;
};

export type Etf = {
  id: string;
  name: string;
  bg: string;
  category: Category;
  creator: string;
  owner: string;
  likes: number;
  navUsd: number;
  change24h: number;
  priceNear: number;
  listed: boolean;
  allocation: Allocation[];
  nav30d: number[];
  history: HistoryEvent[];
};

export const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 6 : 0 });

/* ---------- Marketplace ---------- */


export type Listing = {
  id: string;
  /** The listed vault: artwork, basket and category. */
  etf: Etf;
  name: string;
  seller: string;
  priceNear: number;
  navUsd: number;
  likes: number;
  status: "buy" | "offer";
  listedDaysAgo: number;
};

/* ---------- Gacha ---------- */

export type Rarity = "Common" | "Rare" | "Epic" | "Legendary";

/** Tier colors; odds, baskets and price come from the gacha's get_config. */
export const RARITY: Record<Rarity, { color: string }> = {
  Common: { color: "#9aa0a8" },
  Rare: { color: "#4f9dff" },
  Epic: { color: "#b06bff" },
  Legendary: { color: "#ff8a00" },
};

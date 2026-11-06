// The six seed baskets (formerly apps/web lib/mock.ts ETFS, removed when the web app went live).
// priceNear is the mainnet-scale list price; seed-testnet.ts lists at priceNear / 1000.
import type { Allocation, Category } from "../apps/web/src/lib/tokens.ts";

export type Template = { name: string; bg: string; category: Category; priceNear: number; listed: boolean; allocation: Allocation[] };

export const TEMPLATES: Template[] = [
  { name: "NEAR Blue Chip", bg: "#9fd3ff", category: "Blue Chip", priceNear: 610, listed: true,
    allocation: [{ token: "NEAR", weight: 40 }, { token: "BTC", weight: 30 }, { token: "ETH", weight: 20 }, { token: "USDC", weight: 10 }] },
  { name: "Stable Harbor", bg: "#b8f0d8", category: "Stable", priceNear: 1620, listed: false,
    allocation: [{ token: "USDC", weight: 50 }, { token: "USDT", weight: 30 }, { token: "STNEAR", weight: 20 }] },
  { name: "DeFi Engine", bg: "#ffd8a8", category: "DeFi", priceNear: 300, listed: true,
    allocation: [{ token: "RHEA", weight: 35 }, { token: "LINEAR", weight: 25 }, { token: "AURORA", weight: 20 }, { token: "NEAR", weight: 20 }] },
  { name: "Meme Lab", bg: "#e5c8ff", category: "Meme", priceNear: 140, listed: true,
    allocation: [{ token: "DRAGON", weight: 40 }, { token: "SHITZU", weight: 35 }, { token: "SWEAT", weight: 25 }] },
  { name: "Omni Hot", bg: "#ffc2a8", category: "Chain Abstraction", priceNear: 455, listed: true,
    allocation: [{ token: "HOT", weight: 35 }, { token: "NEAR", weight: 25 }, { token: "ZEC", weight: 20 }, { token: "BTC", weight: 20 }] },
  { name: "Staked Garden", bg: "#c5f5b0", category: "Liquid Staking", priceNear: 730, listed: false,
    allocation: [{ token: "LINEAR", weight: 40 }, { token: "STNEAR", weight: 40 }, { token: "NPRO", weight: 20 }] },
];

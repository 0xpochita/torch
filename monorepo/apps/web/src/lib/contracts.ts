// On-chain ids for the testnet deploy (contracts/INTERFACES.md). Everything is overridable with
// NEXT_PUBLIC_* env vars; the defaults are the agreed testnet accounts.
import type { TokenKey } from "@/lib/mock";

export const NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet") as "mainnet" | "testnet";
export const RPC = process.env.NEXT_PUBLIC_NEAR_RPC || (NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");

const ROOT = process.env.NEXT_PUBLIC_TORCH_ROOT || "torchvault.testnet";
export const COLLECTION = process.env.NEXT_PUBLIC_COLLECTION_ID || `nft.${ROOT}`;
export const MARKET = process.env.NEXT_PUBLIC_MARKET_ID || `market.${ROOT}`;
export const GACHA = process.env.NEXT_PUBLIC_GACHA_ID || `gacha.${ROOT}`;
export const WNEAR = process.env.NEXT_PUBLIC_WNEAR_ID || (NETWORK === "mainnet" ? "wrap.near" : "wrap.testnet");

/** `<token_id>.<collection>`: the vault account behind an NFT. */
export const vaultOf = (tokenId: string) => `${tokenId}.${COLLECTION}`;

export type Ft = { key: TokenKey; id: string; decimals: number };

// Mock NEP-141s: tusdc/tusdt 6 decimals, tbtc 8, the rest 18. NEAR in a basket is wNEAR (24).
const mock = (key: TokenKey, name: string, decimals = 18): Ft => ({ key, id: `${name}.${ROOT}`, decimals });

export const FTS: Ft[] = [
  { key: "NEAR", id: WNEAR, decimals: 24 },
  mock("USDC", "tusdc", 6),
  mock("USDT", "tusdt", 6),
  mock("BTC", "tbtc", 8),
  mock("ETH", "teth"),
  mock("HOT", "thot"),
  mock("RHEA", "trhea"),
  mock("LINEAR", "tlinear"),
  mock("STNEAR", "tstnear"),
  mock("ZEC", "tzec"),
  mock("AURORA", "taurora"),
  mock("NPRO", "tnpro"),
  mock("DRAGON", "tdragon"),
  mock("SHITZU", "tshitzu"),
  mock("SWEAT", "tsweat"),
];

export const ftByKey = (key: TokenKey) => FTS.find((f) => f.key === key)!;
export const ftById = (id: string) => FTS.find((f) => f.id === id);

/** Faucet tokens (everything but wNEAR, which you wrap yourself). */
export const MOCK_FTS = FTS.filter((f) => f.id !== WNEAR);

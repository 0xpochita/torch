// On-chain ids for the testnet deploy (contracts/INTERFACES.md). Everything is overridable with
// NEXT_PUBLIC_* env vars; the defaults are the agreed testnet accounts.
import { TOKENS as TOKEN_KEYS, type TokenKey } from "@/lib/mock";

export const NETWORK = (process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet") as "mainnet" | "testnet";
export const RPC = process.env.NEXT_PUBLIC_NEAR_RPC || (NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com");

export const COLLECTION = process.env.NEXT_PUBLIC_COLLECTION_ID || "nft.torchvault.testnet";
export const MARKET = process.env.NEXT_PUBLIC_MARKET_ID || "market.torchvault.testnet";
export const GACHA = process.env.NEXT_PUBLIC_GACHA_ID || "gacha.torchvault.testnet";
export const WNEAR = NETWORK === "mainnet" ? "wrap.near" : "wrap.testnet";

/** `<token_id>.<collection>`: the vault account behind an NFT. */
export const vaultOf = (tokenId: string) => `${tokenId}.${COLLECTION}`;

export type Ft = { key: TokenKey; id: string; decimals: number };

const MOCK_IDS = (
  process.env.NEXT_PUBLIC_FT_IDS ||
  "tusdc,tusdt,tbtc,teth,thot,trhea,tlinear,tstnear,tzec,taurora,tnpro,tdragon,tshitzu,tsweat"
    .split(",")
    .map((t) => `${t}.torchvault.testnet`)
    .join(",")
)
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

/** "tusdc.torchvault.testnet" → USDC. Mock decimals: tusdc/tusdt 6, tbtc 8, everything else 18. */
function mockFt(id: string): Ft | null {
  const key = id.split(".")[0].replace(/^t/, "").toUpperCase();
  if (!(key in TOKEN_KEYS)) return null;
  return { key: key as TokenKey, id, decimals: key === "USDC" || key === "USDT" ? 6 : key === "BTC" ? 8 : 18 };
}

// NEAR in a basket is wNEAR (24 decimals); the rest are the mock NEP-141s.
export const FTS: Ft[] = [{ key: "NEAR", id: WNEAR, decimals: 24 }, ...MOCK_IDS.map(mockFt).filter((f): f is Ft => !!f)];

export const ftByKey = (key: TokenKey) => FTS.find((f) => f.key === key)!;
export const ftById = (id: string) => FTS.find((f) => f.id === id);

/** Faucet tokens (everything but wNEAR, which you wrap yourself). */
export const MOCK_FTS = FTS.filter((f) => f.id !== WNEAR);

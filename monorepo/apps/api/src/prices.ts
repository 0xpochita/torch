import { config } from "./config.ts";

// Mock token -> real asset it mirrors. Keyed by the first label of the account id
// (`tusdc.torchvault.testnet` -> `tusdc`). `usd` is the fallback when CoinGecko fails.
const TOKENS: Record<string, { symbol: string; decimals: number; gecko: string; usd: number }> = {
  tusdc: { symbol: "USDC", decimals: 6, gecko: "usd-coin", usd: 1 },
  tusdt: { symbol: "USDT", decimals: 6, gecko: "tether", usd: 1 },
  tbtc: { symbol: "BTC", decimals: 8, gecko: "bitcoin", usd: 98450 },
  teth: { symbol: "ETH", decimals: 18, gecko: "ethereum", usd: 3420 },
  thot: { symbol: "HOT", decimals: 18, gecko: "hot-protocol", usd: 1.94 },
  trhea: { symbol: "RHEA", decimals: 18, gecko: "rhea-2", usd: 0.21 },
  tlinear: { symbol: "LiNEAR", decimals: 18, gecko: "linear-protocol", usd: 3.58 },
  tstnear: { symbol: "stNEAR", decimals: 18, gecko: "staked-near", usd: 3.66 },
  tzec: { symbol: "ZEC", decimals: 18, gecko: "zcash", usd: 61.4 },
  taurora: { symbol: "AURORA", decimals: 18, gecko: "aurora-near", usd: 0.12 },
  tnpro: { symbol: "NPRO", decimals: 18, gecko: "npro", usd: 0.64 },
  tdragon: { symbol: "BLACKDRAGON", decimals: 18, gecko: "black-dragon", usd: 0.0000021 },
  tshitzu: { symbol: "SHITZU", decimals: 18, gecko: "shitzu", usd: 0.0011 },
  tsweat: { symbol: "SWEAT", decimals: 18, gecko: "sweatcoin", usd: 0.0042 },
  wrap: { symbol: "wNEAR", decimals: 24, gecko: "near", usd: 3.12 },
};

/** USD price per whole token, keyed like TOKENS. */
export type Prices = Record<string, number>;

// ponytail: process-wide allow-list (config.ftIds); the e2e swaps in its sandbox ids with allowFts.
let known = new Set(config.ftIds);
/** Only these exact token accounts are priced or indexed: anyone can deploy `tusdc.<their account>`. */
export const allowFts = (ids: string[]) => void (known = new Set(ids));
export const isKnownFt = (ftId: string) => known.has(ftId);

/** TOKENS key of an allow-listed token account; "" (no entry, price 0) for anything else. */
const key = (ftId: string) => (known.has(ftId) ? ftId.split(".")[0] : "");

export function tokenInfo(ftId: string) {
  const t = TOKENS[key(ftId)];
  return { symbol: t?.symbol ?? ftId, decimals: t?.decimals ?? 18 };
}

export const priceOf = (px: Prices, ftId: string) => px[key(ftId)] ?? 0;
export const nearUsd = (px: Prices) => px.wrap;

export const staticPrices = (): Prices => Object.fromEntries(Object.entries(TOKENS).map(([k, t]) => [k, t.usd]));

let cache: { at: number; px: Prices } | null = null;

/** CoinGecko prices cached 60 s; any id it misses (or a failed fetch) uses the static price. */
export async function livePrices(): Promise<Prices> {
  if (cache && Date.now() - cache.at < 60_000) return cache.px;
  const px = staticPrices();
  try {
    const ids = Object.values(TOKENS).map((t) => t.gecko).join(",");
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const json = (await res.json()) as Record<string, { usd?: number }>;
    for (const [k, t] of Object.entries(TOKENS)) if (json[t.gecko]?.usd) px[k] = json[t.gecko].usd!;
  } catch (e) {
    console.warn("prices: using static fallback", (e as Error).message);
  }
  cache = { at: Date.now(), px };
  return px;
}

/** amount (smallest units) -> whole tokens as a float; fine for display/NAV. */
export const toUnits = (amount: string, decimals: number) => Number(BigInt(amount)) / 10 ** decimals;

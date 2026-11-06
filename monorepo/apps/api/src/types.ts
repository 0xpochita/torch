// Response shapes of every endpoint. apps/web can import these directly
// (type-only, no runtime code here). Amounts are U128 strings, NEAR amounts
// are yoctoNEAR, time is milliseconds since the epoch.

export type Rarity = "Common" | "Rare" | "Epic" | "Legendary";

export type BasketItem = { token: string; weight: number };

export type Balance = {
  ftId: string;
  symbol: string;
  decimals: number;
  amount: string;
  priceUsd: number;
  valueUsd: number;
};

export type Listing = { tokenId: string; sellerId: string; price: string; listedAt: number };

export type Offer = { tokenId: string; buyerId: string; amount: string; expiresAt: number; createdAt: number };

export type Sale = { tokenId: string; sellerId: string; buyerId: string; price: string; at: number };

export type VaultSummary = {
  tokenId: string;
  vaultId: string;
  title: string | null;
  ownerId: string;
  creator: string;
  category: string | null;
  bg: string | null;
  rarity: Rarity | null;
  basket: BasketItem[];
  navUsd: number;
  mintedAt: number;
  listing: Listing | null;
};

export type NavPoint = { at: number; navUsd: number };

export type Holder = { accountId: string; since: number; until: number | null };

export type VaultDetail = VaultSummary & {
  balances: Balance[];
  /** NAV after each deposit/withdraw, valued at current prices. */
  navHistory: NavPoint[];
  holders: Holder[];
  offers: Offer[];
  sales: Sale[];
};

export type MarketListing = Listing & { vault: VaultSummary };

export type Orderbook = { tokenId: string; ask: Listing | null; bids: Offer[]; sales: Sale[] };

export type OffersResponse = { made: Offer[]; received: Offer[] };

export type ActivityItem = {
  id: number;
  at: number;
  blockHeight: number;
  txHash: string | null;
  receiptId: string;
  contractId: string;
  standard: "torch" | "nep171";
  event: string;
  tokenId: string | null;
  data: Record<string, unknown>;
};

export type LeaderboardPeriod = "24h" | "7d" | "30d" | "all";
export type LeaderboardSort = "value" | "volume" | "sales" | "vaults" | "holders";

export type LeaderboardRow = {
  rank: number;
  accountId: string;
  vaults: number;
  valueUsd: number;
  holders: number;
  /** Sales of this creator's vaults within the period. */
  sales: number;
  volume: string;
};

export type GachaPull = {
  tokenId: string;
  playerId: string;
  rarity: Rarity;
  pityAfter: number;
  price: string;
  at: number;
  vault: VaultSummary | null;
};

export type Stats = {
  vaults: number;
  tvlUsd: number;
  listings: number;
  offers: number;
  sales: number;
  volume: string;
  volume24h: string;
  pulls: number;
  holders: number;
  nearUsd: number;
  lastHeight: number | null;
};

export type ApiError = { error: string };

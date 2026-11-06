const env = process.env;
const root = env.NEAR_ROOT_ID ?? "torchvault.testnet";

const MOCK_FTS = ["tusdc", "tusdt", "tbtc", "teth", "thot", "trhea", "tlinear", "tstnear", "tzec", "taurora", "tnpro", "tdragon", "tshitzu", "tsweat"];

export type Config = {
  collectionId: string;
  marketId: string;
  gachaId: string;
  ftIds: string[];
  rpcUrl: string;
  neardataUrl: string;
  startHeight: number | null;
};

export const config: Config = {
  collectionId: env.NEAR_COLLECTION_ID ?? `nft.${root}`,
  marketId: env.NEAR_MARKET_ID ?? `market.${root}`,
  gachaId: env.NEAR_GACHA_ID ?? `gacha.${root}`,
  ftIds: env.NEAR_FT_IDS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [...MOCK_FTS.map((t) => `${t}.${root}`), "wrap.testnet"],
  rpcUrl: env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org",
  neardataUrl: env.NEARDATA_URL ?? "https://testnet.neardata.xyz",
  startHeight: env.START_HEIGHT ? Number(env.START_HEIGHT) : null,
};

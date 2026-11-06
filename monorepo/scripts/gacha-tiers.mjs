// Gacha tiers for `gacha.new`: 60/28/10/2 with 2-3 baskets each, at most 3 items per basket.
// Basket value in USD is scaled to the 0.1 NEAR (~$0.31) pull so the expected value ~= the price.
// Usage: node gacha-tiers.mjs <root account>   -> JSON array of Tier
// Prices mirror apps/web/src/lib/mock.ts TOKENS.
export const TOKENS = {
  tusdc: [1, 6], tusdt: [1, 6], tbtc: [98450, 8], teth: [3420, 18], thot: [1.94, 18],
  trhea: [0.21, 18], tlinear: [3.58, 18], tstnear: [3.66, 18], tzec: [61.4, 18],
  taurora: [0.12, 18], tnpro: [0.64, 18], tdragon: [0.0000021, 18], tshitzu: [0.0011, 18],
  tsweat: [0.0042, 18],
};

const TIERS = [
  ["Common", 6000, 0.12, [
    ["Stable Drip", "Stable", "#b8f0d8", { tusdc: 50, tusdt: 50 }],
    ["Meme Crumbs", "Meme", "#e5c8ff", { tdragon: 40, tshitzu: 35, tsweat: 25 }],
    ["DeFi Spark", "DeFi", "#ffd8a8", { trhea: 50, taurora: 50 }],
  ]],
  ["Rare", 2800, 0.3, [
    ["Staked Seed", "Liquid Staking", "#c5f5b0", { tlinear: 50, tstnear: 50 }],
    ["Hot Starter", "Chain Abstraction", "#ffc2a8", { thot: 60, tnpro: 40 }],
    ["DeFi Engine", "DeFi", "#ffd8a8", { trhea: 40, tlinear: 30, taurora: 30 }],
  ]],
  ["Epic", 1000, 0.9, [
    ["Omni Hot", "Chain Abstraction", "#ffc2a8", { thot: 40, tzec: 30, tbtc: 30 }],
    ["Staked Garden", "Liquid Staking", "#c5f5b0", { tlinear: 40, tstnear: 40, tnpro: 20 }],
  ]],
  ["Legendary", 200, 3, [
    ["NEAR Blue Chip", "Blue Chip", "#9fd3ff", { tbtc: 40, teth: 40, tusdc: 20 }],
    ["Golden Torch", "Blue Chip", "#ffe08a", { tbtc: 50, teth: 30, tzec: 20 }],
  ]],
];

// usd -> base units, rounded to 4 significant digits, exact integer math.
function units(token, usd) {
  const [price, decimals] = TOKENS[token];
  const x = usd / price;
  const e = Math.floor(Math.log10(x)) - 3;
  const m = BigInt(Math.round(x / 10 ** e));
  const shift = decimals + e;
  return (shift >= 0 ? m * 10n ** BigInt(shift) : m / 10n ** BigInt(-shift)).toString();
}

export const tiersFor = (root) => TIERS.map(([rarity, weight_bps, usd, baskets]) => ({
  rarity,
  weight_bps,
  baskets: baskets.map(([name, category, bg, weights]) => ({
    name,
    category,
    bg,
    items: Object.entries(weights).map(([t, pct]) => ({
      token: `${t}.${root}`,
      amount: units(t, (usd * pct) / 100),
    })),
  })),
}));

if (process.argv[1]?.endsWith("gacha-tiers.mjs")) {
  console.log(JSON.stringify(tiersFor(process.argv[2] ?? "torchvault.testnet")));
}

// Offline chain for FIXTURE=1 and tests: synthetic blocks whose logs match the
// INTERFACES.md events, plus view calls answered from the replayed state.
import type { Config } from "./config.ts";
import type { Block, Chain, Outcome } from "./indexer.ts";

export const FIXTURE_START = 1000;

const NEAR = (n: number) => (BigInt(Math.round(n * 1000)) * 10n ** 21n).toString();
const HOUR = 3_600_000;

export function fixtureChain(cfg: Config, now = Date.now()): Chain & { blocks: Block[] } {
  const ft = (sym: string) => cfg.ftIds.find((id) => id.startsWith(`${sym}.`)) ?? `${sym}.torchvault.testnet`;
  const [usdc, usdt, btc, eth] = ["tusdc", "tusdt", "tbtc", "teth"].map(ft);
  const vault = (id: string) => `${id}.${cfg.collectionId}`;
  const log = (standard: string, event: string, data: object[]) => `EVENT_JSON:${JSON.stringify({ standard, version: "1.0.0", event, data })}`;
  const torch = (event: string, data: object) => log("torch", event, [data]);

  let r = 0;
  const out = (executorId: string, ...logs: string[]): Outcome => ({ receiptId: `r${++r}`, txHash: `tx${r}`, executorId, logs });

  const mint = (tokenId: string, owner: string, creator: string, extra: object) => [
    out(cfg.collectionId, torch("vault_created", { token_id: tokenId, vault_id: vault(tokenId), owner_id: owner, creator, extra: JSON.stringify({ creator, ...extra }) }), log("nep171", "nft_mint", [{ owner_id: owner, token_ids: [tokenId] }])),
  ];
  const deposit = (tokenId: string, ftId: string, amount: string, sender: string) =>
    out(vault(tokenId), torch("vault_deposit", { token_id: tokenId, ft_id: ftId, amount, sender_id: sender }));
  const transfer = (tokenId: string, from: string, to: string) => out(cfg.collectionId, log("nep171", "nft_transfer", [{ old_owner_id: from, new_owner_id: to, token_ids: [tokenId] }]));
  const market = (event: string, data: object) => out(cfg.marketId, torch(event, data));
  const far = now + 30 * 24 * HOUR;

  const steps: Outcome[][] = [
    mint("0", "alice.testnet", "alice.testnet", { basket: [{ token: usdc, weight: 40 }, { token: btc, weight: 30 }, { token: eth, weight: 30 }], bg: "#9fd3ff", category: "Blue Chip", rarity: null }),
    [deposit("0", usdc, "400000000", "alice.testnet"), deposit("0", btc, "300000", "alice.testnet"), deposit("0", eth, "100000000000000000", "alice.testnet")],
    [...mint("1", "carol.testnet", "carol.testnet", { basket: [{ token: usdc, weight: 50 }, { token: usdt, weight: 50 }], bg: "#b8f0d8", category: "Stable", rarity: null }), deposit("1", usdc, "500000000", "carol.testnet"), deposit("1", usdt, "500000000", "carol.testnet")],
    [market("list", { token_id: "0", seller_id: "alice.testnet", price: NEAR(5) })],
    [market("offer", { token_id: "0", buyer_id: "bob.testnet", amount: NEAR(4), expires_at: far }), market("offer", { token_id: "0", buyer_id: "dave.testnet", amount: NEAR(3.5), expires_at: far })],
    // bob buys at the ask; the collection reports the transfer
    [market("sale", { token_id: "0", seller_id: "alice.testnet", buyer_id: "bob.testnet", price: NEAR(5), fee: NEAR(0.1) }), transfer("0", "alice.testnet", "bob.testnet")],
    [market("offer_cancel", { token_id: "0", buyer_id: "dave.testnet", amount: NEAR(3.5) })],
    // gacha pull: mint to the player, fund from the treasury, then the pull event
    [
      ...mint("2", "dave.testnet", cfg.gachaId, { basket: [{ token: eth, weight: 100 }], bg: "#e5c8ff", category: "Meme", rarity: "Epic" }),
      deposit("2", eth, "20000000000000000", cfg.gachaId),
      out(cfg.gachaId, torch("gacha_pull", { player_id: "dave.testnet", token_id: "2", rarity: "Epic", pity_after: 0, price: NEAR(0.1) })),
    ],
    [market("list", { token_id: "1", seller_id: "carol.testnet", price: NEAR(10) }), market("offer", { token_id: "1", buyer_id: "bob.testnet", amount: NEAR(8), expires_at: far })],
    [market("offer", { token_id: "0", buyer_id: "erin.testnet", amount: NEAR(6), expires_at: far })],
    [market("offer_accept", { token_id: "0", seller_id: "bob.testnet", buyer_id: "erin.testnet", amount: NEAR(6) }), transfer("0", "bob.testnet", "erin.testnet")],
    [out(cfg.collectionId, torch("vault_withdraw", { token_id: "0", ft_id: usdc, amount: "100000000", owner_id: "erin.testnet" }))],
    // spoofed event from a foreign contract: must be ignored
    [out("spoof.testnet", torch("sale", { token_id: "1", seller_id: "carol.testnet", buyer_id: "mallory.testnet", price: NEAR(1000), fee: "0" }))],
  ];

  // Block FIXTURE_START + i at `now - (n - i) * 4h`; one skipped height at the end.
  const blocks: Block[] = steps.map((outcomes, i) => ({ height: FIXTURE_START + i, timestamp: now - (steps.length - i) * 4 * HOUR, outcomes }));
  const tip = FIXTURE_START + steps.length; // skipped height
  const titles: Record<string, string> = { "0": "NEAR Blue Chip", "1": "Stable Harbor", "2": "Lucky Epic" };
  let served = FIXTURE_START - 1;

  // Balance = deposits - withdrawals over the blocks served so far (what ft_balance_of would say).
  function balance(ftId: string, account: string) {
    let sum = 0n;
    for (const b of blocks.filter((b) => b.height <= served))
      for (const o of b.outcomes)
        for (const l of o.logs) {
          const e = JSON.parse(l.slice("EVENT_JSON:".length));
          const d = e.data[0];
          if (d.ft_id !== ftId || vault(d.token_id) !== account) continue;
          if (e.event === "vault_deposit") sum += BigInt(d.amount);
          if (e.event === "vault_withdraw") sum -= BigInt(d.amount);
        }
    return sum.toString();
  }

  return {
    blocks,
    async finalHeight() {
      return tip;
    },
    async block(h) {
      served = h;
      return blocks.find((b) => b.height === h) ?? null;
    },
    async view<T>(accountId: string, method: string, args: any) {
      if (method === "ft_balance_of") return balance(accountId, args.account_id) as T;
      if (method === "nft_token") return { token_id: args.token_id, metadata: { title: titles[args.token_id] ?? null } } as T;
      throw new Error(`fixture: no view ${accountId}.${method}`);
    },
  };
}

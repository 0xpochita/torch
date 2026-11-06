# Torch demo video script (3:00)

Track: NEAR "NFTs That Do Something". Everything shown runs on NEAR testnet.

**Setup before recording**

- Deploy and seed done ([`scripts/README.md`](../scripts/README.md)); API indexer running and
  caught up; web open on Explore.
- Two browser profiles, both on testnet: **Alice** (seller, HOT Wallet) and **Bob** (buyer,
  Meteor or MyNearWallet). Each has ~5 NEAR from the testnet faucet. Bob has used the faucet once
  already so the demo does not wait on the hourly limit.
- A second tab with `testnet.nearblocks.io` to open tx links.
- Screen at 1440 px wide, browser zoom 110%, notifications off.

| Time | Screen | Action | Say |
| --- | --- | --- | --- |
| 0:00–0:15 | Explore | Scroll the seeded vaults: cards with basket art, NAV, 24h change | "This is Torch. Every card here is an NFT, and every NFT is a vault: its own NEAR account holding a basket of tokens. Own the NFT, own the basket. Sell the NFT, you sold the basket." |
| 0:15–0:25 | Topbar | Alice clicks **Connect**, picks HOT Wallet, approves | "We connect with near-connect, so HOT, Meteor, MyNearWallet and other NEAR wallets all work. HOT is listed first." |
| 0:25–0:40 | Faucet | Alice claims tBTC, tETH and tUSDC, wraps 0.2 NEAR | "On testnet the basket tokens are our own NEP-141 mocks with an hourly faucet: 0.1 of each per account. NEAR goes in as wNEAR." |
| 0:40–1:05 | Create | Alice names "Demo Blue Chip", picks Blue Chip, sets 40% wNEAR / 30% BTC / 30% ETH, clicks **Create**; wallet signs the mint (step 1), then the funding batch (step 2); success screen shows the token id | "Creating is two steps. First the mint: the collection creates a brand-new account for this NFT and deploys the vault from a global contract by hash, with no access keys at all. Then the funding: storage deposit and `ft_transfer_call` for each token, straight from my wallet into the vault." |
| 1:05–1:15 | Vault detail | Show basket balances, NAV, history with `vault_created` and deposits; open the vault account in nearblocks: zero access keys | "That account has no keys and only answers to the collection. Nobody, not even me, can move these tokens except through the NFT." |
| 1:15–1:30 | Vault detail | Alice clicks **List**, sets 0.5 NEAR, signs `nft_approve` | "Listing is a single NEP-178 approval to the market. While it is listed, withdrawals are blocked, so the basket a buyer sees is the basket they get." |
| 1:30–1:45 | Bob's profile, Market | Bob opens the listing, clicks **Buy**, signs 0.5 NEAR | "Bob buys it. The market calls `nft_transfer_payout`: 2.5% royalty to the creator, 2% fee, the rest to Alice, and the NFT moves to Bob. The basket moved with it, in the same transaction." |
| 1:45–2:05 | Bob: another seeded vault; then Alice: My Vaults | Bob places a 0.3 NEAR offer on a seeded vault Alice owns; Alice opens **Offers** on My Vaults and clicks **Accept** | "Offers escrow NEAR in the market. The owner accepts with one approval that names the buyer, and the sale settles exactly like a buy." |
| 2:05–2:20 | Bob: vault detail | Bob deposits 0.05 tUSDC, then withdraws 0.01 tBTC | "Bob owns it now, so Bob can top it up or take tokens out. Withdrawals pay whoever owns the NFT at that moment, and the NFT is locked until the withdrawal resolves, so it cannot be sold mid-flight." |
| 2:20–2:45 | Gacha | Bob clicks **10-pull** (0.9 NEAR); the machine animates while the tx confirms; reveal shows 10 vaults with rarities | "The gacha mints vaults too. Each pull rolls a rarity, 60/28/10/2 with pity at 50, mints a fresh vault to the player and funds it from the gacha's treasury. Ten real NFTs, each already holding its basket." |
| 2:45–3:00 | Activity, then Leaderboard | Scroll Activity (sale, offer accepted, deposit, withdraw, gacha pulls); switch to Leaderboard | "Everything you saw is indexed from on-chain events into the activity feed and the creator leaderboard. Torch: NFTs that don't just sit there. They hold value, and they trade it." |

## If something stalls

- Faucet says "wait": use a token that account has not claimed this hour, or switch profiles.
- Indexer lag: the tx sheet links to nearblocks; show the tx there and come back after a block or two.
- 10-pull refunded "cannot cover": the gacha needs NEAR or treasury top-up (`GACHA_NEAR`,
  [`scripts/budget.md`](../scripts/budget.md)); fall back to a 1-pull.

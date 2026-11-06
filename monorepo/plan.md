# Torch on NEAR testnet: integration plan

Goal: every feature in the web app runs against real contracts on NEAR testnet, signed with HOT
Wallet (and any other NEAR wallet via `@hot-labs/near-connect`), before the hackathon deadline
on **14 Nov 2026**. Nothing stays mocked except prices.

## Decisions (agreed 6 Nov 2026)

| Topic | Decision |
| --- | --- |
| Scope | All on-chain: create/mint vault, deposit/withdraw/transfer, list/buy/offer/accept, gacha |
| Order | Wallet connect first, then contracts, then wire each page |
| Tokens | Deploy our own mock NEP-141 tokens on testnet, with a faucet in the app |
| Data | Indexer + DB in `apps/api`; SQLite locally first (move to Postgres only if we deploy the API) |
| Gacha | Gacha contract with a pre-funded treasury of mock tokens; each pull mints a fresh vault and funds it by rarity |
| Wallets | Every wallet in the near-connect manifest; HOT Wallet featured first |
| Accounts | New testnet accounts created with near-cli-rs (`torchvault.testnet` exists, 10 NEAR); fund the rest before deploy |

## Accounts and contracts

Root account (new): `torchvault.testnet`. Everything else is a sub-account, so ids are derivable
and only we can create them.

| Account | Contract | Role |
| --- | --- | --- |
| `torchvault.testnet` | none (owner key only) | deployer, treasury admin |
| `nft.torchvault.testnet` | collection (NEP-171/177/178/181/199) | the only authority over vaults |
| `<id>.nft.torchvault.testnet` | vault (global contract, by hash) | holds the basket, no access keys |
| `market.torchvault.testnet` | marketplace | listings, offers in NEAR escrow, sales via `nft_transfer_payout` |
| `gacha.torchvault.testnet` | gacha | pull price in NEAR, rolls rarity, mints + funds a vault from its treasury |
| `tusdc / tbtc / teth / thot / trhea / tlinear / tstnear / tzec.torchvault.testnet` | mock NEP-141 | basket tokens with a rate-limited `faucet` method |

wNEAR uses the existing `wrap.testnet` (real wrap contract on testnet).

## Phase 1: Wallet connect (6–7 Nov)

Skill: `skills/hot-wallet-connect`.

- [ ] `pnpm add @hot-labs/near-connect` in `apps/web`; add `NearProvider` (client-only) in `app/layout.tsx`
- [ ] `NEXT_PUBLIC_NEAR_NETWORK=testnet`, `NEXT_PUBLIC_NEAR_RPC` in `apps/web/.env.local` (+ `.env.example`)
- [ ] Topbar "Connect" button opens the near-connect modal; HOT Wallet listed first
- [ ] Signed-in state: avatar + account id + NEAR balance in the topbar; sign out in a menu
- [ ] Replace the mock `ME = "bob.near"` with the connected account everywhere (`useNear()`); signed-out pages show a connect prompt instead of bob's data
- [ ] Session restores on reload; CSP allows the near-connect iframe + manifest origins
- [ ] Check: connect HOT Wallet (extension + Telegram), Meteor, MyNearWallet on testnet

## Phase 2: Contracts (7–10 Nov)

Skills: `skills/near-nft-account` (reference `collection.rs` / `vault.rs`), `near-smart-contracts`,
`near-contract-audit`. Workspace: `contracts/` becomes a cargo workspace.

### 2a. Mock tokens: `contracts/mock-ft`
- [ ] near-contract-standards FungibleToken; `new(symbol, decimals, icon)`; `faucet()` gives 0.1 token, once per account per hour
- [ ] Deploy 8 tokens + storage for the treasury/market accounts

### 2b. Collection + vault: `contracts/collection`, `contracts/vault`
- [ ] Port `references/collection.rs` + `vault.rs`; invariants I1–I9 from the skill stay enforced
- [ ] `mint(metadata, receiver_id?)`: creates `<id>.nft…` via global contract by hash, mints after `on_vault_created`; `receiver_id` lets the gacha mint to the player
- [ ] Token metadata extras: `basket: [{token, weight}]`, `bg`, `category`, `creator`, `rarity?`
- [ ] Vault: `ft_on_transfer` accepts deposits; `withdraw(ft, amount)` and `withdraw_all` only via collection, paid to the owner at call time
- [ ] `deposit` helper path: owner calls `ft_transfer_call(receiver = vault)` directly from the UI (no collection call needed)
- [ ] NEP-199 `nft_payout`: creator royalty 2.5%
- [ ] Events (NEP-297, `standard: "torch"`): `vault_created`, `vault_deposit`, `vault_withdraw`, emitted in callbacks on success only
- [ ] Unit tests from the skill + sandbox tests 1–5 (near-workspaces)

### 2c. Marketplace: `contracts/market`
- [ ] `nft_on_approve` creates a listing `{token_id, price_near, seller}`
- [ ] `buy(token_id)` attached NEAR = price → `nft_transfer_payout` → split payout (seller, royalty, 2% fee to `torchvault.testnet`)
- [ ] `offer(token_id, expires_at)` escrows attached NEAR; `cancel_offer`; `accept_offer(token_id, buyer)` called by the owner after approving the market
- [ ] Listing removed on any transfer/revoke (check on read + clean in callbacks)
- [ ] Events: `list`, `delist`, `sale`, `offer`, `offer_cancel`, `offer_accept`
- [ ] Sandbox: buy, offer accept, offer refund after expiry, sale fails while a withdraw is in flight

### 2d. Gacha: `contracts/gacha`
- [ ] Config: price per pull (0.1 NEAR, 10-pull = 0.9 NEAR), rarity table (60/28/10/2), pity 50, per-rarity basket templates + USD ranges expressed as token amounts
- [ ] `pull(count)`: payable; for each pull roll with `env::random_seed()` + pull index; pity counter per account; calls `collection.mint(receiver = player)` then funds the vault with `ft_transfer_call` from the treasury
- [ ] Treasury: admin `fund(ft)` via `ft_transfer_call`; `pull` fails cleanly (refund) when the treasury cannot cover a tier
- [ ] View: `get_pity(account)`, `get_config`, `get_treasury`
- [ ] Event `gacha_pull {player, token_id, rarity, pity}`
- [ ] Note in README: `random_seed` is fine for testnet, but a validator can bias it; mainnet needs commit-reveal or VRF

### 2e. Deploy (10 Nov)
- [ ] Create accounts with near-cli-rs; you fund `torchvault.testnet` from the faucet
- [ ] `scripts/deploy-testnet.sh`: build wasm, publish vault global contract (by hash), deploy + init collection/market/gacha/tokens, fund the gacha treasury
- [ ] Write ids to `apps/web/.env.local` and `apps/api/.env`
- [ ] Update `.github/workflows/deploy-contract.yml` to the new workspace (testnet only, key from GitHub Secrets)
- [ ] Verify `near account list-keys 0.nft.torchvault.testnet` is empty

## Phase 3: Indexer + API (10–11 Nov), `apps/api`

- [ ] SQLite via Node's built-in `node:sqlite` (no new dependency); tables: `tokens`, `vault_balances`, `listings`, `offers`, `events`, `pulls`, `cursor`
- [ ] Indexer loop: fetch blocks from `https://testnet.neardata.xyz/v0/block/{height}`, keep receipts whose receiver is one of our contracts, parse `EVENT_JSON` logs, upsert tables, store the last height in `cursor`. Backfill from the collection's deploy height.
- [ ] Balances: after any vault event, refresh `ft_balance_of(vault)` for its tokens via RPC view
- [ ] Prices: static table + CoinGecko mainnet prices for the real assets the mocks mirror (cached 60 s); NAV = Σ balance × price
- [ ] Endpoints:
  - `GET /vaults?owner&creator&category&sort`
  - `GET /vaults/:id` (metadata, basket balances, NAV history, holders)
  - `GET /market/listings`, `GET /market/orderbook/:id`, `GET /offers?owner`
  - `GET /activity?account&type&since`
  - `GET /leaderboard?period&sort`
  - `GET /gacha/recent`, `GET /stats`
- [ ] `apps/web` reads via a typed `lib/api.ts`; `lib/mock.ts` stays only as the price table + seed during dev

## Phase 4: Wire the UI (11–13 Nov)

Every page swaps `lib/mock.ts` for the API (reads) and `tx-sheet.tsx` for real transactions
(writes). The tx sheet keeps its review → "Confirm in your wallet" → done flow; the pending step
becomes `wallet.signAndSendTransactions(...)` and the done step links the tx on
`testnet.nearblocks.io`.

| Page | Reads | Writes |
| --- | --- | --- |
| Create | token list + faucet balances | `mint` (batch: mint, `storage_deposit` per token, `ft_transfer_call` deposits), success screen uses the real token id |
| Explore | `/vaults`, `/stats`, `/leaderboard` | none |
| Vault detail | `/vaults/:id`, order book | buy, offer, accept, deposit, withdraw, transfer |
| Market | `/market/listings`, order book | list (`nft_approve` to market with price msg), buy, offer |
| My Vaults | `/vaults?owner=me`, `/offers?owner=me`, `/activity?account=me` | list/delist, accept offer, deposit, withdraw, transfer |
| Activity | `/activity` | none |
| Leaderboard | `/leaderboard` | none |
| Gacha | `get_pity`, `/gacha/recent`, treasury | `pull(1 \| 10)`; the 3D animation plays while the tx confirms; the reveal reads the minted tokens from the tx result |
| Faucet (new, small) | balances | `faucet` on each mock token, `near_deposit` to wrap NEAR |

- [ ] Loading + error states for every read; failed tx shows the wallet/contract error in the sheet
- [ ] Remove the "Mock …" labels once each page is live

## Phase 5: Demo hardening (13–14 Nov)

- [ ] Seed script: 6 template vaults from 3 creator accounts, some listings and offers, so the market is not empty for judges
- [ ] End-to-end run on testnet: connect HOT → faucet → create → list → buy from a second account → offer/accept → deposit/withdraw → gacha ×10
- [ ] README: architecture diagram, contract ids, how to run locally, how to get test tokens
- [ ] Demo video script for the "NFTs That Do Something" track
- [ ] Deploy `apps/web` (Vercel preview) pointed at testnet; API: run locally for the demo or move SQLite → Postgres if hosted

## Risks

| Risk | Mitigation |
| --- | --- |
| Gacha + marketplace + collection in 4 days is tight | Contracts reuse the skill's reference code; gacha mints through the same `mint` path |
| `env::random_seed` is biasable | Accepted for testnet; documented |
| Callback out of gas leaves a token locked | Fixed `GAS_CALLBACK`, O(1) callbacks, admin `force_unlock` after timeout |
| neardata.xyz downtime | Indexer falls back to RPC `block` + `chunk` polling (slower) |
| SQLite on a hosted API | Run the API locally for the demo, or switch to Postgres (Neon via Vercel Marketplace) before deploy |
| Wallet popups blocked / iframe CSP | Test HOT extension, HOT Telegram and Meteor early (Phase 1) |

## Answered (6 Nov 2026)

1. Royalty 2.5% to the creator, marketplace fee 2%: **yes**
2. Mint is **permissionless**: anyone can create a vault
3. Faucet: **0.1 of each mock token** per account per hour
4. Gacha price: **0.1 NEAR per pull** (10-pull = 0.9 NEAR); basket USD ranges scale down to match

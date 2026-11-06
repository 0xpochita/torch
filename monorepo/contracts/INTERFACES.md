# Torch testnet interfaces (shared contract for all workers)

Every contract, the indexer and the web app code against exactly these names. If a worker
needs to change anything here, ask the coordinator first.

Amounts are strings (`U128`) in JSON. NEAR amounts are yoctoNEAR. Time is milliseconds.

## Accounts

| Id | Contract |
| --- | --- |
| `torchvault.testnet` | deployer / admin / fee receiver |
| `nft.torchvault.testnet` | collection |
| `<token_id>.nft.torchvault.testnet` | vault (global contract by code hash) |
| `market.torchvault.testnet` | marketplace |
| `gacha.torchvault.testnet` | gacha |
| `tusdc`, `tusdt`, `tbtc`, `teth`, `thot`, `trhea`, `tlinear`, `tstnear`, `tzec`, `taurora`, `tnpro`, `tdragon`, `tshitzu`, `tsweat` + `.torchvault.testnet` | mock NEP-141 |

wNEAR: existing `wrap.testnet`.

Mock token decimals: tusdc/tusdt 6, tbtc 8, everything else 18.

## Mock FT (`contracts/mock-ft`)

- `new(owner_id, metadata: FungibleTokenMetadata)`
- NEP-141 + NEP-145 + NEP-148 (near-contract-standards)
- `faucet()` payable: registers storage for the caller if needed (attach ≥ 0.00125 NEAR, rest refunded), mints `0.1` token (`10^(decimals-1)`), at most once per account per 3_600_000 ms; panics `"faucet: wait"` otherwise
- `mint(account_id, amount)` owner only (for funding the gacha treasury)
- view `faucet_next_at(account_id) -> u64` (ms, 0 if available now)

## Collection (`contracts/collection`) on `nft.torchvault.testnet`

NEP-171 core, NEP-177 metadata, NEP-178 approvals, NEP-181 enumeration, NEP-199 payout.

`TokenMetadata.extra` is a JSON string:

```json
{ "basket": [{ "token": "tusdc.torchvault.testnet", "weight": 40 }], "bg": "#9fd3ff", "category": "Blue Chip", "creator": "alice.testnet", "rarity": null }
```

`rarity` is `null` | `"Common"` | `"Rare"` | `"Epic"` | `"Legendary"` (set only by gacha mints).

Methods:

- `new(owner_id, vault_code_hash: Base58CryptoHash, metadata: NFTContractMetadata)`
- `mint(metadata: TokenMetadata, receiver_id: Option<AccountId>) -> Promise<TokenId>` payable, attach ≥ `0.11 NEAR` (`MINT_DEPOSIT`); **permissionless**; token ids are sequential `"0"`, `"1"`, …; creates `<id>.nft.torchvault.testnet` (CreateAccount + Transfer + UseGlobalContract(hash) + FunctionCall `new`) then mints in `on_vault_created` to `receiver_id.unwrap_or(predecessor)`; refunds on failure
- `withdraw(token_id, ft_id, amount: U128)` owner only, 1 yocto; vault sends `amount` of `ft_id` to the current owner; locks the token until `on_vault_op`
- view `vault_of(token_id) -> AccountId`
- view `is_locked(token_id) -> bool`
- royalty: `nft_payout` / `nft_transfer_payout` give **2.5%** to `extra.creator`, rest to owner

Invariants I1–I9 from `skills/near-nft-account/SKILL.md` are mandatory (no keys on vaults, lock during withdraw / transfer_call, listed token cannot withdraw, etc.).

## Vault (`contracts/vault`)

- `new(collection_id)` callable only by the collection
- `ft_on_transfer(sender_id, amount, msg) -> U128("0")` accepts every NEP-141 deposit; logs `vault_deposit`
- `withdraw(ft_id, amount, receiver_id) -> Promise` collection only
- Deposits: the client calls `ft_transfer_call` on the token with `receiver_id = <id>.nft.torchvault.testnet` after `storage_deposit` for the vault on that token

## Market (`contracts/market`) on `market.torchvault.testnet`

Fee **2%** of the sale price to `torchvault.testnet`. Royalties come from `nft_transfer_payout`.

Approval message (`nft_approve(token_id, "market.torchvault.testnet", msg)`):

- list: `{"list":{"price":"<yocto>"}}`
- accept an offer in one tx: `{"accept_offer":{"buyer_id":"<account>"}}`

Methods:

- `nft_on_approve(token_id, owner_id, approval_id, msg)` (called by collection)
- `buy(token_id)` payable, attached == listing price
- `delist(token_id)` seller only
- `offer(token_id, expires_at: u64)` payable, escrows the attached NEAR; one live offer per (token, buyer), a new one replaces and refunds the old
- `cancel_offer(token_id)` buyer, refunds
- `refund_expired(token_id, buyer_id)` anyone, refunds an expired offer
- views: `get_listing(token_id)`, `get_listings(from_index, limit)`, `get_offers(token_id)`, `get_offers_by_buyer(account_id)`

Listing JSON: `{ "token_id", "seller_id", "price", "approval_id", "listed_at" }`.
Offer JSON: `{ "token_id", "buyer_id", "amount", "expires_at", "created_at" }`.

## Gacha (`contracts/gacha`) on `gacha.torchvault.testnet`

- `new(owner_id, collection_id, price_per_pull: U128 /* 0.1 NEAR */, pity: u32 /* 50 */, tiers: Vec<Tier>)`
- `Tier { rarity: String, weight_bps: u32 /* Common 6000, Rare 2800, Epic 1000, Legendary 200 */, baskets: Vec<Basket> }`
- `Basket { name, category, bg, items: Vec<{ token: AccountId, amount: U128 }> }`
- `pull(count: u8)` payable: `count` ∈ {1, 10}; price = 0.1 NEAR × count, 10-pull = 0.9 NEAR; rolls each pull with `env::random_seed()` mixed with the pull index; per-account pity (Legendary guaranteed when the counter reaches `pity`, then resets); for each result calls `collection.mint(metadata, receiver_id = player)` attaching `MINT_DEPOSIT` from the gacha's own NEAR balance (the pull price does not cover it on testnet; the admin pre-funds NEAR), then `storage_deposit` + `ft_transfer_call` from the treasury into the new vault
- treasury: admin funds tokens with `ft_transfer_call(receiver = gacha, msg = "fund")`; `pull` refunds the player if the treasury cannot cover the chosen basket
- views: `get_pity(account_id) -> u32`, `get_config()`, `get_treasury() -> Vec<(AccountId, U128)>`

## Events (NEP-297, `"standard": "torch"`, `"version": "1.0.0"`)

Emitted only in success paths (callbacks after the action resolved). `data` is always an array.

| Contract | event | data fields |
| --- | --- | --- |
| collection | `vault_created` | `token_id, vault_id, owner_id, creator, extra` |
| vault | `vault_deposit` | `token_id, ft_id, amount, sender_id` |
| collection | `vault_withdraw` | `token_id, ft_id, amount, owner_id` |
| market | `list` | `token_id, seller_id, price` |
| market | `delist` | `token_id, seller_id` |
| market | `sale` | `token_id, seller_id, buyer_id, price, fee` |
| market | `offer` | `token_id, buyer_id, amount, expires_at` |
| market | `offer_cancel` | `token_id, buyer_id, amount` |
| market | `offer_accept` | `token_id, seller_id, buyer_id, amount` |
| gacha | `gacha_pull` | `player_id, token_id, rarity, pity_after, price` |

Standard `nep171` events (`nft_mint`, `nft_transfer`) come from near-contract-standards.

## API (`apps/api`, default port 8787)

SQLite file `apps/api/data/torch.db` (gitignored). Endpoints listed in `plan.md` Phase 3.

## Wave 1 deltas (binding, 6 Nov)

- Market init: `new(collection_id, fee_receiver_id)`. `get_listings(from_index: Option<U128>, limit: Option<u64>)`. Offers need ≥ 0.01 NEAR. Royalty is 2.5% of the 98% balance after the fee. Gas: `buy` ~200 Tgas, `nft_approve` with `accept_offer` ~250 Tgas. Market account needs a small NEAR balance.
- Collection `mint` must resolve to the **token id as a JSON string** (gacha depends on it). Wave 1 returns `Promise` → `on_vault_created -> bool`; wave 2 changes the callback to return `Option<TokenId>` (`null` on failure).
- Collection overwrites `extra.creator` with the minting caller, so gacha mints credit `gacha.torchvault.testnet`; rarity is only trusted when `creator == gacha` (indexer + UI must check this).
- Gacha: the wave-1 worker measured a 10-pull at ~1 PGas attached; verify the real testnet max prepaid gas per tx, and if 10 pulls do not fit, split into batches inside the contract (or cap count to what fits) and document it. Baskets ≤ 3 items; a failed mint does not roll back pity.
- Vault wasm ≈ 104 KB: publishing it as a global contract costs ≈ 10 NEAR on testnet. Total deploy budget estimate ≈ 25–30 NEAR.
- Cargo workspace: `monorepo/contracts/Cargo.toml` with `members = ["*"]`, `exclude = ["target"]`; test-only mock crates live under each crate's `tests/`.

## Wave 2 market changes (binding, after audit H-1/H-2/H-3)

- `offer(token_id, amount: U128, expires_at: u64 /* ≤ now + 365 d */, min_balances?: [{ ft_id, amount: U128 }] /* max 4 */)` attaching `amount + offer_storage_cost()` (≈ 0.02 NEAR, excess refunded). token_id must be digits only, ≤ 20 chars. The UI pins every basket token at its current vault balance.
- Accept msg: `{"accept_offer":{"buyer_id","amount"}}`; must equal the live offer amount. Accept checks `ft_balance_of(vault) ≥ min_balances` before `nft_transfer_payout`.
- `delist` and `cancel_offer` need 1 yocto. UI calls `nft_revoke` together with `delist`.
- New: `prune_listing(token_id)` (anyone, ~50 Tgas), view `offer_storage_cost() -> U128`.
- `get_offers(token_id, from_index?, limit?)`, `get_offers_by_buyer(account_id, from_index?, limit?)`, default limit 50.
- Offer JSON adds `storage_deposit`, `min_balances`. Events: `offer` adds `created_at`, `min_balances`; `offer_cancel` and `offer_accept` add `created_at`. Refunds return `amount + storage_deposit`.

## Wave 2 contract changes (binding)

- `collection.mint` resolves to the token id string, or `null` on failure (refund unchanged).
- Gacha: `gacha_pull` fires after the vault is funded. New event `gacha_fund_failed { player_id, token_id, ft_id, amount }`, one per failed item, when funding failed and the items went back to the treasury. 1-pull needs ≥ 97 Tgas, 10-pull ≥ 950 Tgas (attach 1 PGas = testnet max). Wallets that cap gas below 1 PGas cannot send a 10-pull.
- Vault `ft_on_transfer` accepts any NEP-141 (unchanged); the gacha treasury `ft_on_transfer` accepts only configured basket tokens.
- Collection caps approvals at 16 per token (re-approving an already-approved account is exempt); `nft_transfer_call` gives `nft_resolve_transfer` 15 Tgas.
- Gacha extra events: `gacha_fund_unknown { player_id, token_id, ft_id, amount }` (transfer result unreadable, treasury not credited) and `gacha_mint_unreadable { player_id, rarity, result }`. Owner-only `resync_treasury(token) -> U128` (~50 Tgas) resets a treasury entry from `ft_balance_of`.

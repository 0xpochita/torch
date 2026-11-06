---
name: near-nft-account
description: >
  Build NFTs that are accounts on NEAR: a NEP-171 collection where every token owns a vault
  sub-account (`<token_id>.<collection>`) holding NEP-141 tokens, so selling the NFT sells the
  inventory. Covers the collection + vault contracts (near-sdk 5.30, near-contract-standards),
  global-contract deployment, how control passes on transfer, the seller threat model
  (in-flight withdrawals, listings, nft_transfer_call), NEP-199 payouts, events for
  per-NFT history, and the tests that prove it. Use for Torch's NFT ETF contracts or any
  "NFT owns money / inventory" design.
---

# NFT accounts (NFT = vault sub-account)

Working reference code, compiled and unit-tested against near-sdk 5.30:

- [`references/collection.rs`](references/collection.rs): NEP-171/177/178/181 + NEP-199 collection with vault binding and locks
- [`references/vault.rs`](references/vault.rs): the per-token vault

Pair with `near-smart-contracts` (general Rust patterns) and `near-contract-audit` (review).

## Model

```
torch.near                 collection: NEP-171 index, the ONLY authority over vaults
 ├── 0.torch.near          vault: holds NEP-141 balances, no access keys, obeys torch.near only
 ├── 1.torch.near
 └── ...
```

**Ownership lives in exactly one place: the collection's `owner_by_id`.** The vault stores no
owner. Every action that touches a vault goes through the collection, which checks the current
owner in the same receipt it acts in (the "invert the flow" rule from the sharded-NFT draft).
Transferring the NFT changes one map entry, and nothing in the vault needs to rotate or catch up.

Why a sub-account: only `torch.near` can create `*.torch.near` (protocol namespace rule), so
`vault_of(token_id)` is derivable offline and cannot be spoofed. It is also a real account that
can receive tokens from any wallet, exchange or contract.

## Invariants (each enforced in code)

| # | Invariant | Where |
| --- | --- | --- |
| I1 | A vault has **no access keys** and code that cannot change | created via `create_account` + `use_global_contract(hash)`, never `add_key` |
| I2 | A vault moves funds only when `predecessor == collection` | `Vault::assert_collection` |
| I3 | A vault can only be initialised by its collection, and never names itself | `Vault::new` |
| I4 | A token exists only if its vault exists | mint creates the vault first, mints in `on_vault_created` |
| I5 | Vault ops pay out to the owner **at call time**, and the token cannot move until the op resolves | `withdraw` → `lock` → `on_vault_op` unlock |
| I6 | A listed token (any NEP-178 approval) cannot be withdrawn from | `is_listed` check in `withdraw` |
| I7 | A token in `nft_transfer_call` is locked until `nft_resolve_transfer` | `nft_transfer_call` locks, resolver unlocks |
| I8 | Locked tokens cannot be transferred, sold (`nft_transfer_payout`) or approved | `assert_unlocked` |
| I9 | Unlock callbacks never panic | `on_vault_op` and the resolver remove the lock before anything else |

## Transfer threat model: how a seller tries to keep the money

| Attack | Stopped by |
| --- | --- |
| Keep a key on the vault account | I1. Check with `near account list-keys 0.torch.near`: the list must be empty. |
| Call the vault directly after selling | I2 |
| Deploy a look-alike vault and get it listed | Sub-account namespace: only the collection can create `*.torch.near`. Clients derive the vault id from `token_id`. |
| Start a withdraw, then sell in the same block (async receipts) | I5 + I8. The sale fails with "token busy". The withdraw completes to the seller, and the buyer sees the lower balance before buying. |
| List at full NAV, drain the vault, let the sale fill | I6. Withdrawing requires revoking approvals first, which cancels the listing. |
| `nft_transfer_call` to an accomplice that drains the vault in `nft_on_transfer`, then returns `true` to bounce the NFT back | I7 |
| Re-use an old marketplace approval after the sale | NEP-178: `internal_transfer` clears approvals on every transfer. |
| Old owner's per-owner settings (auto-withdraw address) survive the sale | Do not store per-owner config. If you add it, key it by `(token_id, owner_id)` or clear it in every transfer path. |
| Admin upgrades the vault code to sweep funds | Use the global contract **by hash** (immutable). By account id, the publisher can replace all vaults. |
| Vault keeps a refund from a failed `ft_transfer_call` somewhere else | Refunds return to the sender, which is the vault itself. |

Known ceiling: if a callback ever runs out of gas, the token stays locked. Callbacks get a fixed
`GAS_CALLBACK` and do O(1) work. An admin `force_unlock` after a timeout is the upgrade path if
that ever proves insufficient.

## Mint flow

```
user ──mint{metadata} + ≥0.11 NEAR──▶ collection
  collection ──batch: CreateAccount, Transfer, UseGlobalContract(hash), FunctionCall new──▶ <id>.collection
  collection ◀── on_vault_created ── success? internal_mint (owner = minter) : refund minter
```

The batch is atomic: if `new` fails, the account is never created and its NEAR comes back. The
collection keeps `MINT_STORAGE` for the token's own storage.

After mint, fund the basket by sending tokens straight to the vault (`ft_transfer_call` to
`vault_of(id)`, or swap with the vault as receiver). The vault accepts any NEP-141 in
`ft_on_transfer`. Remember `storage_deposit` for the vault on each token contract first.

## Per-NFT history

Standard NEP-297 events come for free: `nft_mint`, `nft_transfer` (emitted by
`near-contract-standards`). Emit your own for vault activity so the frontend/indexer can build
"what it earned, what it paid out, who held it":

```rust
// EVENT_JSON:{"standard":"torch","version":"1.0.0","event":"vault_withdraw","data":[{"token_id":"0","ft_id":"usdc.near","amount":"5","owner_id":"alice.near"}]}
env::log_str(&format!("EVENT_JSON:{}", near_sdk::serde_json::json!({
    "standard": "torch", "version": "1.0.0", "event": "vault_withdraw",
    "data": [{ "token_id": token_id, "ft_id": ft_id, "amount": amount, "owner_id": owner_id }],
})));
```

Emit in the **callback**, only on success, so the history never shows a withdraw that failed.

## Deploy

```bash
# 1. publish vault code once, immutable, by hash
cargo near build non-reproducible-wasm   # in contracts/vault
near contract deploy-as-global use-file target/near/vault.wasm as-global-hash torch.testnet \
  network-config testnet sign-with-keychain send
# note the code hash printed (base58)

# 2. deploy + init collection
near contract deploy torch.testnet use-file target/near/collection.wasm \
  with-init-call new json-args '{"owner_id":"torch.testnet","vault_code_hash":"<base58>","metadata":{"spec":"nft-1.0.0","name":"Torch","symbol":"TORCH"}}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send

# 3. remove the collection's own full-access key once stable (optional, strongest guarantee)
```

Global contracts need protocol support on the target network (mainnet and testnet have it). If
your local sandbox is older, deploy the vault wasm per account in tests instead
(`.deploy_contract(code)` in place of `.use_global_contract(hash)`).

## Tests that must exist

Unit tests (already in `references/collection.rs`, run with `cargo test`):

- vault id is `<token_id>.<collection>`
- transfer rejected while a withdraw is in flight
- **`nft_transfer_payout` (a marketplace sale) rejected while a withdraw is in flight**
- after the callback unlocks, transfer works
- withdraw blocked while listed
- previous owner cannot withdraw after a sale
- `nft_transfer_call` locks the token until resolved

Sandbox (near-workspaces) tests to add for the full path:

1. mint creates `0.collection` and `list-keys` on it is empty
2. deposit FT to the vault → `ft_balance_of(vault)` matches
3. owner `withdraw` + marketplace `nft_transfer_payout` submitted in the same block: exactly one
   of them succeeds, and the buyer receives the NFT only with the post-withdraw balance
4. after the sale, the old owner's `withdraw` fails, and the new owner's succeeds
5. calling `vault.withdraw` directly from any account but the collection fails

## Common mistakes

- Storing `owner_id` in the vault too. Now two sources of truth diverge on every transfer.
- Minting before the vault exists (a token without an account) or creating the vault without minting (orphan funds).
- Using `internal_mint` inside a callback. It refunds from `attached_deposit`, which is 0 in callbacks, and panics. Use `internal_mint_with_refund(.., None)`.
- Forgetting to lock in `nft_transfer_call`, or forgetting to override `nft_transfer_payout`. Every path that moves the token must check the lock.
- Panicking in an unlock callback. The lock is then permanent.
- `use_global_contract_by_account_id` for vaults that hold money. The publisher can swap the code under every vault.
- Trusting `collection_id` reported by a vault. Pin the collection in your own config and derive the vault id from it.

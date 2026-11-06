# Torch contracts security audit (wave 2)

Scope: `mock-ft`, `collection`, `vault`, `market`, `gacha` at `integration` (b181a19). The
review was read-only and followed `skills/near-contract-audit` (detector table, phases 1–4) and
`skills/near-nft-account` (invariants I1–I9, transfer threat model). Binding interface:
`INTERFACES.md`, including "Wave 1 deltas".

Reproductions live in `audit-tests/` (a new crate, a workspace member). Every reproduction
asserts the **safe** behaviour, so it **fails until the finding is fixed**:

```bash
cd monorepo/contracts
cargo test -p audit-tests --test market_unit                  # H-3
# Sandbox; set NEAR_SANDBOX_BIN_PATH to a cached near-sandbox 2.14 binary to skip the download.
cargo test -p audit-tests --test sandbox -- --test-threads 2  # C-1, H-1, H-2, I9 check
```

Result at b181a19: `c1_…`, `h1_…`, `h2_…` and `h3_…` FAIL (they reproduce the findings).
`i9_transfer_call_revert_unlocks_with_many_approvals` PASSES (it is a regression guard for L-1).

## Summary

| Id | Severity | Contract | Title | Repro |
| --- | --- | --- | --- | --- |
| C-1 | Critical | gacha × collection | Gacha treats every real mint as failed: free NFT, refunded price, unfunded vault, pity still advances | `sandbox::c1_gacha_pull_against_real_collection_funds_vault_and_keeps_price` |
| H-1 | High | market × collection | Offers are not bound to vault contents: the seller drains the vault, then accepts the full-price offer | `sandbox::h1_accepting_an_offer_after_draining_the_vault_must_fail` |
| H-2 | High | market | Unbounded `token_id` in `offer` lets 0.01 NEAR offers consume storage paid from other buyers' escrow and freeze refunds | `sandbox::h2_long_token_id_offers_must_not_freeze_other_buyers_escrow` |
| H-3 | High | market | Accept-offer message cannot pin the amount: the buyer swaps a big offer for 0.01 NEAR before `nft_on_approve` lands | `market_unit::h3_accept_offer_must_reject_an_offer_swapped_for_less` |
| M-1 | Medium | gacha | Failed vault funding is neither refunded nor put back in `treasury`, and `gacha_pull` is emitted before funding resolves; the player can cause it with low gas | argument |
| M-2 | Medium | market, gacha | Unbounded view scans (`get_offers`, `get_offers_by_buyer`, `get_treasury`) | argument |
| M-3 | Medium | gacha | Rarity comes from `env::random_seed`, known to the chunk producer | argument |
| M-4 | Medium | gacha | A 10-pull reserves ~0.9–1 PGas of static gas; must fit the target network's per-tx prepaid limit | argument |
| L-1 | Low | collection | `nft_resolve_transfer` runs on a fixed 5 Tgas (I9 ceiling) | passing guard `i9_…` |
| L-2 | Low | collection | `MINT_STORAGE` (0.02 NEAR) is at or under the worst-case per-token storage | argument |
| L-3 | Low | gacha | `ft_on_transfer` trusts `sender_id` from any predecessor; fake tokens grow `treasury` | argument |
| L-4 | Low | market | Stale listings and leftover approvals after failed buy/accept or `delist` | argument |
| L-5 | Low | market | `offer_cancel` for an in-flight offer shares its key with a newer live offer (indexer confusion) | argument |
| L-6 | Low | market | `delist` / `cancel_offer` do not require 1 yocto | argument |
| L-7 | Low | market, gacha | `u64` in JSON (`expires_at`, `created_at`, `listed_at`, `approval_id`) | argument |
| L-8 | Low | collection | Out-of-gas in `on_vault_created` leaves an orphan vault and no refund (I4) | argument |
| I-1…I-6 | Info | all | See the end of this file | — |

## Invariants and threat model status

| # | Invariant | Status | Evidence |
| --- | --- | --- | --- |
| I1 | Vault has no access keys, immutable code | OK | `collection/src/lib.rs:106-116` uses `create_account` + `use_global_contract(hash)`, no `add_key`; checked by `collection/tests/sandbox.rs` (`view_access_keys` empty, `GlobalHash`) |
| I2 | Vault moves funds only for the collection | OK | `vault/src/lib.rs:38-44,73-78` |
| I3 | Vault init only by the collection, not itself | OK | `vault/src/lib.rs:24-34` (called inside the creating batch) |
| I4 | Token exists only if its vault exists | OK, with L-8 | mint happens only in `on_vault_created` after `is_promise_success()` (`collection/src/lib.rs:139-147`) |
| I5 | Withdraw pays the owner at call time, token locked until resolved | OK | `collection/src/lib.rs:168-210` |
| I6 | Listed token cannot be withdrawn | OK for listings, **broken in spirit for offers (H-1)** | `collection/src/lib.rs:176-179`; offers create no approval |
| I7 | `nft_transfer_call` locks until resolve | OK | `collection/src/lib.rs:344-355,371-379` |
| I8 | Locked tokens cannot transfer / sell / approve | OK | `assert_unlocked` in `nft_transfer`, `nft_transfer_payout`, `nft_approve`; `lock()` in `withdraw` and `nft_transfer_call`. `nft_revoke*` are not gated, which is harmless (revoking only removes rights) |
| I9 | Unlock callbacks never panic | OK, with L-1 | `on_vault_op` and `nft_resolve_transfer` remove the lock first; revert path verified with 30 approvals |

| Threat (skill table) | Status |
| --- | --- |
| Key on vault | Stopped (I1) |
| Call vault directly | Stopped (I2) |
| Look-alike vault | Stopped: `vault_of` is derived from the collection id; indexer checks the executor (`apps/api/src/indexer.ts:36`) |
| Withdraw + sell in the same block | Stopped (I5 + I8) |
| List at full NAV, drain, let the sale fill | Stopped for listings (I6). **Not stopped for offers: H-1** |
| `nft_transfer_call` to an accomplice that drains | Stopped (I7) |
| Re-use old approval after sale | Stopped: standards clear approvals; market stores `approval_id` and the collection checks it |
| Per-owner settings survive a sale | N/A: none stored |
| Admin upgrades vault code | Stopped: global contract by hash |
| Refund lands elsewhere | OK: vault only uses `ft_transfer`; refunds return to the vault |

Also checked with no finding: every callback is `#[private]` (`on_vault_created`, `on_vault_op`,
`nft_resolve_transfer`, `on_buy`, `on_accept_offer`, `on_minted`); `nft_on_approve` checks the
predecessor; every `#[init]` is paired with `PanicOnDefault`; storage prefixes are distinct per
contract (the collection's 1-byte enum prefixes cannot collide with near-contract-standards'
32-byte-hash inner prefixes, since sequential token ids never reach the needed key length);
`near_sdk::store` collections are flushed with the contract state; the workspace release profile
has `overflow-checks = true` (the per-crate profiles in `market`/`gacha` are ignored by Cargo);
no floats. Payout math: `royalty = floor(balance × 250 / 10000)`, owner gets `balance − royalty`,
and the market's `fee = floor(price × 200 / 10000)`, `balance = price − fee`, so
`fee + Σpayout + rest = price` exactly with no lost dust (`collection/src/lib.rs:231-248`,
`market/src/lib.rs:354-388`). The indexer drops failed receipts (`apps/api/src/indexer.ts:186,202,226`),
so logs from receipts that later fail (for example LackBalanceForState) are not indexed.

---

## C-1 (Critical): gacha treats every real mint as failed

**Where:** `gacha/src/lib.rs:197-210` parses the `mint` result as a JSON string;
`collection/src/lib.rs:94,131-138,164` resolves `mint` to `on_vault_created -> bool`.

**What happens:** against the real collection, `promise_result` is `true`, `from_slice::<String>`
fails, and `on_minted` takes the failure branch. But the mint **did** succeed. Per pull:

- the player keeps the NFT and gets the full price back (`gacha/src/lib.rs:206-208`);
- the basket goes back into `treasury` and the vault is never funded;
- pity was already advanced in `pull` (`gacha/src/lib.rs:148,179`), so 50 free pulls give a free
  guaranteed Legendary NFT;
- the gacha pays `MINT_DEPOSIT` (0.11 NEAR) per pull from its own balance, so anyone can drain
  it at 0.11 NEAR per free pull until `spendable_near()` hits the reserve.

The gacha's own sandbox test uses a mock collection that returns a string
(`gacha/tests/mocks/collection/src/lib.rs:52-55`), which hid this.

**Exploit:** call `pull(1)` with 0.1 NEAR in a loop. Each call costs only gas.

**Repro:** `sandbox::c1_…` (real collection + vault + mock-ft + gacha). It fails with
`left: 0, right: 1000` (vault unfunded) at b181a19.

**Fix:** change `on_vault_created` to return `Option<TokenId>` (`Some(token_id)` on success,
`None` on failure) as the Wave 1 deltas require. This is in progress on the contracts branch
(`collection: mint resolves to the token id`); `c1_…` should pass once merged. Defence in depth
in the gacha: treat any result that is not `null` and not a string as a hard error that does
**not** refund (the NFT exists), and log it, rather than as "mint failed".

## H-1 (High): offers are not bound to vault contents

**Where:** `market/src/lib.rs:126-146` (accept path), `collection/src/lib.rs:168-190` (`withdraw`
requires only `!is_listed`).

**What happens:** I6 protects listings because a listing is an approval. An offer is not: the
token has no approval while the offer stands, so the owner can withdraw everything and **then**
accept with `nft_approve(market, {"accept_offer":{"buyer_id"}})`. The buyer's escrow pays full
price for an empty vault. Offers are placed against the NAV the buyer saw at offer time and can
stand for days.

**Exploit:** bob offers 5 NEAR on token 0 holding 1,000,000 tUSDC. Alice calls
`withdraw(0, tusdc, 1000000)`, waits for it to resolve, then approves the market with
`accept_offer`. Bob owns token 0 with an empty vault; alice keeps the 1,000,000 tUSDC and 97.5%
of 98% of 5 NEAR.

**Repro:** `sandbox::h1_…` fails with `bob paid 5 NEAR for token 0 but its vault was drained to 0`.

**Fix (concrete):**
1. Collection: keep `vault_nonce: LookupMap<TokenId, u64>`, increment it in `withdraw` (at lock
   time, so a pending withdraw also changes it) and expose `vault_nonce(token_id) -> u64`.
2. Market: `offer(token_id, expires_at, vault_nonce: u64)` stores the nonce the buyer saw.
3. Market accept path: pass it to `nft_transfer_payout` as `memo = Some(format!("vault_nonce:{n}"))`.
4. Collection `nft_transfer_payout`: if `memo` starts with `vault_nonce:`, require it to equal the
   current nonce, otherwise panic. The market then refunds or keeps the offer as it already does.

Deposits only add value, so only withdrawals need to invalidate offers. Until this ships, the UI
should show "vault changed since your offer" and default to short expiries.

## H-2 (High): long `token_id` offers freeze other buyers' escrow

**Where:** `market/src/lib.rs:195-223` (`offer` accepts any `token_id: String`), storage layout of
`IterableMap<(TokenId, AccountId), Offer>` (`market/src/lib.rs:78`).

**What happens:** `token_id` is unvalidated and stored three times (map key, key vector, and the
`Offer` value). With a ~1.9 kB id (the 2 kB storage-key limit is the only cap) one offer costs the
market ~6 kB ≈ 0.06 NEAR of storage stake for 0.01 NEAR escrowed. The market pays storage from its
**liquid balance, which includes every buyer's escrow**, so the stake is effectively funded by
other users' money. When storage exceeds the market's own free NEAR, any call that lowers the
balance fails with `LackBalanceForState`: `cancel_offer`, `refund_expired` and the replacement
refund in `offer` no longer work for honest buyers. The `MIN_OFFER` comment ("offers pay for
their own storage many times over") holds only for short ids. The attacker can later cancel and
recover all of their escrow, so the attack costs only gas.

**Exploit:** with the market 0.3 NEAR above its stake and bob's 1 NEAR offer escrowed, mallory
places 20 offers of 0.01 NEAR with 1,902-byte token ids. Bob's `cancel_offer` then fails with
`LackBalanceForState { account_id: market.test.near, amount: 0.29 NEAR }`.

**Repro:** `sandbox::h2_…` fails at b181a19 with exactly that error.

**Fix:** validate ids the collection can actually produce:
`require!(!token_id.is_empty() && token_id.len() <= 20 && token_id.bytes().all(|b| b.is_ascii_digit()), "bad token id")`
in `offer`, plus `cancel_offer`/`refund_expired` for symmetry. Also charge storage explicitly:
measure `env::storage_usage()` before and after the insert and require
`attached ≥ MIN_OFFER + bytes × storage_byte_cost`, escrowing only the remainder. Keep a fixed
NEAR reserve on the market account (deploy note) so escrow is never used as stake.

## H-3 (High): accept-offer cannot pin the amount (offer swap front-run)

**Where:** `market/src/lib.rs:53-56` (`AcceptOffer { buyer_id }`), `126-139`, and `195-213`
(`offer` silently replaces a live offer).

**What happens:** the seller signs `nft_approve(.., msg = {"accept_offer":{"buyer_id":"bob"}})`
after seeing bob's 100 NEAR offer. `nft_on_approve` executes at least one block later on the
market's shard. If bob calls `offer(token_id, ..)` with 0.01 NEAR in between, the old offer is
refunded and the sale settles at 0.01 NEAR. If the buyer's account is on the market's shard,
their transaction becomes a local receipt, and the chunk processes local receipts before incoming
cross-shard ones. A bot watching the collection can therefore win this race. Even without a bot,
nothing stops the buyer from lowering the offer at any time before the seller's approval lands. Unknown JSON fields are ignored, so even a seller who
adds `"amount"` is not protected.

**Repro:** `market_unit::h3_…` (pure unit test: offer 100 NEAR, replace with 0.01 NEAR, then
`nft_on_approve` with `amount` = 100 NEAR in the msg). It expects a panic and gets none.

**Fix:** make it `AcceptOffer { buyer_id: AccountId, amount: U128 }` and
`require!(offer.amount == amount, "offer changed")` (optionally also an `expires_at`/`created_at`
match). Add `#[serde(deny_unknown_fields)]` on `ApproveMsg` so client typos fail loudly. The web
app must put the displayed amount into the msg.

## M-1 (Medium): failed vault funding leaks treasury and emits `gacha_pull` early

**Where:** `gacha/src/lib.rs:215-250`, comment at `186-187`; gas at `17-21,151-155,166-167`.

Each item is a detached `storage_deposit` + `ft_transfer_call` batch. If that batch fails, the FT
refunds the gacha, but `treasury` was already debited in `pull` and is never credited back. The
player paid and holds an empty or partly funded vault, and `gacha_pull` (with the rarity) has
already been logged in the same receipt, before funding resolved. That breaks "events only on
success". The player controls the trigger: attaching just enough gas to `pull` leaves
`on_minted` with almost only its static gas (5 + 15 Tgas per item). The inner
`ft_transfer_call` then gets ~12 Tgas, out of which the FT reserves 5 Tgas for its resolver, and
the vault's `ft_on_transfer` (a ~100 KB global contract to load) may run out of gas. On failure
`ft_resolve_transfer` returns the tokens to the gacha's FT balance, outside `treasury`, where no
method can reach them.

**Fix:** chain `.then(Self::ext(..).on_funded(player, token_id, item))` after each batch. In
`on_funded`, on failure credit `treasury[item.token] += amount` (or retry once) and emit
`gacha_pull` only after all items succeed (or emit `gacha_fund_failed`). Require
`env::prepaid_gas()` in `pull` to be at least the full static budget plus a margin, and raise
`GAS_FT_TRANSFER_CALL` to ≥ 30 Tgas. Add an owner-only `resync_treasury(token)` that reads
`ft_balance_of(self)` and sets `treasury` from it.

## M-2 (Medium): unbounded view scans

`market/src/lib.rs:322-338` scans all offers on every `get_offers`/`get_offers_by_buyer`. Offers
are permissionless (H-2), so a few thousand 0.01 NEAR offers (refundable) push these views past
the RPC view gas limit and the UI loses offer data. `gacha/src/lib.rs:280-285` has the same issue
with L-3. **Fix:** add per-token and per-buyer indexes
(`LookupMap<TokenId, IterableSet<AccountId>>`, `LookupMap<AccountId, IterableSet<TokenId>>`) and
paginate (`from_index`, `limit`), or serve these from the indexer only.

## M-3 (Medium): predictable randomness

`gacha/src/lib.rs:127,133`: `env::random_seed_array()` is per receipt, but the chunk producer
knows the block's random value before it publishes the chunk and can include or delay a player's
`pull` receipt. Pulls cannot be reverted by the player (they commit in one receipt), so ordinary
users cannot cherry-pick. A validator can. This is acceptable for testnet. **Fix for mainnet:**
commit-reveal (player commits `hash(secret)` in `pull`, rolls happen in a later block using
`secret ⊕ random_seed`) or an external VRF.

## M-4 (Medium): 10-pull gas budget

`gacha/src/lib.rs:17-21,151-176`: each pull reserves 40 Tgas (mint) + 5 + 15×items (callback),
so a 10-pull with 3-item baskets reserves 900 Tgas of static gas before `pull`'s own execution.
It works in sandbox 2.14 with 1 PGas attached (gacha sandbox test). Per the Wave 1 deltas the
real testnet per-tx prepaid limit must be confirmed. If it is 300 Tgas, every 10-pull panics
(safely, with the deposit refunded, but the feature does not work). **Fix:** confirm the limit.
If it is too low, cap the batch with
`count × (GAS_MINT + callback) + margin ≤ env::prepaid_gas()` and fall back to fewer pulls with a
refund, or split the 10-pull into a self-call chain.

## L-1 (Low): `nft_resolve_transfer` runs on a fixed 5 Tgas

near-contract-standards schedules the resolver with `with_static_gas(5 Tgas)` and
`with_unused_gas_weight(0)` (near-contract-standards 5.30.1 `core_impl.rs:407-411`). The
override at `collection/src/lib.rs:364-379` adds a storage remove. If the revert path ever
exceeds 5 Tgas, the token stays locked with the receiver forever (I9). Sandbox shows the revert
path succeeding with 30 approvals (`i9_…` passes). Larger approval sets are self-inflicted (the
owner pays for each). **Fix (if needed):** override `nft_transfer_call` to build the promise
itself with ≥ 15 Tgas for the resolver, or add an owner-or-admin `force_unlock(token_id)` that
works only when `locked` is set and `owner_by_id` equals the lock's recorded receiver after a
timeout.

## L-2 (Low): `MINT_STORAGE` margin

`collection/src/lib.rs:23-27`: 0.02 NEAR covers 2,000 bytes. A max-size mint (1,200 bytes of
borsh metadata) to a new owner stores the metadata, plus `owner_by_id` (TreeMap: node and value),
plus the per-owner `UnorderedSet` (map entry, index, element, length), plus 40 bytes of overhead
per record, which comes to roughly 1.9–2.1 kB. Approvals are paid separately by `nft_approve`.
The worst case can slightly overdraw the collection's own balance, which is not profitable to
attack (0.11 NEAR per mint). **Fix:** measure `env::storage_usage()` before and after
`internal_mint_with_refund` in `on_vault_created`, and require it to be ≤ `MINT_STORAGE`
(refund the difference), or lower `MAX_METADATA_BYTES` to 1,000.

## L-3 (Low): gacha `ft_on_transfer` trusts any predecessor

`gacha/src/lib.rs:254-264`: `sender_id` is an argument chosen by the calling contract. Any
contract (or any account calling directly) can pass `sender_id = owner, msg = "fund"` and add an
arbitrary `treasury` entry keyed by itself. Fake entries are never used by baskets, but they
grow storage paid by the gacha and the `get_treasury` view (M-2). **Fix:** accept only tokens
that appear in some tier's baskets (`tiers.iter().flat_map(|t| &t.baskets).flat_map(|b| &b.items).any(|i| i.token == predecessor)`).

## L-4 (Low): stale listings and leftover approvals

`market/src/lib.rs:178-190` (`delist` does not revoke the collection approval),
`250-262` (`buy` failure removes the listing but leaves the approval), and `279-288` (an accept
failure leaves the approval). A leftover approval keeps `is_listed` true, so the owner's
`withdraw` fails until they call `nft_revoke`. Listings for tokens transferred elsewhere stay in
`get_listings`, and buyers pay gas on doomed `buy` calls. **Fix:** the UI calls `nft_revoke`
together with `delist` (or the market documents it). The indexer marks listings stale on any
`nft_transfer` for that token. Optionally add a permissionless `prune_listing(token_id)` that
calls `nft_is_approved(token_id, market, approval_id)` and removes the listing on `false`.

## L-5 (Low): ambiguous `offer_cancel`

`market/src/lib.rs:280-284`: when an accept fails after the buyer already placed a new offer on
the same token, the in-flight offer is refunded and `offer_cancel` is emitted for
`(token_id, buyer_id)`. That is the key of the new live offer, so an indexer keyed on it deletes
the live offer. **Fix:** add `created_at` to `offer_cancel` (and `offer`) data, and key indexer
rows on `(token_id, buyer_id, created_at)`.

## L-6 (Low): no 1 yocto on `delist` / `cancel_offer`

`market/src/lib.rs:178,225`: a function-call access key (for example a dApp login key for the
market) can delist or cancel offers. Funds go back to the buyer, so this is griefing only.
**Fix:** `#[payable]` + `assert_one_yocto()`.

## L-7 (Low): `u64` in JSON

`expires_at`, `created_at`, `listed_at`, `approval_id` (`market/src/lib.rs:28-44,195`) are JSON
numbers. A buyer can set `expires_at` above 2^53 (the unit test uses `u64::MAX`), which
JavaScript rounds. **Fix:** cap `expires_at ≤ now + 365 days` in `offer`, or use `U64`. Changing
the type changes INTERFACES.md, so ask the coordinator first.

## L-8 (Low): orphan vault if `on_vault_created` runs out of gas

`collection/src/lib.rs:117-127,130-165`: the callback has 15 Tgas static plus a share of the
leftover gas. If it fails, the vault account exists with 0.09 NEAR, no token is minted and the
minter is not refunded (I4 holds in the sense that no token lacks a vault, but there is an orphan
vault). The gacha attaches only 40 Tgas to `mint`. Sandbox passes today. **Fix:** require
`env::prepaid_gas() ≥ GAS_VAULT_INIT + GAS_CALLBACK + 15 Tgas` in `mint`, and raise
`GAS_CALLBACK` to 25 Tgas to cover 1.2 kB metadata, enumeration and two events.

## Informational

- **I-1** `vault/src/lib.rs:38-44`: `ft_id` is not validated, so the owner can make the vault call
  `ft_transfer(owner, amount)` with 1 yocto on any contract. This needs the NFT owner and only
  spends the vault's own 1 yocto per call. Accepted.
- **I-2** `vault/src/lib.rs:48-65`: anyone can call `ft_on_transfer` directly and log a
  `vault_deposit` with `ft_id` = themselves. The indexer checks only the executor
  (`apps/api/src/indexer.ts:36`), so fake `ft_id`s show up in a token's history and holdings
  (`apps/api/src/app.ts:109-111`). They cannot impersonate a real token. **Fix (API):** count
  `vault_deposit` only when `d.ft_id ∈ cfg.ftIds`.
- **I-3** Rarity spoofing: anyone can mint with `extra.rarity = "Legendary"`. The collection
  overwrites `creator`, so only `creator == gacha` is trustworthy (Wave 1 delta). UI and indexer
  must check it.
- **I-4** Gacha has no owner withdraw for NEAR revenue or royalties (it receives 2.5% of every
  resale of gacha NFTs). Only the account's full-access key can move funds, and moving FT that
  way desyncs `treasury` (see M-1's `resync_treasury`).
- **I-5** `mock-ft` faucet: the contract pays ~100 bytes per faucet user (already noted in code).
  Testnet only.
- **I-6** All three economic contracts have no admin, pause or upgrade path. This is good for
  trust, but H-2-style storage exhaustion can only be fixed by sending NEAR to the market
  account; document that in the deploy runbook.

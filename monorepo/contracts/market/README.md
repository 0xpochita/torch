# Market (`market.torchvault.testnet`)

NEAR-priced listings and escrowed offers for the vault collection. Fee 2% to the fee receiver;
royalties (2.5% of the remaining 98%) come from the collection's `nft_transfer_payout`.

```bash
cargo test -p market                                   # unit + sandbox (mock-nft)
cargo test -p audit-tests --test sandbox -- h1 h2      # against the real collection + vault
```

## Interface

Init: `new(collection_id, fee_receiver_id)`.

### Listing and accepting through `nft_approve`

`nft_approve(token_id, "market.torchvault.testnet", msg)` on the collection, with `msg`:

| msg | Effect |
| --- | --- |
| `{"list":{"price":"<yocto>"}}` | creates or replaces the listing |
| `{"accept_offer":{"buyer_id":"<account>","amount":"<yocto>"}}` | sells to that buyer's offer. `amount` must equal the live offer's amount, or the call panics with `offer amount changed`. Unknown fields are rejected. |

Accepting needs ~250 Tgas on `nft_approve` (the accept path checks up to 4 vault balances
before settling).

### Methods

| Method | Deposit | Notes |
| --- | --- | --- |
| `buy(token_id)` | exactly the listing price | ~200 Tgas |
| `delist(token_id)` | **1 yocto** | seller only. Also call `nft_revoke(token_id, market)` on the collection, or the vault's `withdraw` keeps failing. |
| `prune_listing(token_id)` | — | anyone. Removes the listing if the collection no longer approves the market for its `approval_id`. ~50 Tgas |
| `offer(token_id, amount, expires_at, min_balances?)` | `amount + offer_storage_cost()` (any excess is refunded) | `token_id` is a collection id (digits only, ≤ 20 chars); `amount` ≥ 0.01 NEAR; `expires_at` is in ms and must be in the future and at most 365 days ahead; `min_balances` has at most 4 entries `{ "ft_id", "amount" }`. A new offer from the same buyer on the same token replaces the old one and refunds it. |
| `cancel_offer(token_id)` | **1 yocto** | buyer only. Refunds `amount + storage_deposit`. |
| `refund_expired(token_id, buyer_id)` | — | anyone, after `expires_at`. Refunds `amount + storage_deposit` to the buyer. |

Views:

- `get_listing(token_id)`, `get_listings(from_index?: U128, limit?: u64)`
- `get_offers(token_id, from_index?: U128, limit?: u64)`
- `get_offers_by_buyer(account_id, from_index?: U128, limit?: u64)`. Both offer views are
  indexed and paginated, with a default limit of 50.
- `offer_storage_cost() -> U128`: 2,000 bytes × the storage price, which is 0.02 NEAR today.

Offer JSON: `{ token_id, buyer_id, amount, expires_at, created_at, storage_deposit, min_balances: [{ ft_id, amount }] }`.

### Offer storage

Each offer escrows `offer_storage_cost()` on top of its amount. The market never pays for offer
storage out of its own balance or other buyers' escrow. The deposit goes back to the buyer when
the offer is cancelled, expires, is replaced, or is accepted (sent together with the sale).
The largest allowed offer uses about 1.3 kB, which the `h2` sandbox test measures. Listings
are still paid by the market (one per token at most), so the market account needs a small NEAR
reserve.

### Why `min_balances` (offers bound to vault contents)

An offer is not an approval, so the owner may withdraw from the vault while an offer stands. To
stop a seller from draining the vault and then accepting, the buyer pins the balances they are
paying for. On accept, the market calls `ft_balance_of(<token_id>.<collection>)` on each
`ft_id`. If any balance is below the floor, nothing is sold and the offer stays live; otherwise
it calls `nft_transfer_payout`. Nothing can be withdrawn between the check and the transfer:
the collection rejects `withdraw` while the market's approval exists and rejects approvals while
a withdraw is in flight. A revoke followed by a re-approve changes `approval_id`, so the pending
`nft_transfer_payout` fails. The UI should pin every basket token at its current vault balance
(deposits only add value). An empty `min_balances` means no protection.

Listings need no pin. A listed token has the market's approval, so its vault cannot be withdrawn
from (invariant I6). Revoking that approval invalidates the listing's `approval_id`, so `buy`
fails and refunds the buyer.

## Events (`standard: "torch"`)

`list`, `delist`, `sale` (unchanged). `offer` adds `created_at` and `min_balances`;
`offer_cancel` and `offer_accept` add `created_at`. Key offers in the indexer on
`(token_id, buyer_id, created_at)`.

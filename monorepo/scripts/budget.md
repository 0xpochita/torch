# Testnet NEAR budget

Storage staking on NEAR is 1 NEAR per 100 KB (10^19 yocto/byte). Publishing a global contract
costs 10x that (it is replicated on every shard). Wasm sizes are from
`cargo near build non-reproducible-wasm` on 6 Nov 2026.

| Wasm | Size |
| --- | --- |
| vault | 105 KB |
| collection | 287 KB |
| market | 213 KB |
| gacha | 180 KB |
| mock_ft | 175 KB |

## `deploy-testnet.sh` (paid by `torchvault.testnet`)

| Step | What | NEAR |
| --- | --- | --- |
| 2 | `nft` sub-account: 2.9 code + token state headroom | 3.5 |
| 2 | `market` sub-account: 2.1 code + listings/offers state | 2.5 |
| 2 | `gacha` sub-account: 1.8 code + tiers + pity map | 2.5 |
| 2 | 14 mock tokens × 2 (1.75 code + faucet users) | 28 |
| 3 | vault global contract by hash, 105 KB × 10^20 yocto/byte | ~10.5 |
| 4–5 | deploy + init txs (gas only, the code stake is in the balances above) | ~0.3 |
| 6 | `storage_deposit` gacha/market/root on 14 tokens: 42 × 0.00125 | 0.05 |
| 7 | treasury mint + `ft_transfer_call` × 14 (gas only, mock tokens are free) | ~0.2 |
| 8 | gacha NEAR for mint deposits (`GACHA_NEAR`, 0.11 + 0.00125/item per result ≈ 40 results) | 5 |
| 9 | "Deploy check" vault mint | 0.11 |
| | **Total** | **≈ 53 NEAR** |

Keep ~2 NEAR extra on the root for retries. This is above the 25–30 NEAR estimate in
`contracts/INTERFACES.md`: the 14 per-account mock token deploys (28 NEAR) dominate. If the faucet
budget is tight, either fund in rounds (the script is idempotent and resumes where it stopped) or
publish `mock_ft` once as a global contract (~17.5 NEAR) and point the token accounts at it,
which would cut step 2's tokens from 28 to ~2 NEAR (net saving ~8.5 NEAR; not implemented).

Top-ups later: each gacha result spends ~0.115 NEAR from the gacha's balance (the 0.1 NEAR pull
price stays in the contract and offsets most of it). Re-run with `GACHA_NEAR=<n>` or send NEAR
directly when pulls start getting refunded.

## `seed-testnet.ts` (paid by each creator account)

| What | NEAR per creator |
| --- | --- |
| `faucet` on the tokens its baskets use (≤ 7 × 0.00125 storage) | 0.01 |
| `near_deposit` on `wrap.testnet` for NEAR weights (storage 0.00125 + wrapped amount) | ≤ 0.05 |
| 2 vault mints × 0.11 | 0.22 |
| `storage_deposit` for each vault on each basket token (≤ 8 × 0.00125) | 0.01 |
| listing approvals (`nft_approve` attaches 0.01) | ≤ 0.02 |
| offers escrow (mock price / 2000: 0.81 + 0.365 NEAR, refundable, from the bidding creator) | ≤ 1.2 |
| gas | ~0.1 |
| **Total** | **< 2 NEAR** (a faucet-funded 10 NEAR account is plenty) |

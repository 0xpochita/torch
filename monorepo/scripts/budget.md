# Testnet NEAR budget

Storage staking on NEAR is 1 NEAR per 100 KB (10^19 yocto/byte). Publishing a global contract
costs 10x that (10^20 yocto/byte, it is replicated on every shard); an account that uses a global
contract by hash stakes only its own state, not the code. Sizes are from
`cargo near build non-reproducible-wasm` (wasm-opt `-O`, embedded ABI) on 6 Nov 2026.

| Wasm | Bytes | `--no-abi` | `--no-abi` + `wasm-opt -Oz` |
| --- | --- | --- | --- |
| vault | 105,140 | 104,128 | 103,795 |
| collection | 287,385 | 285,447 | 284,127 |
| market (wave 2: offer indexes, balance checks) | 254,631 | 252,625 | – |
| gacha | 180,373 | 179,086 | 178,086 |
| mock_ft | 174,590 | 173,116 | 172,491 |

Shrinking the wasm is not worth it: `--no-abi` + `-Oz` saves 1–5 KB per contract, about
**0.45 NEAR in total** (0.34 of it on the two global contracts), and drops the embedded ABI that
`near contract inspect` uses. The release profile is already `opt-level = "z"`, `lto`, `panic = "abort"`.
The size is near-contract-standards + serde, not our code.

## `deploy-testnet.sh` (paid by `torchvault.testnet`)

| Step | What | Before (NEAR) | Now (NEAR) |
| --- | --- | --- | --- |
| 2 | `nft` sub-account: 2.9 code + token state headroom | 3.5 | 3.5 |
| 2 | `market` sub-account: 2.55 code + listings state (offers pay their own storage) | 2.5 | 3 |
| 2 | `gacha` sub-account: 1.8 code + tiers + pity map | 2.5 | 2.5 |
| 2 | 14 mock token accounts: own code 14 × 2 → global code, state only 14 × 0.3 | 28 | 4.2 |
| 3 | vault global contract by hash, 105 KB × 10^20 | 10.5 | 10.5 |
| 3 | mock_ft global contract by hash, 175 KB × 10^20 | – | 17.5 |
| 4–5 | deploy + init txs (gas only; code stake is in the balances above) | 0.3 | 0.3 |
| 6 | `storage_deposit` gacha/market/root on 14 tokens: 42 × 0.00125 | 0.05 | 0.05 |
| 7 | treasury mint + `ft_transfer_call` × 14 (gas only, mock tokens are free) | 0.2 | 0.2 |
| 8 | gacha NEAR for mint deposits (`GACHA_NEAR`, ≈ 40 results at 0.115) | 5 | 5 |
| 9 | "Deploy check" vault mint | 0.11 | 0.11 |
| | **Total** | **≈ 53** | **≈ 47** |

Keep ~2 NEAR extra on the root for retries. 0.3 NEAR per token account covers its metadata and
~250 faucet users (the contract pays ~100 bytes per faucet user; users pay their own NEP-145 deposit).
The script is idempotent, so the root can be funded in rounds: it resumes where it stopped.

### Minimum-viable variants

The global mock_ft only pays off from 11 tokens up (17.5 + 0.3 n < 2 n ⇔ n > 10.3).

| Variant | Tokens | Total (NEAR) |
| --- | --- | --- |
| Current: 14 tokens on the global mock_ft | 14 | ≈ 47 |
| Same, `GACHA_NEAR=2` (≈ 17 gacha results before a top-up) | 14 | ≈ 44 |
| 8 tokens, each with its own mock_ft code (no mock_ft global), `GACHA_NEAR=2` | 8 | ≈ 37.5 |

Not implemented: 8 tokens means rewriting the gacha baskets and the 6 `lib/mock.ts` templates
(they use all 14), for ~6 NEAR less than the `GACHA_NEAR=2` row. Only worth it if the faucet budget
really caps out below ~45 NEAR.

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
| offers escrow (mock price / 2000: 0.81 + 0.365 NEAR) + `offer_storage_cost()` 0.02 each, all refundable, from the bidding creator | ≤ 1.25 |
| `prune_listing` demo (list, revoke, prune; the 0.01 approval deposit comes back on revoke) | gas only |
| gacha 10-pull (first creator only; spent, the gacha pays the mint deposits) | 0.9 |
| gas | ~0.1 |
| **Total** | **< 2.5 NEAR** (a faucet-funded 10 NEAR account is plenty) |

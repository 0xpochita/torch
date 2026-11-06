# Torch contracts

Cargo workspace: every folder here with a `Cargo.toml` is a member (`members = ["*"]`).
Method names, JSON shapes and events are fixed by [`INTERFACES.md`](INTERFACES.md).

| Crate | Account | What |
| --- | --- | --- |
| `mock-ft` | `t*.torchvault.testnet` | NEP-141 test token with an hourly `faucet` |
| `collection` | `nft.torchvault.testnet` | NEP-171/177/178/181/199; the only authority over vaults |
| `vault` | `<id>.nft.torchvault.testnet` | per-NFT basket, global contract by hash, no access keys |
| `market` | `market.torchvault.testnet` | NEAR listings + escrowed offers, NEP-199 payouts, 2% fee |
| `gacha` | `gacha.torchvault.testnet` | 1/10-pulls that mint vault NFTs and fund them from a treasury |
| `integration-tests` | – | sandbox tests deploying all of the above together (not a contract) |

Design and invariants I1–I9: `skills/near-nft-account/SKILL.md`. The collection caps approvals
at 30 per token, where audit-tests `i9` proves the fixed 5 Tgas `nft_resolve_transfer` revert
path still unlocks the token.

## Build

Needs Rust stable with `wasm32-unknown-unknown` and
[cargo-near](https://github.com/near/cargo-near) (`cargo near --version`).

```bash
cd monorepo/contracts
for c in vault collection mock-ft market gacha; do (cd $c && cargo near build non-reproducible-wasm); done
# -> target/near/{vault,collection,mock_ft,market,gacha}/*.wasm (wasm-opt'd, deploy these)
```

`cargo build --target wasm32-unknown-unknown --release` also works as a compile check, but
its output is not size-optimised. Vault size matters: publishing a global contract costs NEAR per
byte (about 10 NEAR for the ~104 KB vault).

## Test

```bash
cargo test --workspace                     # unit tests + sandbox tests
cargo test --workspace --lib               # unit tests only (fast, no sandbox)
cargo test -p integration-tests            # sandbox tests only
cargo test -p audit-tests                  # audit reproductions (all pass once fixed)
cargo test -p integration-tests --test gacha -- --nocapture   # prints the gas numbers
cargo clippy --workspace --all-targets -- -D warnings && cargo fmt --all --check
```

`integration-tests` builds every contract with `cargo near` (once per test binary), starts a
local near-sandbox (downloaded on first run), publishes the vault as a global contract by hash
and deploys the real mock-ft (x3), collection, market and gacha. There are no mock contracts.

| Test | Covers |
| --- | --- |
| `vault::create_deposit_withdraw` | `mint` resolves to the token id, key-less vault on the global hash, deposit, withdraw, only the owner and only through the collection, failed withdraw unlocks |
| `vault::withdraw_races_transfer` | withdraw and `nft_transfer` in the same block: exactly one wins |
| `vault::max_size_mint_fits_mint_storage` | a max-size token to a new 64-character owner stores 1,824 bytes, within the 0.02 NEAR the collection keeps; `on_vault_created` burns 3.0 of its 10 Tgas |
| `market::list_and_buy_pays_exact_fee_and_royalty` | exact NEAR deltas: 2% fee, 2.5% of the 98% to the creator, rest to the seller; basket moves with the NFT |
| `market::offer_then_accept` | wave-2 offer (`amount`, `min_balances`, `amount + offer_storage_cost()`), accept with `amount`, exact fee and royalty, storage deposit back to the buyer |
| `market::accept_after_draining_the_vault_fails` | audit H-1: withdraw below the buyer's pin, then accept: nothing sold, offer stays; H-3: accept with a different amount fails |
| `market::expired_offer_is_refundable_by_anyone` | expired offers cannot be accepted and refund `amount + storage_deposit` |
| `market::cancel_and_delist_need_one_yocto_and_prune_drops_stale_listings` | 1 yocto on `cancel_offer` / `delist`; `prune_listing` keeps a live listing and drops a stale one |
| `market::withdraw_loses_to_sale_while_listed` | withdraw vs. `buy` on a listed token: the sale wins with the full basket |
| `market::sale_fails_while_withdraw_in_flight` | stale listing + withdraw in flight: `buy` fails and refunds the buyer |
| `gacha::one_pull_and_ten_pull` | 1-pull, 1-pull at the minimum gas, and 10-pull at 960 Tgas mint to the player with the right baskets, `creator == gacha`, treasury and pity; an under-gassed 10-pull reverts whole |

## Gas

Testnet runs protocol 88, where `max_total_prepaid_gas` (and `max_gas_burnt`) is **1 PGas**
(raised from 300 Tgas in protocol 83; checked with `EXPERIMENTAL_protocol_config`).

Every callback's static gas covers its own burn, the execution fees it prepays for the receipts it
creates (`create_account` alone is 7.2 Tgas) and their static gas. So a step never depends on
leftover gas, and a caller who attaches the bare minimum cannot starve one. With less, the whole
call reverts and the deposit is refunded. Measured in the sandbox with 3-item baskets:

| Call | Attach | Minimum | Burnt in total |
| --- | --- | --- | --- |
| `gacha.pull(1)` | 300 Tgas | 97 Tgas | ~45 Tgas |
| `gacha.pull(10)` | **1000 Tgas** | 950 Tgas | ~447 Tgas |
| `collection.mint` | 100 Tgas | | |
| `market.buy` | 200 Tgas | | |
| `nft_approve` (list / accept offer) | 250 Tgas | | |
| `collection.withdraw` | 100 Tgas | | |

A 10-pull fits one transaction with 50 Tgas to spare, so the gacha processes all 10 pulls in one
call. `gacha::one_pull_and_ten_pull` runs it at 960 Tgas to guard that headroom. Per pull the
gacha reserves 30 (mint) + 12 (`on_minted`) + 5 (`on_funded`) + 15 per basket item, so baskets
must stay at 3 items or fewer. Wallets that cap prepaid gas below 1 PGas cannot send a 10-pull.

Static gas and sandbox burn (Tgas): collection `mint` 3.2 + 9.3 execution fees, vault `new` 5
(1.2), `on_vault_created` 10 (3.0 with max-size metadata to a new 64-character owner); gacha
`on_minted` 12 (3.8 + ~6 execution fees), `on_funded` 5 (1.6), per item `storage_deposit` 3 +
`ft_transfer_call` 12 (3.8 together; the FT reserves 5 for `ft_resolve_transfer`, 1.3, and the
vault's `ft_on_transfer` burns 1.3).

## Deploy

`scripts/deploy-testnet.sh` (near-cli-rs) deploys everything under `torchvault.testnet`
(`NEAR_ROOT_ID` to override). It is idempotent: each step checks chain state and skips what is
already done, so a run that stops halfway (e.g. out of NEAR) can simply be re-run. Budget: about
46.5 NEAR on the root (53 before mock_ft became a global contract), see
[`scripts/budget.md`](../scripts/budget.md). Full run order (fund, deploy, seed, API, web):
[`scripts/README.md`](../scripts/README.md).

```bash
cd monorepo
DRY_RUN=1 ./scripts/deploy-testnet.sh            # print the ordered plan; no network calls, no writes
NEAR_PRIVATE_KEY=ed25519:... ./scripts/deploy-testnet.sh
# without NEAR_PRIVATE_KEY the key is read from ~/.near-credentials/testnet/torchvault.testnet.json
```

Steps: build the five wasm files, create `nft` / `market` / `gacha` / 14 mock token sub-accounts
(holding the root's public key), publish the vault and mock_ft as global contracts **by hash** (the
base58 sha256 of each wasm), deploy the tokens with `use-global-hash` + `new`, deploy + init the
collection, market and gacha (tiers 60/28/10/2
from `scripts/gacha-tiers.mjs`, pity 50, 0.1 NEAR per pull), `storage_deposit` the gacha, market and
root on every token, mint the treasury to the root and `ft_transfer_call` it to the gacha with
`msg = "fund"`, send `GACHA_NEAR` (5) NEAR to the gacha for mint deposits, mint a "Deploy check"
vault and assert `near account list-keys 0.nft.torchvault.testnet` is empty, then write the ids to
`apps/web/.env.local` and `apps/api/.env` (`START_HEIGHT` only on the first run).

Knobs: `SKIP_BUILD=1`, `TREASURY_PULLS` (500 draws of every basket), `GACHA_NEAR`, `NEAR_RPC_URL`.

Demo data (6 template vaults from up to 3 creators, 4 listings, 2 offers, one gacha 10-pull):

```bash
cd monorepo/scripts && pnpm install --ignore-workspace
DRY_RUN=1 SEED_CREATORS=alice.testnet,bob.testnet,carol.testnet pnpm seed
SEED_CREATORS=alice.testnet,bob.testnet,carol.testnet pnpm seed --check   # read-only: what is missing
SEED_CREATORS="alice.testnet:ed25519:...,bob.testnet,carol.testnet" pnpm seed
```

CI: the "Deploy Contract" workflow is manual (`workflow_dispatch`, dry run by default) and uses
the GitHub environment `testnet` with secret `NEAR_PRIVATE_KEY`; it uploads the env files as an
artifact.

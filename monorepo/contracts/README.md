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

Design and invariants I1–I9: `skills/near-nft-account/SKILL.md`.

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
| `market::list_and_buy_pays_exact_fee_and_royalty` | exact NEAR deltas: 2% fee, 2.5% of the 98% to the creator, rest to the seller; basket moves with the NFT |
| `market::offer_then_accept` | offer escrow, accept through `nft_approve`, exact fee and royalty |
| `market::expired_offer_is_refundable_by_anyone` | expired offers cannot be accepted and refund in full |
| `market::withdraw_loses_to_sale_while_listed` | withdraw vs. `buy` on a listed token: the sale wins with the full basket |
| `market::sale_fails_while_withdraw_in_flight` | stale listing + withdraw in flight: `buy` fails and refunds the buyer |
| `gacha::one_pull_and_ten_pull` | 1-pull and 10-pull mint to the player with the right baskets, treasury and pity; an under-gassed 10-pull reverts whole |

## Gas

Testnet runs protocol 88, where `max_total_prepaid_gas` (and `max_gas_burnt`) is **1 PGas**
(raised from 300 Tgas in protocol 83; checked with `EXPERIMENTAL_protocol_config`).
Measured in the sandbox with 3-item baskets:

| Call | Attach | Needs | Burnt in total |
| --- | --- | --- | --- |
| `gacha.pull(1)` | 300 Tgas | ~92 Tgas (90 reserved + ~2 own) | ~43 Tgas |
| `gacha.pull(10)` | **1000 Tgas** | ~912 Tgas (900 reserved + ~12 own) | ~418 Tgas |
| `market.buy` | 200 Tgas | | |
| `nft_approve` (list / accept offer) | 250 Tgas | | |
| `collection.withdraw` | 100 Tgas | | |

A 10-pull fits one transaction with ~88 Tgas to spare, so the gacha is unchanged. Each pull
reserves 40 Tgas for the mint plus 5 + 15 per basket item for funding, so baskets must stay at
3 items or fewer. With too little gas the whole `pull` reverts and the deposit is refunded.
Wallets that cap prepaid gas below 1 PGas cannot send a 10-pull.

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

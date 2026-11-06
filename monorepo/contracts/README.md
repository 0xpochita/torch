# Torch contracts

Cargo workspace: every folder here with a `Cargo.toml` is a member (`members = ["*"]`).
Method names, JSON shapes and events are fixed by [`INTERFACES.md`](INTERFACES.md).

| Crate | Account | What |
| --- | --- | --- |
| `mock-ft` | `t*.torchvault.testnet` | NEP-141 test token with an hourly `faucet` |
| `collection` | `nft.torchvault.testnet` | NEP-171/177/178/181/199; the only authority over vaults |
| `vault` | `<id>.nft.torchvault.testnet` | per-NFT basket, global contract by hash, no access keys |

Design and invariants I1–I9: `skills/near-nft-account/SKILL.md`.

## Build

Needs Rust stable with `wasm32-unknown-unknown` and
[cargo-near](https://github.com/near/cargo-near) (`cargo near --version`).

```bash
cd monorepo/contracts
for c in vault collection mock-ft; do (cd $c && cargo near build non-reproducible-wasm); done
# -> target/near/{vault,collection,mock_ft}/*.wasm (wasm-opt'd, deploy these)
```

`cargo build --target wasm32-unknown-unknown --release` also works as a compile check, but
its output is not size-optimised. Vault size matters: publishing a global contract costs NEAR per
byte (about 10 NEAR for the ~104 KB vault).

## Test

```bash
cargo test                          # unit tests + sandbox tests
cargo test --lib                    # unit tests only (fast, no sandbox)
cargo test -p collection --test sandbox
```

The sandbox test (`collection/tests/sandbox.rs`) builds the three wasm files with `cargo near`,
starts a local near-sandbox (downloaded on first run), publishes the vault as a global contract
by hash, and runs the skill's tests 1–5: mint creates a key-less vault, deposit, withdraw vs.
transfer/sale races, old vs. new owner withdraw, and direct vault calls rejected.

## Deploy

`scripts/deploy-testnet.sh` (near-cli-rs) deploys everything under `torchvault.testnet`
(`NEAR_ROOT_ID` to override). It is idempotent: each step checks chain state and skips what is
already done, so a run that stops halfway (e.g. out of NEAR) can simply be re-run. Budget: about
53 NEAR on the root, see [`scripts/budget.md`](../scripts/budget.md).

```bash
cd monorepo
DRY_RUN=1 ./scripts/deploy-testnet.sh            # print the ordered plan; no network calls, no writes
NEAR_PRIVATE_KEY=ed25519:... ./scripts/deploy-testnet.sh
# without NEAR_PRIVATE_KEY the key is read from ~/.near-credentials/testnet/torchvault.testnet.json
```

Steps: build the five wasm files, create `nft` / `market` / `gacha` / 14 mock token sub-accounts
(holding the root's public key), publish the vault as a global contract **by hash** (the base58
sha256 of `vault.wasm`), deploy + init the tokens, collection, market and gacha (tiers 60/28/10/2
from `scripts/gacha-tiers.mjs`, pity 50, 0.1 NEAR per pull), `storage_deposit` the gacha, market and
root on every token, mint the treasury to the root and `ft_transfer_call` it to the gacha with
`msg = "fund"`, send `GACHA_NEAR` (5) NEAR to the gacha for mint deposits, mint a "Deploy check"
vault and assert `near account list-keys 0.nft.torchvault.testnet` is empty, then write the ids to
`apps/web/.env.local` and `apps/api/.env` (`START_HEIGHT` only on the first run).

Knobs: `SKIP_BUILD=1`, `TREASURY_PULLS` (500 draws of every basket), `GACHA_NEAR`, `NEAR_RPC_URL`.

Demo data (6 template vaults from up to 3 creators, 4 listings, 2 offers):

```bash
cd monorepo/scripts && pnpm install --ignore-workspace
DRY_RUN=1 SEED_CREATORS=alice.testnet,bob.testnet,carol.testnet pnpm seed
SEED_CREATORS="alice.testnet:ed25519:...,bob.testnet,carol.testnet" pnpm seed
```

CI: the "Deploy Contract" workflow is manual (`workflow_dispatch`, dry run by default) and uses
the GitHub environment `testnet` with secret `NEAR_PRIVATE_KEY`; it uploads the env files as an
artifact.

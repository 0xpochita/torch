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

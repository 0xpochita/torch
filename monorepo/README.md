# torch

pnpm monorepo on NEAR.

```
apps/web         Next.js frontend      :3000
apps/api         Hono backend          :4000  (reads contract via NEAR RPC)
contracts/torch  Rust NEAR contract    (near-sdk 5)
```

## Setup

```bash
pnpm install
cp .env.example .env          # set NEAR_CONTRACT_ID
cargo install cargo-near near-cli-rs   # contract tooling
```

## Commands

```bash
pnpm dev               # web + api
pnpm contract:test
pnpm contract:build
NEAR_CONTRACT_ID=you.testnet pnpm contract:deploy
```

## CI/CD

- `CI` — every PR and push to `main`: web lint + build, api typecheck, contract fmt/clippy/test/wasm build.
- `Deploy Contract` — push to `main` touching `contracts/**` (or manual): deploys to NEAR testnet.
  Requires GitHub environment `testnet` with variable `NEAR_CONTRACT_ID` and secret `NEAR_PRIVATE_KEY`.

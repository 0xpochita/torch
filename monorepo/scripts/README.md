# Testnet scripts

| File | What |
| --- | --- |
| `deploy-testnet.sh` | near-cli-rs deploy of every contract under `torchvault.testnet`; idempotent, `DRY_RUN=1` prints the plan |
| `seed-testnet.ts` | near-api-js demo data: 6 template vaults, 4 listings, 2 offers, one gacha 10-pull; idempotent, `--check`, `DRY_RUN=1` |
| `gacha-tiers.mjs` | gacha tiers (60/28/10/2) and basket amounts, used by the deploy |
| `near-util.mjs` | read-only RPC + base58 helpers for the deploy's state checks |
| `budget.md` | NEAR needed per step (≈ 46.5 NEAR for the deploy, < 2.5 per seed creator) |

Tools: near-cli-rs ≥ 0.31 (`near`), `cargo near`, node ≥ 22, pnpm. Install the seed's deps once:
`cd monorepo/scripts && pnpm install --ignore-workspace`.

## Run order

Everything below runs from `monorepo/`. Every step can be re-run safely; it only does what is missing.

1. **Fund.** Create `torchvault.testnet` and fund it with ≈ 48 NEAR (`budget.md`), e.g.
   `near account create-account sponsor-by-faucet-service torchvault.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create`,
   then top it up from the faucet. Create and fund 1–3 creator accounts the same way
   (~10 NEAR each is plenty).
2. **Deploy.** Check the plan, then run it:
   ```bash
   DRY_RUN=1 ./scripts/deploy-testnet.sh
   NEAR_PRIVATE_KEY=ed25519:... ./scripts/deploy-testnet.sh   # or the key from ~/.near-credentials
   ```
   It ends by printing the vault / mock_ft code hashes and `START_HEIGHT`, and writes the contract ids
   to `apps/web/.env.local` and `apps/api/.env` (`START_HEIGHT` only on the first run).
3. **Seed.**
   ```bash
   cd scripts
   SEED_CREATORS=alice.testnet,bob.testnet,carol.testnet pnpm seed --check   # what is missing
   SEED_CREATORS=alice.testnet,bob.testnet,carol.testnet pnpm seed
   ```
   The faucet gives each account 0.1 of a token per hour; if a run prints `wait:`, re-run after
   the hour and it resumes. Finish with `--check` until it prints `all seeded.`
4. **API + indexer.** `apps/api/.env` already has `START_HEIGHT` from step 2, so the first start
   backfills every deploy and seed event; later starts resume from the stored cursor.
   ```bash
   pnpm dev:api        # http://localhost:8787
   ```
   If `apps/api/data/torch.db` exists from an earlier deploy, delete it first or the cursor wins.
5. **Web.** `apps/web/.env.local` has the `NEXT_PUBLIC_*` ids from step 2: `pnpm dev:web`.

## Checking a command without sending it

`DRY_RUN=1` never touches the network. To check that the printed near-cli-rs commands parse with
the installed CLI version, append `--help` to any of them: the CLI parses the whole chain and
prints help for the last step, or an `error: unexpected argument` if the syntax is wrong.

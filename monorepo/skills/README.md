# Skills

Agent skills ([agentskills.io](https://agentskills.io) format) for working on Torch. Each folder has a
`SKILL.md` with frontmatter describing when to use it.

| Skill | Use when |
| --- | --- |
| [`hot-wallet-connect`](hot-wallet-connect/SKILL.md) | Adding or changing wallet connect / sign-in in `apps/web` (HOT Wallet + all NEAR wallets via NEAR Connect) |
| [`near-transactions`](near-transactions/SKILL.md) | Calling contracts from the web app: view calls, change calls, NEP-141 / NEP-171 calls, batches |
| [`near-wallet-auth`](near-wallet-auth/SKILL.md) | Proving account ownership to `apps/api` (NEP-413) and gating pages to NFT holders |
| [`hot-kit`](hot-kit/SKILL.md) | Multi-chain features: EVM/Solana/TON wallets, omni balances, cross-chain swaps |
| [`near-nft-account`](near-nft-account/SKILL.md) | NFT = vault sub-account: collection + vault contracts, transfer threat model, locks, payouts, tests |

### From [near/agent-skills](https://github.com/near/agent-skills) (vendored @ `cb32b6a`)

The official NEAR skills listed in [awesome-near](https://github.com/near/awesome-near#skills).
There is no standalone NFT skill; NEP-171/177/178/181 is covered by `near-smart-contracts`
(`rules/best-contract-tools.md`, via `near-sdk-contract-tools`).

| Skill | Use when |
| --- | --- |
| [`near-smart-contracts`](near-smart-contracts/SKILL.md) | Writing the collection and vault contracts: NFT standards, storage, cross-contract calls, sandbox tests, upgrades |
| [`near-contract-audit`](near-contract-audit/SKILL.md) | Reviewing contracts before deploy: callbacks, unhandled promises, access control, the transfer threat model |
| [`near-intents`](near-intents/SKILL.md) | Swapping deposits into basket tokens and cross-chain deposits (1Click API) |
| [`near-api-js`](near-api-js/SKILL.md) | RPC, keys, NEP-413, FT/NFT helpers in `apps/api` or scripts |
| [`near-cli-rs`](near-cli-rs/SKILL.md) | Deploying, calling and inspecting contracts from the terminal / CI |

Not vendored: `near-dapp` (overlaps `hot-wallet-connect`), `near-kit` (alternative client we don't use),
`near-ai-cloud` (no AI features yet). Refresh with
`npx skills add near/agent-skills --skill <name>` or re-copy from the repo.

Default stack: `@hot-labs/near-connect` for NEAR wallets, `near-api-js` for RPC and NEP-413 verification.
Reach for `@hot-labs/kit` only when a feature needs non-NEAR chains.

Sources: [HOT docs](https://docs.hotdao.ai), [NEAR Connect](https://github.com/hot-dao/near-selector),
[NEAR wallet login](https://docs.near.org/web3-apps/tutorials/wallet-login),
[NEAR backend auth](https://docs.near.org/web3-apps/backend/backend).

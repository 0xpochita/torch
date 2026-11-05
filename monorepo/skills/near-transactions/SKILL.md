---
name: near-transactions
description: >
  Read and write NEAR contracts from the Torch web app with a wallet connected through
  @hot-labs/near-connect. Covers view calls over RPC, signAndSendTransaction /
  signAndSendTransactions, gas and deposit units, NEP-141 token calls (storage_deposit,
  ft_transfer_call), NEP-171 NFT calls, reading results, and function-call access keys.
  Use when adding any button that calls a contract or shows on-chain data.
---

# NEAR transactions from the web app

Requires the provider from `hot-wallet-connect` (`useNear()` gives `wallet` and `accountId`).

## Units, always strings

| Thing | Unit | Common values |
| --- | --- | --- |
| `gas` | yoctogas (1 TGas = 10^12) | `"30000000000000"` (30 TGas) for simple calls, `"100000000000000"` for cross-contract, max `"300000000000000"` |
| `deposit` | yoctoNEAR (1 NEAR = 10^24) | `"0"`, `"1"` (1 yocto, required by `ft_transfer`, `nft_transfer`, etc.), storage deposits |

Convert with `near-api-js`: `nearToYocto("0.1")`, `yoctoToNear(x)`. Never hand-write 24 zeros.

## View calls (no wallet, no gas)

Use RPC directly. Works in Server Components, route handlers and the client:

```ts
import { JsonRpcProvider } from "near-api-js";

const rpc = new JsonRpcProvider({
  url: process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com",
});

const tokens = await rpc.callFunction({
  contractId: process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID!,
  method: "nft_tokens_for_owner",
  args: { account_id: accountId, from_index: "0", limit: 50 },
});
```

`apps/api` already has a zero-dependency `view()` helper over raw JSON-RPC. Reuse it server-side
instead of adding `near-api-js` there.

## Change calls

```ts
import { getTransactionLastResult } from "near-api-js";

const { wallet } = useNear();
if (!wallet) throw new Error("Connect a wallet first");

const outcome = await wallet.signAndSendTransaction({
  receiverId: process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID!,
  actions: [
    {
      type: "FunctionCall",
      params: { methodName: "set_greeting", args: { greeting: "gm" }, gas: "30000000000000", deposit: "0" },
    },
  ],
});

const txHash = outcome.transaction.hash;
const returned = getTransactionLastResult(outcome); // decoded JSON return value, if any
```

Explorer link: `https://${network === "mainnet" ? "" : "testnet."}nearblocks.io/txns/${txHash}`.

Use the `ConnectorAction` shape above (`{ type, params }`). `@near-js/transactions` actions also
work but add a dependency for nothing.

## Several transactions in one approval

Different receivers mean different transactions. Batch them so the user approves once:

```ts
await wallet.signAndSendTransactions({
  transactions: [
    {
      receiverId: "usdc.fakes.testnet",
      actions: [{ type: "FunctionCall", params: {
        methodName: "storage_deposit",
        args: { account_id: vaultId, registration_only: true },
        gas: "30000000000000",
        deposit: "1250000000000000000000", // 0.00125 NEAR, check storage_balance_bounds
      } }],
    },
    {
      receiverId: "usdc.fakes.testnet",
      actions: [{ type: "FunctionCall", params: {
        methodName: "ft_transfer_call",
        args: { receiver_id: vaultId, amount: "1000000", msg: JSON.stringify({ action: "deposit" }) },
        gas: "100000000000000",
        deposit: "1",
      } }],
    },
  ],
});
```

Transactions in a batch are **not atomic**: one can fail while others succeed. Show per-tx status.

## Token standards cheat sheet

| Call | Receiver | Deposit | Notes |
| --- | --- | --- | --- |
| `storage_deposit` | FT contract | per `storage_balance_bounds` | Receiver must be registered before it can hold an FT. Check `storage_balance_of` first. |
| `ft_transfer` | FT contract | `"1"` | Plain transfer. |
| `ft_transfer_call` | FT contract | `"1"` | Transfer + `ft_on_transfer` on the receiver. Unused amount is refunded to the **sender**. Give ≥ 50–100 TGas. |
| `nft_transfer` | NFT contract | `"1"` | `{ receiver_id, token_id, approval_id?, memo? }` |
| `nft_approve` | NFT contract | storage (~0.0008 NEAR) | Lists on a marketplace (`msg` is marketplace-specific). |
| `nft_revoke` / `nft_revoke_all` | NFT contract | `"1"` | |
| `near_deposit` | `wrap.near` / `wrap.testnet` | amount to wrap | NEAR to wNEAR (NEP-141). |

## Function-call access keys (no popup per action)

For frequent, non-payable actions only (e.g. "trigger rebalance"). Add the key after the user is
engaged, not on first connect:

```ts
import { KeyPair } from "near-api-js";

const key = KeyPair.fromRandom("ed25519"); // store key.toString() client-side
await connector.connect({
  addFunctionCallKey: {
    contractId: process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID!,
    publicKey: key.getPublicKey().toString(),
    allowMethods: { anyMethod: false, methodNames: ["rebalance"] },
    gasAllowance: { kind: "limited", amount: "250000000000000000000000" }, // 0.25 NEAR in yocto
  },
});
```

Function-call keys can never attach a deposit (not even 1 yocto), so every `ft_*` / `nft_*`
transfer still goes through the wallet.

## Common mistakes

- Missing `gas` / `deposit` in `FunctionCall` params: the protocol rejects it.
- `deposit: "0"` on `ft_transfer` / `nft_transfer`: panics with "Requires attached deposit of exactly 1 yoctoNEAR".
- Too little gas on `ft_transfer_call`: the callback runs out of gas and funds land in a refund path.
- Sending an FT to an unregistered account: fails. `storage_deposit` first.
- Treating a returned tx hash as success: check `outcome.status` / `getTransactionLastResult` (throws on failure).
- Polling the indexer for fresh state right after a tx. Read with RPC at `finality: "final"` instead.

---
name: near-wallet-auth
description: >
  Prove NEAR account ownership to the Torch backend (apps/api) with NEP-413 signed messages from
  HOT Wallet / NEAR Connect, then issue a session and gate pages or API routes to current NFT
  holders. Covers challenge issuance, connect({ signMessageParams }), server verification with
  near-api-js/nep413, replay protection, and holder checks against the collection. Use for
  login, the holder-only page, or any API route that acts on behalf of an account.
---

# Wallet auth (NEP-413) + holder gating

`accountId` from the client is just a string. Before the backend trusts it, the user signs a
server-issued challenge, and the backend verifies the signature and that the key belongs to the
account **on-chain**.

```
web                                   api                               NEAR RPC
 │ GET /auth/challenge ─────────────▶ │ nonce = 32 random bytes, store (5 min TTL)
 │ ◀─────────────── { nonce, message, recipient }
 │ connect({ signMessageParams })     │
 │ POST /auth/verify {accountId, publicKey, signature, nonce} ─▶ │
 │                                    │ consume nonce (one-time)
 │                                    │ verifyMessage(...) ───────────▶ │ key is a full-access key of accountId?
 │ ◀──────────── session cookie       │
```

## 1. Challenge (apps/api)

```ts
import { randomBytes } from "node:crypto";

const MESSAGE = "Sign in to Torch";
const RECIPIENT = process.env.AUTH_RECIPIENT ?? "torch.app"; // must match what the web sends
const nonces = new Map<string, number>(); // ponytail: in-memory, move to Redis/KV when api scales past one instance

app.get("/auth/challenge", (c) => {
  const nonce = randomBytes(32).toString("base64");
  nonces.set(nonce, Date.now() + 5 * 60_000);
  return c.json({ nonce, message: MESSAGE, recipient: RECIPIENT });
});
```

## 2. Sign (apps/web)

Sign in and sign in one popup. Wallets without `signInAndSignMessage` are filtered out of the picker:

```ts
const { nonce, message, recipient } = await fetch(`${API}/auth/challenge`).then((r) => r.json());

connector.once("wallet:signInAndSignMessage", async ({ accounts }) => {
  const { accountId, signedMessage } = accounts[0];
  await fetch(`${API}/auth/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, publicKey: signedMessage.publicKey, signature: signedMessage.signature, nonce }),
  });
});

await connector.connect({
  signMessageParams: { message, recipient, nonce: Uint8Array.from(atob(nonce), (ch) => ch.charCodeAt(0)) },
});
```

Already connected? Use `wallet.signMessage({ message, recipient, nonce })`. It returns
`{ accountId, publicKey, signature }` (signature is base64).

## 3. Verify (apps/api)

```bash
pnpm --filter api add near-api-js
```

```ts
import { verifyMessage } from "near-api-js/nep413";
import { JsonRpcProvider } from "near-api-js";

const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL! });

app.post("/auth/verify", async (c) => {
  const { accountId, publicKey, signature, nonce } = await c.req.json();

  const expiry = nonces.get(nonce);
  nonces.delete(nonce); // one-time, even on failure
  if (!expiry || expiry < Date.now()) return c.json({ error: "challenge expired" }, 401);

  try {
    await verifyMessage({
      signerAccountId: accountId,
      signerPublicKey: publicKey,
      signature: new Uint8Array(Buffer.from(signature, "base64")),
      payload: { message: MESSAGE, recipient: RECIPIENT, nonce: new Uint8Array(Buffer.from(nonce, "base64")) },
      provider, // checks publicKey is a FULL ACCESS key of accountId on-chain
    });
  } catch {
    return c.json({ error: "invalid signature" }, 401);
  }

  // issue a session: signed, httpOnly, sameSite cookie holding accountId (hono/jwt or hono/cookie signed)
  return c.json({ accountId });
});
```

Rules that matter:

- **Nonce comes from the server**, is random (32 bytes), single-use, and expires. A client-chosen nonce allows replay.
- **Message and recipient are fixed server-side** and compared exactly. Never echo them back from the request.
- **Always pass `provider`** so the key is checked against the account's access keys. Without it, anyone can sign with any key and claim any account.
- A session proves *who* the user is, not *what they own*. Ownership changes when an NFT is sold, so check holdings per request (below).

## 4. Holder gating

Check ownership on the collection every time a gated resource is served. Do not cache it in the
session, because the NFT can be transferred a second after login:

```ts
const tokens = await view<{ token_id: string }[]>("nft_tokens_for_owner", {
  account_id: session.accountId, from_index: "0", limit: 100,
});
if (tokens.length === 0) return c.json({ error: "holders only" }, 403);

// per-token page: exact owner match
const token = await view<{ owner_id: string } | null>("nft_token", { token_id });
if (token?.owner_id !== session.accountId) return c.json({ error: "not the owner" }, 403);
```

Use `finality: "final"` for gating reads (the existing `view()` helper already does).

In Next.js, do the check in the route handler or Server Component that renders the gated page,
not only in client code. Client checks are UX, not security.

## HOT Kit alternative

`@hot-labs/kit` offers `wallet.auth()`, which returns a JWT validated by HOT's API
(`api.validateAuth(jwt)`). It works across chains but adds a third-party dependency to the login
path. For a NEAR-only app, prefer the NEP-413 flow above.

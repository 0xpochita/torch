# Cross-layer check: web tx builders, API indexer, contracts

This was a read-only comparison of every chain write and every event or view parser against the
contract code. Nothing outside this file was edited.

| Layer | Branch @ commit | Files |
| --- | --- | --- |
| Web tx (a) | `Bimajadivaaa/torch-w2-webtx` @ `d554197` | `apps/web/src/lib/near-tx.ts` (NT), `components/tx-sheet.tsx` (TS), `app/create/studio.tsx` (ST), `app/gacha/gacha.tsx` (GA), `app/faucet/faucet.tsx` (FA), `lib/contracts.ts` (CT), `lib/api.ts` (WA) |
| API (b) | `Bimajadivaaa/torch-w2-webdata` @ `194f12f` | `apps/api/src/indexer.ts` (IX), `prices.ts` (PX), `app.ts` (AP), `config.ts` (CF) |
| Market | `Bimajadivaaa/torch-w2-audit` @ `d363758` | `contracts/market/src/lib.rs` (MK) |
| Collection, gacha, vault, mock-ft | `Bimajadivaaa/torch-w2-contracts` @ `8d10609` | `contracts/collection/src/lib.rs` (CO), `gacha/src/lib.rs` (GC), `vault/src/lib.rs` (VA), `mock-ft/src/lib.rs` (MF) |

Paths are relative to `monorepo/`; line numbers are at the commits above. The web and API heads
already include their wave-2 market commits (`d554197` web, `194f12f` api). Older heads
(`e079e2a`, `971b28c`) still used the wave-1 offer/accept/delist shapes and would fail against
the current market.

## Summary of mismatches

| # | Severity | Where | Problem | Fix |
| --- | --- | --- | --- | --- |
| X-1 | **High** | IX:36,67-69 + PX:24,31 (+ WA:55-58) | The API trusts `vault_deposit` from the vault account, but `ft_id` is whoever called `ft_on_transfer` (VA:48-60; anyone can call it directly). The vault owner can also make `vault_withdraw` carry any `ft_id` (CO:170, VA:38-44). The follow-up reads `ft_balance_of` from that contract (IX:133), and `key()` prices by the first label only, so `tusdc.mallory.testnet` is priced as USDC. A vault's NAV, leaderboard value and history can be inflated at will | IX `trusted`: `vault_deposit`/`vault_withdraw` only when `cfg.ftIds.includes(d.ft_id)`. PX: key by full id (`Object.fromEntries(cfg.ftIds.map(id => [id, …]))`) or require `ftId.endsWith('.' + root)` / `=== 'wrap.testnet'`. WA `tokenKey` needs the same exact-id rule (use `ftById` from CT) |
| X-2 | **High** | TS:160-164 | Offer pins come from the API's `detail.balances`, sorted by `valueUsd`, top 4. With X-1, a seller can add 4 fake "tusdc.*"-style balances with a huge USD value, so the buyer pins only fake tokens (whose `ft_balance_of` the attacker controls) and the real basket is unprotected (H-1 bypass). The API balances also lag the chain | Build pins only from known ids (`ftById(b.ftId)` from CT) and read live balances: `useFtBalances(vaultOf(tokenId), basketFtIds)` (NT:313) at sheet open. Pin every basket token (≤ 4 by the gacha and studio rules), not "top 4 by value" |
| X-3 | Medium | IX:82-84 | `offer_cancel` and `offer_accept` delete by `(token_id, buyer_id)`. When an accept fails after the buyer placed a new offer, the market refunds the in-flight offer with `offer_cancel` (MK:542-551 → 581-590), and that deletes the new live offer from the API (audit L-5) | `DELETE … WHERE token_id = ? AND buyer_id = ? AND (? IS NULL OR created_at = ?)` with `d.created_at` (offers already store `d.created_at`, IX:80) |
| X-4 | Low | ST:142-144 | `mint` now resolves to `null` when the vault could not be created (CO:132-162, deposit refunded). `check()` only treats `false` as a rollback (NT:190), so the user sees "Minted, but the token id was not in the result" | `if (ret === null) throw new Error("The vault could not be created; your 0.11 NEAR was refunded.")` before the event fallback |
| X-5 | Low | IX:48-50 | Every `nft_transfer` deletes the API listing. In a reverted `nft_transfer_call` the collection emits two `nft_transfer`s and restores the approvals, so the market listing is live again but gone from the API until relisted | On `nft_transfer`, delete only when `d.new_owner_id` differs from the listing's `seller_id` (`DELETE FROM listings WHERE token_id = ? AND seller_id <> ?`) |
| X-6 | **High (merge)** | contracts branch `integration-tests/tests/market.rs:93-94,116,235-236,259`, `market/src/lib.rs` (rustfmt only), deletes `market/tests/{sandbox.rs,mock-nft}` | The contracts branch still tests the wave-1 market shapes (offer without `amount`, accept without `amount`), reformats `market/src/lib.rs` and deletes the market sandbox tests that this branch rewrote. Merging both branches conflicts, and those tests fail against the fixed market | When merging, take MK from `torch-w2-audit`, then update `integration-tests/tests/market.rs` to `offer{token_id, amount, expires_at, min_balances?}` + deposit `amount + offer_storage_cost()`, `accept_offer{buyer_id, amount}`, and 1 yocto on `delist`/`cancel_offer`. Keep or port `market/tests/sandbox.rs` (prune test) |

Everything else matches. The full tables follow.

## (a) Write calls: web → contract

| Call | Web (builder · caller) | Contract | Method / args | Deposit | Gas | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `market.buy` | NT:30 · TS:204 | MK:194-219 | `buy{token_id}` ✓ | `onChain.price` from live `get_listing` (TS:169), **exact** as required ✓ | 200 Tgas ✓ (INTERFACES) | OK |
| `market.offer` | NT:40-51 · TS:206 | MK:264-327 | `{token_id, amount: U128 str, expires_at: ms, min_balances: [{ft_id, amount}] ≤4}` ✓; token ids from the API are numeric ✓; expiry 1/3/7 d ≤ 365 d ✓ | `amount + offer_storage_cost()` (live view TS:165, fallback 0.02 NEAR) ✓ ≥ needed, excess refunded | 50 Tgas ✓ (O(1) + 3 index writes) | OK, except pins (**X-2**) |
| `market.cancel_offer` | NT:53 (no caller) | MK:331-338 | `{token_id}` ✓ | 1 yocto ✓ (`assert_one_yocto`) | 30 ✓ | OK |
| `market.delist` | NT:68-71 · TS:210 | MK:223-236 | `{token_id}` ✓ | 1 yocto ✓ | 30 ✓ | OK |
| `collection.nft_revoke` (2nd tx of delist) | NT:70 | CO:397 (standards: `assert_one_yocto`) | `{token_id, account_id: MARKET}` ✓ | 1 yocto ✓ | 30 ✓ | OK |
| `collection.nft_approve` list | NT:56-59 · TS:208 | CO:386 → MK:144-175 | msg `{"list":{"price":"<yocto>"}}` ✓ (`deny_unknown_fields` MK:75; no extra fields sent) | 0.001 NEAR ≥ approval storage (≈ 37 bytes = 0.00037) ✓, excess refunded by standards | 100 ✓ | OK |
| `collection.nft_approve` accept | NT:62-65 · TS:212 | MK:176-186, 506-528 | msg `{"accept_offer":{"buyer_id","amount"}}` ✓; amount is the API offer's exact yocto string (TS:156-158) ✓ | 0.001 ✓ | 250 Tgas ✓ (audit `h1` control accepts with 4 pins under 250 Tgas against the real collection) | OK. A failure resolves to `false`, so `check()` shows "rolled back and refunded" (NT:190) ✓ |
| `market.prune_listing` | — | MK:240-258 | not used by the web (optional; seed covers it) | — | — | OK (n/a) |
| `collection.mint` | NT:78 · ST:141 | CO:95-128 | `{metadata:{title, description, extra: JSON string}, receiver_id: null}` ✓; `extra` is a JSON object string as `with_creator` requires ✓; `creator` is overwritten ✓ | 0.11 NEAR ≥ `MINT_DEPOSIT` ✓ | 100 ✓ | OK; result handling **X-4** |
| FT `storage_deposit` for the vault | NT:81-87 · ST:122, TS:214 | MF:145 (standards) | `{account_id: vaultOf(id), registration_only: true}` ✓ | 0.00125 = NEP-145 min ✓ (refunded if already registered) | 30 ✓ | OK |
| FT `ft_transfer_call` → vault | NT:81-87 | VA:48-65 (keeps all, returns `"0"`) | `{receiver_id: vaultOf, amount: U128 str, msg: ""}` ✓ | 1 yocto ✓ | 100 ✓ | OK |
| `collection.withdraw` | NT:90-93 · TS:216 | CO:170-191 | `{token_id, ft_id, amount: U128 str}` ✓ | 1 yocto ✓ (`assert_one_yocto` CO:171) | 100 ✓ (40 vault op + 15 callback) | OK. The UI blocks it while listed (TS:169) ✓; `ft_id` comes from `ftByKey`, an exact id ✓ |
| `collection.nft_transfer` | NT:95-98 · TS:218 | CO:331 | `{receiver_id, token_id}` ✓ | 1 yocto ✓ | 30 ✓ | OK |
| `gacha.pull` | NT:103-106 · GA:132 | GC:113-183 | `{count: 1 \| 10}` ✓ | `price × (count==10 ? 9 : 1)` = contract `total` **exact** ✓; price from `get_config.price_per_pull` (U128 string) ✓ | 300 / 1000 Tgas ✓ (contracts README: testnet max prepaid 1 PGas; 10-pull reserves ~912) | OK |
| mock FT `faucet` | NT:109 · FA:84,105 | MF:55-65 | `{}` ✓ | 0.00125 ✓ (registers or refunds) | 30 ✓ | OK; `faucet_next_at` view FA:35 ✓ |
| `wrap.testnet` `storage_deposit` + `near_deposit` | NT:112-115 · FA:135 | wNEAR (external) | `{registration_only: true}`, `{}` ✓ | 0.00125 ✓, amount ✓ | 10 + 10 ✓ | OK |

## (a) Views and events the web reads

| Read | Web | Contract | Status |
| --- | --- | --- | --- |
| `market.get_listing{token_id}` → `{price: U128 str, …}` | TS:169,204 | MK:457 | OK |
| `market.offer_storage_cost()` → U128 str | TS:165 | MK:499 | OK |
| FT `ft_balance_of{account_id}` → U128 str | TS:190, NT:313 | standards | OK |
| `gacha.get_config` → `{price_per_pull: U128 str, pity: u32, tiers[{rarity, weight_bps, baskets[{name, category, bg, items[{token, amount}]}]}]}` | GA:26,82 | GC:48-55,270 | OK |
| `gacha.get_pity{account_id}` → u32 | GA:83 | GC:266 | OK |
| `collection.nft_token{token_id}` → `metadata.title/extra` | GA:59 | CO:358 | OK |
| mock FT `faucet_next_at{account_id}` → u64 ms | FA:35 | MF:77 | OK |
| event `vault_created` `token_id` (from COLLECTION) | ST:143 | CO:155-163 | OK (fallback only; result is the id) |
| event `gacha_pull` `player_id, token_id, rarity` (from GACHA) | GA:51-58 | GC:236-250 | OK. Logged in `on_minted` by the gacha account, so `from: GACHA` is correct ✓. Audit M-1 still applies (logged before funding resolves) |
| vault id `vaultOf = <token_id>.<collection>` | CT:14 | CO:268 `vault_id`, VA:82 | OK |

## (b) Events the API indexes

`trusted()` (IX:33-40) pins each event to its emitter, and failed receipts are dropped
(IX:189,205,229).

| Event | Emitter | API handler | Fields used | Status |
| --- | --- | --- | --- | --- |
| `nep171 nft_mint` | CO:149 (standards) | IX:47-49 | `owner_id`, `token_ids[]` ✓ | OK |
| `nep171 nft_transfer` | standards (transfer, payout, transfer_call and its revert) | IX:48-50 | `new_owner_id`, `token_ids[]` ✓ | OK; listing delete **X-5** |
| `vault_created` | CO:155-163 | IX:52-66 | `token_id, vault_id, owner_id, creator, extra` (JSON string, parsed) ✓; rarity only when `creator == gacha` ✓ | OK |
| `vault_deposit` | VA:57-63 (vault account) | IX:36, 67-69 | `token_id, ft_id` ✓ (executor check ✓) | **MISMATCH X-1** (`ft_id` not allow-listed) |
| `vault_withdraw` | CO:204-208 | IX:35, 67-69 | `token_id, ft_id` ✓ | **MISMATCH X-1** (owner-chosen `ft_id`) |
| `list` | MK:171 | IX:71-72 | `token_id, seller_id, price` ✓ | OK |
| `delist` | MK:235 (delist), 362 (failed buy), 419 (accept), 453 (prune) | IX:74-76 | `token_id` ✓ | OK |
| `sale` | MK:370 | IX:75-76, AP:43-45 | `token_id, seller_id, buyer_id, price, fee` ✓ | OK |
| `offer` | MK:316 | IX:78-80 | `token_id, buyer_id, amount, expires_at, created_at` ✓ (`min_balances` ignored, fine) | OK |
| `offer_cancel` | MK:581-590 (cancel, expiry refund, replace, failed-accept refund) | IX:82-84 | `token_id, buyer_id` (+ `created_at` available) | **MISMATCH X-3** |
| `offer_accept` | MK:424 | IX:83-85, AP:43-45 | `token_id, buyer_id, amount` ✓ | OK (same `created_at` refinement as X-3 is harmless here) |
| `gacha_pull` | GC:236-250 | IX:38, 87-88 | `player_id, token_id, rarity, pity_after, price` ✓ | OK |

API view calls: `ft_balance_of{account_id: <token_id>.<collection>}` (IX:133) matches `vault_of` ✓
but trusts any `ft_id` (X-1). `nft_token{token_id}` (IX:141) ✓.

Silent market paths need no event: an accept that fails the balance check (MK:386-404) or the
transfer restores the offer without logging anything, so the API keeps it, which is correct.
The API never removes expired-but-unrefunded offers, but every read filters on
`expires_at > now` (AP:38, AP:225) ✓.

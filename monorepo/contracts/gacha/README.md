# Gacha

`gacha.torchvault.testnet`. Interface: `contracts/INTERFACES.md` ("Gacha").

- `pull(count)`: `count` is 1 (0.1 NEAR) or 10 (0.9 NEAR); attach exactly that. Each result
  rolls a tier by `weight_bps`, picks a basket in the tier, mints through
  `collection.mint(metadata, receiver_id = player)` with 0.11 NEAR from the gacha's own balance,
  then `storage_deposit` + `ft_transfer_call` each basket item from the treasury into
  `<token_id>.<collection>`. Emits `gacha_pull` once the funding resolved.
- Pity: per-account counter of pulls since the last Legendary; the pull that reaches `pity`
  is Legendary, then the counter resets.
- A result the treasury or the NEAR balance cannot cover is refunded (its share of the price)
  and does not count for pity. A failed mint puts the basket back and refunds that pull.
- Treasury: the owner sends tokens with `ft_transfer_call(receiver_id = gacha, msg = "fund")`.
  The gacha must be registered (`storage_deposit`) on each token first. Keep the gacha's NEAR
  balance topped up: every result spends 0.11 NEAR + 0.00125 NEAR per basket item.
- Funding: each item is `storage_deposit` + `ft_transfer_call` into the vault. `on_funded` runs
  once all items resolve: whatever did not reach the vault goes back into `treasury`
  (event `gacha_fund_failed {player_id, token_id, ft_id, amount}`), then `gacha_pull` is emitted.
  A `mint` result that is neither a token id nor `null` keeps the price and puts the basket back.
- Treasury tokens: `ft_on_transfer` only accepts tokens that appear in some basket.
- Gas: attach 1000 Tgas (testnet's max prepaid gas per transaction) to a 10-pull and 300 Tgas
  to a 1-pull. The minimums are 950 and 97 Tgas; with less the whole call reverts and the
  deposit is refunded. Static gas alone covers every step, so a player attaching the minimum
  cannot starve the funding. Keep baskets at 3 items or fewer. Details: `contracts/README.md` ("Gas").

## Randomness

`env::random_seed()` mixed with the pull index is fine for testnet, but the block producer
can bias it. Mainnet needs commit-reveal or a VRF.

## Test

```sh
cargo test -p gacha                                          # unit tests incl. rarity statistics and pity
cargo test -p integration-tests --test gacha -- --nocapture  # 1-pull + 10-pull against the real collection, vault and mock-ft
```

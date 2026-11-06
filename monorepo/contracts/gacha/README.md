# Gacha

`gacha.torchvault.testnet`. Interface: `contracts/INTERFACES.md` ("Gacha").

- `pull(count)`: `count` is 1 (0.1 NEAR) or 10 (0.9 NEAR); attach exactly that. Each result
  rolls a tier by `weight_bps`, picks a basket in the tier, mints through
  `collection.mint(metadata, receiver_id = player)` with 0.11 NEAR from the gacha's own balance,
  then `storage_deposit` + `ft_transfer_call` each basket item from the treasury into
  `<token_id>.<collection>`. Emits `gacha_pull` once the mint resolved.
- Pity: per-account counter of pulls since the last Legendary; the pull that reaches `pity`
  is Legendary, then the counter resets.
- A result the treasury or the NEAR balance cannot cover is refunded (its share of the price)
  and does not count for pity. A failed mint puts the basket back and refunds that pull.
- Treasury: the owner sends tokens with `ft_transfer_call(receiver_id = gacha, msg = "fund")`.
  The gacha must be registered (`storage_deposit`) on each token first. Keep the gacha's NEAR
  balance topped up: every result spends 0.11 NEAR + 0.00125 NEAR per basket item.
- Gas: a 10-pull needs the full 1 PGas for 3-item baskets (sandbox burns ~390 Tgas); keep
  baskets at 3 items or fewer, or 10-pulls will fail with "Exceeded the prepaid gas" (and refund).

## Randomness

`env::random_seed()` mixed with the pull index is fine for testnet, but the block producer
can bias it. Mainnet needs commit-reveal or a VRF.

## Test

```sh
cargo test                     # unit tests incl. rarity statistics and pity
cargo test --test sandbox      # 1-pull + 10-pull end to end (mock collection + mock NEP-141)
cargo build --target wasm32-unknown-unknown --release
```

The sandbox test builds `tests/mocks/*` itself and downloads the sandbox binary on first run.

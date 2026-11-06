//! Sandbox reproductions for ../AUDIT.md. Each test asserts the SAFE behaviour, so it fails
//! while the finding is open and stays as a regression test once fixed. Builds the real wasm of every contract with `cargo near build`.
mod common;
use common::*;

/// C-1: the real collection's `mint` resolves to `on_vault_created -> bool`, but the gacha
/// parses the result as a token-id string. Every pull is treated as a failed mint: the player
/// keeps the NFT AND gets the price back, the vault is never funded, and pity still advances.
#[tokio::test]
async fn c1_gacha_pull_against_real_collection_funds_vault_and_keeps_price() {
    let e = setup().await;
    let gacha = deploy(&e.root, "gacha", 20, "gacha").await;
    ok(gacha
        .call("new")
        .args_json(json!({
            "owner_id": e.root.id(),
            "collection_id": e.nft.id(),
            "price_per_pull": NearToken::from_millinear(100).as_yoctonear().to_string(),
            "pity": 50,
            "tiers": [{
                "rarity": "Legendary",
                "weight_bps": 10000,
                "baskets": [{ "name": "B", "category": "Blue Chip", "bg": "#fff",
                    "items": [{ "token": e.usdc.id(), "amount": "1000" }] }],
            }],
        }))
        .transact()
        .await
        .unwrap());
    register(&e, gacha.id()).await;
    mint_usdc(&e, e.root.id(), 1_000_000).await;
    ok(e.root
        .call(e.usdc.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": gacha.id(), "amount": "1000000", "msg": "fund" }))
        .deposit(YOCTO)
        .max_gas()
        .transact()
        .await
        .unwrap());

    let before = e.bob.view_account().await.unwrap().balance;
    ok(e.bob
        .call(gacha.id(), "pull")
        .args_json(json!({ "count": 1 }))
        .deposit(NearToken::from_millinear(100))
        .max_gas()
        .transact()
        .await
        .unwrap());
    let after = e.bob.view_account().await.unwrap().balance;

    assert_eq!(owner_of(&e, "0").await, *e.bob.id(), "the pull minted token 0 to the player");
    let vault: AccountId = format!("0.{}", e.nft.id()).parse().unwrap();
    assert_eq!(
        usdc_of(&e, &vault).await,
        1000,
        "the minted vault must hold the basket (gacha treated the mint as failed)"
    );
    assert!(
        before.as_yoctonear() - after.as_yoctonear() >= NearToken::from_millinear(100).as_yoctonear(),
        "the player must pay for a pull that minted an NFT (was refunded)"
    );
}

/// H-1: offers are not tied to the vault's contents. The seller drains the vault (no approval
/// exists, so I6 does not apply), then accepts the standing offer: the buyer pays full price for
/// an empty vault.
#[tokio::test]
async fn h1_accepting_an_offer_after_draining_the_vault_must_fail() {
    let e = setup().await;
    let market = deploy_market(&e, 10).await;
    let vault = mint(&e, "0").await;
    register(&e, &vault).await;
    mint_usdc(&e, e.alice.id(), 1_000_000).await;
    ok(e.alice
        .call(e.usdc.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": vault, "amount": "1000000", "msg": "" }))
        .deposit(YOCTO)
        .max_gas()
        .transact()
        .await
        .unwrap());

    // Bob offers 5 NEAR for a vault holding 1_000_000 usdc and pins that balance.
    ok(e.bob
        .call(market.id(), "offer")
        .args_json(json!({
            "token_id": "0",
            "amount": NearToken::from_near(5).as_yoctonear().to_string(),
            "expires_at": e.worker.view_block().await.unwrap().timestamp() / 1_000_000 + 3_600_000,
            "min_balances": [{ "ft_id": e.usdc.id(), "amount": "1000000" }],
        }))
        .deposit(NearToken::from_millinear(5_020))
        .transact()
        .await
        .unwrap());
    // Alice empties the vault, then accepts.
    ok(e.alice
        .call(e.nft.id(), "withdraw")
        .args_json(json!({ "token_id": "0", "ft_id": e.usdc.id(), "amount": "1000000" }))
        .deposit(YOCTO)
        .max_gas()
        .transact()
        .await
        .unwrap());
    let r = e
        .alice
        .call(e.nft.id(), "nft_approve")
        .args_json(json!({
            "token_id": "0",
            "account_id": market.id(),
            "msg": json!({ "accept_offer": {
                "buyer_id": e.bob.id(),
                "amount": NearToken::from_near(5).as_yoctonear().to_string(),
            } }).to_string(),
        }))
        .deposit(NearToken::from_millinear(10))
        .max_gas()
        .transact()
        .await
        .unwrap();

    assert!(
        r.logs().iter().any(|l| l.contains("less than the offer's min_balances")),
        "the sale must stop at the balance check: {r:#?}"
    );
    let offers: Value = market
        .view("get_offers")
        .args_json(json!({ "token_id": "0" }))
        .await
        .unwrap()
        .json()
        .unwrap();
    assert_eq!(offers[0]["buyer_id"], json!(e.bob.id()), "bob's offer is kept");
    let sold = owner_of(&e, "0").await == *e.bob.id();
    assert!(
        !sold || usdc_of(&e, &vault).await == 1_000_000,
        "bob paid 5 NEAR for token 0 but its vault was drained to {}",
        usdc_of(&e, &vault).await
    );

    // Control: refill the vault and accept again; the pinned balance now holds, so it sells.
    ok(e.alice
        .call(e.usdc.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": vault, "amount": "1000000", "msg": "" }))
        .deposit(YOCTO)
        .max_gas()
        .transact()
        .await
        .unwrap());
    let r = e
        .alice
        .call(e.nft.id(), "nft_approve")
        .args_json(json!({
            "token_id": "0",
            "account_id": market.id(),
            "msg": json!({ "accept_offer": {
                "buyer_id": e.bob.id(),
                "amount": NearToken::from_near(5).as_yoctonear().to_string(),
            } }).to_string(),
        }))
        .deposit(NearToken::from_millinear(10))
        .gas(near_workspaces::types::Gas::from_tgas(250))
        .transact()
        .await
        .unwrap();
    assert!(r.is_success(), "{r:#?}");
    assert!(r.logs().iter().any(|l| l.contains(r#""event":"offer_accept""#)), "{r:#?}");
    assert_eq!(owner_of(&e, "0").await, *e.bob.id());
    assert_eq!(usdc_of(&e, &vault).await, 1_000_000);
}

/// H-2: offers used to store an unbounded caller-chosen `token_id` in storage the market paid
/// for out of other buyers' escrow, so a few 0.01 NEAR offers froze honest refunds. Now ids are
/// bounded and every offer escrows `offer_storage_cost()` for its own storage.
#[tokio::test]
async fn h2_long_token_id_offers_must_not_freeze_other_buyers_escrow() {
    let e = setup().await;
    let market = deploy_market(&e, 10).await;
    // Leave the market a realistic 0.3 NEAR above its storage stake.
    let info = market.view_account().await.unwrap();
    let staked = info.storage_usage as u128 * 10u128.pow(19);
    let excess = info.balance.as_yoctonear() - staked - NearToken::from_millinear(300).as_yoctonear();
    ok(market
        .as_account()
        .transfer_near(e.root.id(), NearToken::from_yoctonear(excess))
        .await
        .unwrap());
    let storage: String = market.view("offer_storage_cost").await.unwrap().json().unwrap();
    let storage: u128 = storage.parse().unwrap();
    let expires_at = e.worker.view_block().await.unwrap().timestamp() / 1_000_000 + 3_600_000;
    let offer = |who: &Account, token_id: String, min_balances: Value| {
        who.call(market.id(), "offer")
            .args_json(json!({
                "token_id": token_id,
                "amount": NearToken::from_millinear(10).as_yoctonear().to_string(),
                "expires_at": expires_at,
                "min_balances": min_balances,
            }))
            .deposit(NearToken::from_yoctonear(NearToken::from_millinear(10).as_yoctonear() + storage))
            .max_gas()
            .transact()
    };

    // Long ids are rejected outright.
    let mallory = sub(&e.root, "mallory", 10).await;
    let r = offer(&mallory, "x".repeat(1900), json!([])).await.unwrap();
    assert!(r.is_failure(), "1.9 kB token id accepted");

    // The largest allowed offer (20-digit id, 64-char buyer, 4 x 64-char ft ids, both index
    // sets new) fits the storage it pays for.
    let long = sub(&e.root, &"l".repeat(64 - ".test.near".len()), 10).await;
    assert_eq!(long.id().len(), 64);
    let fts: Vec<_> = (0..4)
        .map(|i| json!({ "ft_id": format!("{i}{}", "f".repeat(63)), "amount": u128::MAX.to_string() }))
        .collect();
    let before = market.view_account().await.unwrap().storage_usage;
    ok(offer(&long, "9".repeat(20), json!(fts)).await.unwrap());
    let used = market.view_account().await.unwrap().storage_usage - before;
    println!("largest offer used {used} bytes");
    assert!(used as u128 * 10u128.pow(19) <= storage, "offer used {used} bytes");

    // Many short-id offers never eat into bob's escrow.
    ok(e.bob
        .call(market.id(), "offer")
        .args_json(json!({ "token_id": "0", "amount": NearToken::from_near(1).as_yoctonear().to_string(), "expires_at": expires_at }))
        .deposit(NearToken::from_yoctonear(NearToken::from_near(1).as_yoctonear() + storage))
        .transact()
        .await
        .unwrap());
    for i in 0..20 {
        ok(offer(&mallory, format!("{}", 10_000_000 + i), json!([])).await.unwrap());
    }
    let r = e
        .bob
        .call(market.id(), "cancel_offer")
        .args_json(json!({ "token_id": "0" }))
        .deposit(YOCTO)
        .max_gas()
        .transact()
        .await
        .unwrap();
    assert!(r.is_success(), "bob cannot get his 1 NEAR back: {:?}", r.failures());
}

/// I9 check: `nft_resolve_transfer` gets a fixed 5 Tgas from near-contract-standards (unused gas
/// weight 0). If the revert path runs out of gas, the lock is never removed and the token is
/// stuck with the receiver forever. Exercised with no approvals and with 30 approvals.
#[tokio::test]
async fn i9_transfer_call_revert_unlocks_with_many_approvals() {
    let e = setup().await;
    for (token_id, approvals) in [("0", 0), ("1", 30)] {
        mint(&e, token_id).await;
        for i in 0..approvals {
            ok(e.alice
                .call(e.nft.id(), "nft_approve")
                .args_json(json!({ "token_id": token_id, "account_id": format!("approved-{i:02}.test.near") }))
                .deposit(NearToken::from_millinear(10))
                .max_gas()
                .transact()
                .await
                .unwrap());
        }
        // bob has no contract, so nft_on_transfer fails and the transfer must be reverted.
        let _ = e
            .alice
            .call(e.nft.id(), "nft_transfer_call")
            .args_json(json!({ "receiver_id": e.bob.id(), "token_id": token_id, "msg": "" }))
            .deposit(YOCTO)
            .max_gas()
            .transact()
            .await
            .unwrap();
        assert_eq!(owner_of(&e, token_id).await, *e.alice.id(), "token {token_id} returned");
        assert!(!is_locked(&e, token_id).await, "token {token_id} ({approvals} approvals) stays locked");
    }
    let _ = &e.worker;
}

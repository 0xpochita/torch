//! Real market against the real collection: list+buy, offer+accept, withdraw vs. sale races.
use integration_tests::near_workspaces::types::{Gas, NearToken};
use integration_tests::serde_json::{json, Value};
use integration_tests::*;

const PRICE: u128 = NEAR;
/// 2% of the price.
const FEE: u128 = PRICE * 200 / 10_000;
/// 2.5% of the 98% the market passes as the payout balance.
const ROYALTY: u128 = (PRICE - FEE) * 250 / 10_000;
const SELLER: u128 = PRICE - FEE - ROYALTY;

/// carol mints token "0" for alice, alice deposits 500k usdc into its vault.
async fn setup() -> Env {
    let e = Env::new().await;
    assert_eq!(e.mint(&e.carol, e.alice.id()).await, "0");
    e.deposit(&e.alice, "0", 500_000).await;
    e
}

async fn list(e: &Env) {
    let r = e
        .approve(
            &e.alice,
            "0",
            json!({ "list": { "price": PRICE.to_string() } }),
        )
        .await;
    ok(&r);
    assert!(has_event(&r, "list"));
    assert!(e
        .market_view("get_listing", json!({ "token_id": "0" }))
        .await
        .is_object());
}

async fn buy(e: &Env) -> integration_tests::near_workspaces::result::ExecutionFinalResult {
    e.bob
        .call(e.market.id(), "buy")
        .args_json(json!({ "token_id": "0" }))
        .deposit(NearToken::from_yoctonear(PRICE))
        .gas(Gas::from_tgas(200))
        .transact()
        .await
        .unwrap()
}

async fn storage_cost(e: &Env) -> u128 {
    let c: String = e
        .market
        .view("offer_storage_cost")
        .await
        .unwrap()
        .json()
        .unwrap();
    c.parse().unwrap()
}

/// bob offers `PRICE` on token "0", pinning the vault's usdc balance at `min_usdc`.
async fn offer(e: &Env, expires_at: u64, min_usdc: u128) {
    let r = e
        .bob
        .call(e.market.id(), "offer")
        .args_json(json!({
            "token_id": "0",
            "amount": PRICE.to_string(),
            "expires_at": expires_at,
            "min_balances": [{ "ft_id": e.usdc.id(), "amount": min_usdc.to_string() }],
        }))
        .deposit(NearToken::from_yoctonear(PRICE + storage_cost(e).await))
        .gas(Gas::from_tgas(50))
        .transact()
        .await
        .unwrap();
    ok(&r);
    assert!(has_event(&r, "offer"));
}

async fn now_ms(e: &Env) -> u64 {
    e.worker.view_block().await.unwrap().timestamp() / 1_000_000
}

async fn accept(e: &Env) -> integration_tests::near_workspaces::result::ExecutionFinalResult {
    e.approve(
        &e.alice,
        "0",
        json!({ "accept_offer": { "buyer_id": e.bob.id(), "amount": PRICE.to_string() } }),
    )
    .await
}

#[tokio::test]
async fn list_and_buy_pays_exact_fee_and_royalty() {
    let e = setup().await;
    list(&e).await;
    e.settle().await;
    let (alice0, carol0, fee0, bob0) = (
        e.near_balance(e.alice.id()).await,
        e.near_balance(e.carol.id()).await,
        e.near_balance(e.fee.id()).await,
        e.near_balance(e.bob.id()).await,
    );

    let r = buy(&e).await;
    ok(&r);
    assert_eq!(
        events(&r, "sale")[0],
        json!({ "token_id": "0", "seller_id": e.alice.id(), "buyer_id": e.bob.id(), "price": PRICE.to_string(), "fee": FEE.to_string() })
    );
    e.settle().await;
    assert_eq!(e.near_balance(e.fee.id()).await - fee0, FEE);
    assert_eq!(e.near_balance(e.carol.id()).await - carol0, ROYALTY);
    assert_eq!(e.near_balance(e.alice.id()).await - alice0, SELLER);
    let bob_spent = bob0 - e.near_balance(e.bob.id()).await;
    assert!(
        bob_spent > PRICE && bob_spent < PRICE + NEAR / 100,
        "{bob_spent}"
    );
    assert_eq!(e.owner_of("0").await, e.bob.id().as_str());
    assert!(e
        .market_view("get_listing", json!({ "token_id": "0" }))
        .await
        .is_null());

    // The basket moved with the NFT: bob withdraws it, alice cannot.
    assert!(e.withdraw(&e.alice, "0", 1).await.is_failure());
    ok(&e.withdraw(&e.bob, "0", 500_000).await);
    assert_eq!(e.ft_balance(&e.usdc, e.bob.id()).await, 500_000);
}

#[tokio::test]
async fn offer_then_accept() {
    let e = setup().await;
    offer(&e, now_ms(&e).await + 3_600_000, 500_000).await;
    let offers = e
        .market_view("get_offers", json!({ "token_id": "0" }))
        .await;
    assert_eq!(offers[0]["amount"], PRICE.to_string());
    let storage = storage_cost(&e).await;
    assert_eq!(offers[0]["storage_deposit"], storage.to_string());
    e.settle().await;
    let (alice0, carol0, fee0, bob0) = (
        e.near_balance(e.alice.id()).await,
        e.near_balance(e.carol.id()).await,
        e.near_balance(e.fee.id()).await,
        e.near_balance(e.bob.id()).await,
    );

    let r = accept(&e).await;
    ok(&r);
    assert!(has_event(&r, "offer_accept"));
    e.settle().await;
    assert_eq!(e.owner_of("0").await, e.bob.id().as_str());
    assert_eq!(e.near_balance(e.fee.id()).await - fee0, FEE);
    assert_eq!(e.near_balance(e.carol.id()).await - carol0, ROYALTY);
    // The storage deposit goes back to the buyer with the sale.
    assert_eq!(e.near_balance(e.bob.id()).await - bob0, storage);
    // Alice signed the approve, so she paid its gas (< 0.01 NEAR) out of her share.
    let gained = e.near_balance(e.alice.id()).await - alice0;
    assert!(gained <= SELLER && gained > SELLER - NEAR / 100, "{gained}");
    assert_eq!(
        e.market_view("get_offers", json!({ "token_id": "0" }))
            .await,
        json!([])
    );
    assert_eq!(e.ft_balance(&e.usdc, &e.vault_of("0")).await, 500_000);
}

/// Audit H-1: the seller drains the vault below the buyer's pin, then accepts. Nothing is sold
/// and the offer stays live.
#[tokio::test]
async fn accept_after_draining_the_vault_fails() {
    let e = setup().await;
    offer(&e, now_ms(&e).await + 3_600_000, 500_000).await;
    ok(&e.withdraw(&e.alice, "0", 100_000).await);

    let r = accept(&e).await;
    assert!(!has_event(&r, "offer_accept"), "{r:#?}");
    assert_eq!(e.owner_of("0").await, e.alice.id().as_str());
    let offers = e
        .market_view("get_offers", json!({ "token_id": "0" }))
        .await;
    assert_eq!(offers[0]["amount"], PRICE.to_string());

    // A replaced (smaller) offer cannot settle at the amount the seller signed for (H-3).
    let r = e
        .approve(
            &e.alice,
            "0",
            json!({ "accept_offer": { "buyer_id": e.bob.id(), "amount": (PRICE * 2).to_string() } }),
        )
        .await;
    assert!(!has_event(&r, "offer_accept"));
    assert_eq!(e.owner_of("0").await, e.alice.id().as_str());
}

/// Listed: a withdraw and a buy race. The withdraw must lose (listed tokens cannot be drained),
/// so the buyer gets the full basket.
#[tokio::test]
async fn withdraw_loses_to_sale_while_listed() {
    let e = setup().await;
    list(&e).await;
    let vault = e.vault_of("0");
    let w = e
        .alice
        .call(e.nft.id(), "withdraw")
        .args_json(json!({ "token_id": "0", "ft_id": e.usdc.id(), "amount": "500000" }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(100))
        .transact_async()
        .await
        .unwrap();
    let b = e
        .bob
        .call(e.market.id(), "buy")
        .args_json(json!({ "token_id": "0" }))
        .deposit(NearToken::from_yoctonear(PRICE))
        .gas(Gas::from_tgas(200))
        .transact_async()
        .await
        .unwrap();
    let (w, b) = (w.await.unwrap(), b.await.unwrap());
    assert!(w.is_failure(), "{w:#?}");
    ok(&b);
    assert!(has_event(&b, "sale"));
    assert_eq!(e.owner_of("0").await, e.bob.id().as_str());
    assert_eq!(e.ft_balance(&e.usdc, &vault).await, 500_000);
}

/// The seller revokes the market (stale listing) and withdraws while a buy is in flight: the
/// withdraw wins, the sale fails and the buyer gets the price back.
#[tokio::test]
async fn sale_fails_while_withdraw_in_flight() {
    let e = setup().await;
    list(&e).await;
    ok(&e
        .alice
        .call(e.nft.id(), "nft_revoke_all")
        .args_json(json!({ "token_id": "0" }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await
        .unwrap());
    // The market only learns about the revoke when a sale fails.
    assert!(e
        .market_view("get_listing", json!({ "token_id": "0" }))
        .await
        .is_object());
    e.settle().await;
    let (bob0, fee0) = (
        e.near_balance(e.bob.id()).await,
        e.near_balance(e.fee.id()).await,
    );

    let w = e
        .alice
        .call(e.nft.id(), "withdraw")
        .args_json(json!({ "token_id": "0", "ft_id": e.usdc.id(), "amount": "200000" }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(100))
        .transact_async()
        .await
        .unwrap();
    let b = e
        .bob
        .call(e.market.id(), "buy")
        .args_json(json!({ "token_id": "0" }))
        .deposit(NearToken::from_yoctonear(PRICE))
        .gas(Gas::from_tgas(200))
        .transact_async()
        .await
        .unwrap();
    let (w, b) = (w.await.unwrap(), b.await.unwrap());
    ok(&w);
    assert!(has_event(&w, "vault_withdraw"));
    assert!(!has_event(&b, "sale") && has_event(&b, "delist"), "{b:#?}");
    assert_eq!(b.json::<Value>().unwrap(), json!(false));
    e.settle().await;
    assert_eq!(e.owner_of("0").await, e.alice.id().as_str());
    assert_eq!(e.ft_balance(&e.usdc, &e.vault_of("0")).await, 300_000);
    let bob_spent = bob0 - e.near_balance(e.bob.id()).await;
    assert!(bob_spent < NEAR / 100, "bob only pays gas: {bob_spent}");
    assert_eq!(e.near_balance(e.fee.id()).await, fee0);
    assert!(e
        .market_view("get_listing", json!({ "token_id": "0" }))
        .await
        .is_null());
}

#[tokio::test]
async fn expired_offer_is_refundable_by_anyone() {
    let e = setup().await;
    let expires = now_ms(&e).await + 5_000;
    offer(&e, expires, 0).await;
    let refund = || async {
        e.carol
            .call(e.market.id(), "refund_expired")
            .args_json(json!({ "token_id": "0", "buyer_id": e.bob.id() }))
            .transact()
            .await
            .unwrap()
    };
    assert!(
        refund().await.is_failure(),
        "refund before expiry must fail"
    );
    // An expired offer cannot be accepted either.
    e.worker.fast_forward(100).await.unwrap();
    assert!(!has_event(&accept(&e).await, "offer_accept"));
    assert_eq!(e.owner_of("0").await, e.alice.id().as_str());

    e.settle().await;
    let bob0 = e.near_balance(e.bob.id()).await;
    let r = refund().await;
    ok(&r);
    assert!(has_event(&r, "offer_cancel"));
    e.settle().await;
    assert_eq!(
        e.near_balance(e.bob.id()).await - bob0,
        PRICE + storage_cost(&e).await
    );
    assert_eq!(
        e.market_view("get_offers_by_buyer", json!({ "account_id": e.bob.id() }))
            .await,
        json!([])
    );
}

#[tokio::test]
async fn cancel_and_delist_need_one_yocto_and_prune_drops_stale_listings() {
    let e = setup().await;
    offer(&e, now_ms(&e).await + 3_600_000, 0).await;
    let cancel = |yocto: u128| {
        e.bob
            .call(e.market.id(), "cancel_offer")
            .args_json(json!({ "token_id": "0" }))
            .deposit(NearToken::from_yoctonear(yocto))
            .transact()
    };
    assert!(cancel(0).await.unwrap().is_failure());
    let r = cancel(1).await.unwrap();
    ok(&r);
    assert!(has_event(&r, "offer_cancel"));

    list(&e).await;
    let delist = |yocto: u128| {
        e.alice
            .call(e.market.id(), "delist")
            .args_json(json!({ "token_id": "0" }))
            .deposit(NearToken::from_yoctonear(yocto))
            .transact()
    };
    assert!(delist(0).await.unwrap().is_failure());
    ok(&delist(1).await.unwrap());
    assert!(e
        .market_view("get_listing", json!({ "token_id": "0" }))
        .await
        .is_null());

    // List again, then move the token outside the market: anyone can prune the stale listing.
    list(&e).await;
    let prune = || {
        e.carol
            .call(e.market.id(), "prune_listing")
            .args_json(json!({ "token_id": "0" }))
            .gas(Gas::from_tgas(50))
            .transact()
    };
    ok(&prune().await.unwrap());
    assert!(e
        .market_view("get_listing", json!({ "token_id": "0" }))
        .await
        .is_object());
    ok(&e
        .alice
        .call(e.nft.id(), "nft_transfer")
        .args_json(json!({ "receiver_id": e.carol.id(), "token_id": "0" }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await
        .unwrap());
    ok(&prune().await.unwrap());
    assert!(e
        .market_view("get_listing", json!({ "token_id": "0" }))
        .await
        .is_null());
}

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

/// Wave 2 market: an offer attaches `amount + offer_storage_cost()`.
async fn offer_storage(e: &Env) -> u128 {
    e.market_view("offer_storage_cost", json!({}))
        .await
        .as_str()
        .unwrap()
        .parse()
        .unwrap()
}

#[tokio::test]
async fn offer_then_accept() {
    let e = setup().await;
    let now_ms = e.worker.view_block().await.unwrap().timestamp() / 1_000_000;
    let r = e
        .bob
        .call(e.market.id(), "offer")
        .args_json(json!({ "token_id": "0", "amount": PRICE.to_string(), "expires_at": now_ms + 3_600_000 }))
        .deposit(NearToken::from_yoctonear(PRICE + offer_storage(&e).await))
        .transact()
        .await
        .unwrap();
    ok(&r);
    assert!(has_event(&r, "offer"));
    let offers = e
        .market_view("get_offers", json!({ "token_id": "0" }))
        .await;
    assert_eq!(offers[0]["amount"], PRICE.to_string());
    e.settle().await;
    let (alice0, carol0, fee0) = (
        e.near_balance(e.alice.id()).await,
        e.near_balance(e.carol.id()).await,
        e.near_balance(e.fee.id()).await,
    );

    let r = e
        .approve(
            &e.alice,
            "0",
            json!({ "accept_offer": { "buyer_id": e.bob.id(), "amount": PRICE.to_string() } }),
        )
        .await;
    ok(&r);
    assert!(has_event(&r, "offer_accept"));
    e.settle().await;
    assert_eq!(e.owner_of("0").await, e.bob.id().as_str());
    assert_eq!(e.near_balance(e.fee.id()).await - fee0, FEE);
    assert_eq!(e.near_balance(e.carol.id()).await - carol0, ROYALTY);
    // Alice signed the approve, so she paid its gas (< 0.01 NEAR) out of her share.
    let gained = e.near_balance(e.alice.id()).await - alice0;
    assert!(gained <= SELLER && gained > SELLER - NEAR / 100, "{gained}");
    assert_eq!(
        e.market_view("get_offers", json!({ "token_id": "0" }))
            .await,
        json!([])
    );
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
    let now_ms = e.worker.view_block().await.unwrap().timestamp() / 1_000_000;
    let expires = now_ms + 5_000;
    ok(&e
        .bob
        .call(e.market.id(), "offer")
        .args_json(json!({ "token_id": "0", "amount": PRICE.to_string(), "expires_at": expires }))
        .deposit(NearToken::from_yoctonear(PRICE + offer_storage(&e).await))
        .transact()
        .await
        .unwrap());
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
    let r = e
        .approve(
            &e.alice,
            "0",
            json!({ "accept_offer": { "buyer_id": e.bob.id(), "amount": PRICE.to_string() } }),
        )
        .await;
    assert!(!has_event(&r, "offer_accept"));
    assert_eq!(e.owner_of("0").await, e.alice.id().as_str());

    e.settle().await;
    let bob0 = e.near_balance(e.bob.id()).await;
    let r = refund().await;
    ok(&r);
    assert!(has_event(&r, "offer_cancel"));
    e.settle().await;
    // Wave 2 market: the refund returns the offer storage deposit too.
    assert_eq!(
        e.near_balance(e.bob.id()).await - bob0,
        PRICE + offer_storage(&e).await
    );
    assert_eq!(
        e.market_view("get_offers_by_buyer", json!({ "account_id": e.bob.id() }))
            .await,
        json!([])
    );
}

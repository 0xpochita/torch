//! Sandbox tests against `tests/mock-nft`, a NEP-171/178/199 stand-in for the collection.
use near_workspaces::network::Sandbox;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};
use std::path::Path;
use std::process::Command;

const NEAR: u128 = 10u128.pow(24);
const PRICE: u128 = NEAR;
const FEE: u128 = PRICE / 50;
const ROYALTY: u128 = (PRICE - FEE) * 250 / 10_000;
/// `OFFER_STORAGE_BYTES` (2000) at 10^19 yocto per byte.
const OFFER_STORAGE: u128 = 2_000 * 10u128.pow(19);

/// The market is a workspace member, so its wasm lands in the workspace target dir.
fn build_market(root: &Path) -> Vec<u8> {
    let status = Command::new("cargo")
        .args(["near", "build", "non-reproducible-wasm", "--no-abi"])
        .current_dir(root)
        .status()
        .unwrap();
    assert!(status.success(), "market wasm build failed");
    std::fs::read(root.join("../target/near/market/market.wasm")).unwrap()
}

fn build(manifest_dir: &Path, wasm: &str) -> Vec<u8> {
    let status = Command::new(env!("CARGO"))
        .args(["build", "--release", "--target", "wasm32-unknown-unknown"])
        .current_dir(manifest_dir)
        .status()
        .unwrap();
    assert!(status.success(), "wasm build failed in {manifest_dir:?}");
    std::fs::read(manifest_dir.join("target/wasm32-unknown-unknown/release").join(wasm)).unwrap()
}

struct Env {
    worker: Worker<Sandbox>,
    nft: Contract,
    market: Contract,
    alice: Account,
    bob: Account,
    creator: Account,
    fee: Account,
}

async fn setup() -> Env {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let market_wasm = build_market(root);
    let nft_wasm = build(&root.join("tests/mock-nft"), "mock_nft.wasm");

    let worker = near_workspaces::sandbox().await.unwrap();
    let nft = worker.dev_deploy(&nft_wasm).await.unwrap();
    let market = worker.dev_deploy(&market_wasm).await.unwrap();
    let alice = worker.dev_create_account().await.unwrap();
    let bob = worker.dev_create_account().await.unwrap();
    let creator = worker.dev_create_account().await.unwrap();
    let fee = worker.dev_create_account().await.unwrap();

    nft.call("new").transact().await.unwrap().into_result().unwrap();
    market
        .call("new")
        .args_json(json!({ "collection_id": nft.id(), "fee_receiver_id": fee.id() }))
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
    nft.call("mint")
        .args_json(json!({ "token_id": "0", "owner_id": alice.id(), "creator_id": creator.id() }))
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
    Env { worker, nft, market, alice, bob, creator, fee }
}

impl Env {
    async fn approve(&self, msg: Value) -> near_workspaces::result::ExecutionFinalResult {
        self.alice
            .call(self.nft.id(), "nft_approve")
            .args_json(json!({ "token_id": "0", "account_id": self.market.id(), "msg": msg.to_string() }))
            .deposit(NearToken::from_millinear(10))
            .gas(Gas::from_tgas(250))
            .transact()
            .await
            .unwrap()
    }

    async fn list(&self) {
        let r = self.approve(json!({ "list": { "price": PRICE.to_string() } })).await;
        assert!(r.is_success(), "{r:#?}");
        assert!(self.view("get_listing", json!({ "token_id": "0" })).await.is_object());
        // Let the approve's gas refund land before tests snapshot balances.
        self.worker.fast_forward(5).await.unwrap();
    }

    async fn buy(&self) -> near_workspaces::result::ExecutionFinalResult {
        self.bob
            .call(self.market.id(), "buy")
            .args_json(json!({ "token_id": "0" }))
            .deposit(NearToken::from_yoctonear(PRICE))
            .gas(Gas::from_tgas(200))
            .transact()
            .await
            .unwrap()
    }

    async fn offer(&self, expires_at: u64) {
        let r = self
            .bob
            .call(self.market.id(), "offer")
            .args_json(json!({ "token_id": "0", "amount": PRICE.to_string(), "expires_at": expires_at }))
            .deposit(NearToken::from_yoctonear(PRICE + OFFER_STORAGE))
            .transact()
            .await
            .unwrap();
        assert!(r.is_success(), "{r:#?}");
    }

    async fn view(&self, method: &str, args: Value) -> Value {
        self.market.view(method).args_json(args).await.unwrap().json().unwrap()
    }

    async fn owner(&self) -> String {
        let token: Value = self
            .nft
            .view("nft_token")
            .args_json(json!({ "token_id": "0" }))
            .await
            .unwrap()
            .json()
            .unwrap();
        token["owner_id"].as_str().unwrap().to_string()
    }

    async fn balance(&self, account: &Account) -> u128 {
        account.view_account().await.unwrap().balance.as_yoctonear()
    }

    async fn now_ms(&self) -> u64 {
        self.worker.view_block().await.unwrap().timestamp() / 1_000_000
    }
}

fn has_event(r: &near_workspaces::result::ExecutionFinalResult, event: &str) -> bool {
    r.logs().iter().any(|l| l.contains(&format!(r#""event":"{event}""#)))
}

#[tokio::test]
async fn buy_pays_seller_creator_and_fee() {
    let e = setup().await;
    e.list().await;
    let (alice0, creator0, fee0) =
        (e.balance(&e.alice).await, e.balance(&e.creator).await, e.balance(&e.fee).await);

    let r = e.buy().await;
    assert!(r.is_success() && has_event(&r, "sale"), "{r:#?}");
    assert_eq!(e.owner().await, e.bob.id().as_str());
    assert_eq!(e.balance(&e.fee).await - fee0, FEE);
    assert_eq!(e.balance(&e.creator).await - creator0, ROYALTY);
    assert_eq!(e.balance(&e.alice).await - alice0, PRICE - FEE - ROYALTY);
    assert!(e.view("get_listing", json!({ "token_id": "0" })).await.is_null());
}

#[tokio::test]
async fn accept_offer_through_approve() {
    let e = setup().await;
    let expires = e.now_ms().await + 3_600_000;
    e.offer(expires).await;
    let offers = e.view("get_offers", json!({ "token_id": "0" })).await;
    assert_eq!(offers[0]["amount"], PRICE.to_string());
    let (alice0, fee0) = (e.balance(&e.alice).await, e.balance(&e.fee).await);

    let r = e
        .approve(json!({ "accept_offer": { "buyer_id": e.bob.id(), "amount": PRICE.to_string() } }))
        .await;
    assert!(r.is_success() && has_event(&r, "offer_accept"), "{r:#?}");
    assert_eq!(e.owner().await, e.bob.id().as_str());
    assert_eq!(e.balance(&e.fee).await - fee0, FEE);
    // Alice paid gas for the approve, so only check she got close to her 95.55%.
    let gained = e.balance(&e.alice).await - alice0;
    assert!(gained > PRICE - FEE - ROYALTY - NEAR / 100, "alice gained {gained}");
    assert_eq!(e.view("get_offers", json!({ "token_id": "0" })).await, json!([]));
}

#[tokio::test]
async fn expired_offer_is_refundable_by_anyone() {
    let e = setup().await;
    let expires = e.now_ms().await + 5_000;
    e.offer(expires).await;

    let refund = || async {
        e.alice
            .call(e.market.id(), "refund_expired")
            .args_json(json!({ "token_id": "0", "buyer_id": e.bob.id() }))
            .transact()
            .await
            .unwrap()
    };
    let early = refund().await;
    assert!(early.is_failure(), "refund before expiry must fail");

    e.worker.fast_forward(100).await.unwrap();
    assert!(e.now_ms().await >= expires);
    let bob0 = e.balance(&e.bob).await;
    let r = refund().await;
    assert!(r.is_success() && has_event(&r, "offer_cancel"), "{r:#?}");
    assert_eq!(e.balance(&e.bob).await - bob0, PRICE + OFFER_STORAGE);
    assert_eq!(e.view("get_offers_by_buyer", json!({ "account_id": e.bob.id() })).await, json!([]));
}

#[tokio::test]
async fn failed_sale_refunds_buyer() {
    let e = setup().await;
    e.list().await;
    // Vault withdraw in flight: the collection rejects nft_transfer_payout with "token busy".
    e.nft
        .call("lock")
        .args_json(json!({ "token_id": "0" }))
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
    let (bob0, fee0) = (e.balance(&e.bob).await, e.balance(&e.fee).await);

    let r = e.buy().await;
    assert!(!has_event(&r, "sale") && has_event(&r, "delist"), "{r:#?}");
    assert_eq!(e.owner().await, e.alice.id().as_str());
    // Bob only lost gas.
    let spent = bob0 - e.balance(&e.bob).await;
    assert!(spent < NEAR / 100, "bob spent {spent}");
    assert_eq!(e.balance(&e.fee).await, fee0);
    assert!(e.view("get_listing", json!({ "token_id": "0" })).await.is_null());
}

#[tokio::test]
async fn stale_listing_after_transfer_refunds_buyer() {
    let e = setup().await;
    e.list().await;
    // Token moves outside the market; NEP-178 clears the market's approval.
    e.alice
        .call(e.nft.id(), "nft_transfer")
        .args_json(json!({ "receiver_id": e.creator.id(), "token_id": "0" }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
    let bob0 = e.balance(&e.bob).await;
    let r = e.buy().await;
    assert!(!has_event(&r, "sale"), "{r:#?}");
    assert_eq!(e.owner().await, e.creator.id().as_str());
    assert!(bob0 - e.balance(&e.bob).await < NEAR / 100);
    assert!(e.view("get_listing", json!({ "token_id": "0" })).await.is_null());
}

#[tokio::test]
async fn stale_listing_can_be_pruned_by_anyone() {
    let e = setup().await;
    e.list().await;
    let prune = || async {
        e.bob
            .call(e.market.id(), "prune_listing")
            .args_json(json!({ "token_id": "0" }))
            .gas(Gas::from_tgas(50))
            .transact()
            .await
            .unwrap()
    };
    let r = prune().await;
    assert!(!has_event(&r, "delist"), "a live listing stays: {r:#?}");
    assert!(e.view("get_listing", json!({ "token_id": "0" })).await.is_object());
    e.alice
        .call(e.nft.id(), "nft_revoke")
        .args_json(json!({ "token_id": "0", "account_id": e.market.id() }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
    let r = prune().await;
    assert!(has_event(&r, "delist"), "{r:#?}");
    assert!(e.view("get_listing", json!({ "token_id": "0" })).await.is_null());
}

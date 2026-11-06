use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{test_vm_config, testing_env, PromiseResult, RuntimeFeesConfig};

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn ctx(predecessor: &str, deposit: u128, now_ms: u64) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(acc("market.near"))
        .predecessor_account_id(acc(predecessor))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(now_ms * 1_000_000)
        .build());
}

fn callback_ctx(result: PromiseResult) {
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(acc("market.near"))
            .predecessor_account_id(acc("market.near"))
            .build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
}

fn setup() -> Market {
    ctx("admin.near", 0, 0);
    Market::new(acc("nft.near"), acc("fee.near"))
}

fn list(m: &mut Market, token: &str, seller: &str, price: u128) {
    ctx("nft.near", 0, 1);
    let msg = format!(r#"{{"list":{{"price":"{price}"}}}}"#);
    let _ = m.nft_on_approve(token.into(), acc(seller), 7, msg);
}

const NEAR: u128 = 10u128.pow(24);

#[test]
fn list_creates_listing_and_event() {
    let mut m = setup();
    list(&mut m, "0", "alice.near", NEAR);
    let l = m.get_listing("0".into()).unwrap();
    assert_eq!((l.seller_id.as_str(), l.price.0, l.approval_id), ("alice.near", NEAR, 7));
    assert!(get_logs()[0].contains(r#""event":"list""#));
    assert_eq!(m.get_listings(None, None).len(), 1);
}

#[test]
#[should_panic(expected = "only the collection")]
fn on_approve_rejects_other_callers() {
    let mut m = setup();
    ctx("evil.near", 0, 1);
    let _ = m.nft_on_approve("0".into(), acc("alice.near"), 1, r#"{"list":{"price":"1"}}"#.into());
}

#[test]
#[should_panic(expected = "attached deposit must equal")]
fn buy_requires_exact_price() {
    let mut m = setup();
    list(&mut m, "0", "alice.near", NEAR);
    ctx("bob.near", NEAR - 1, 2);
    let _ = m.buy("0".into());
}

#[test]
#[should_panic(expected = "only the seller")]
fn delist_only_seller() {
    let mut m = setup();
    list(&mut m, "0", "alice.near", NEAR);
    ctx("bob.near", 0, 2);
    m.delist("0".into());
}

#[test]
fn failed_sale_refunds_and_drops_listing() {
    let mut m = setup();
    list(&mut m, "0", "alice.near", NEAR);
    ctx("bob.near", NEAR, 2);
    let _ = m.buy("0".into());
    assert!(m.get_listing("0".into()).is_none());
    let listing = Listing {
        token_id: "0".into(),
        seller_id: acc("alice.near"),
        price: U128(NEAR),
        approval_id: 7,
        listed_at: 1,
    };
    callback_ctx(PromiseResult::Failed);
    assert!(!m.on_buy(acc("bob.near"), listing));
    assert!(get_logs()[0].contains(r#""event":"delist""#));
}

#[test]
fn successful_sale_emits_fee() {
    let mut m = setup();
    let listing = Listing {
        token_id: "0".into(),
        seller_id: acc("alice.near"),
        price: U128(NEAR),
        approval_id: 7,
        listed_at: 1,
    };
    let payout = br#"{"payout":{"alice.near":"955500000000000000000000","creator.near":"24500000000000000000000"}}"#;
    callback_ctx(PromiseResult::Successful(payout.to_vec()));
    assert!(m.on_buy(acc("bob.near"), listing));
    let log = &get_logs()[0];
    assert!(log.contains(r#""event":"sale""#) && log.contains(r#""fee":"20000000000000000000000""#));
}

#[test]
fn offer_replace_and_expiry() {
    let mut m = setup();
    ctx("bob.near", NEAR, 10);
    m.offer("0".into(), 100);
    ctx("bob.near", 2 * NEAR, 20);
    m.offer("0".into(), 100);
    // The replaced offer is refunded (offer_cancel) before the new offer event.
    let logs = get_logs();
    assert!(logs[0].contains("offer_cancel") && logs[1].contains(r#""event":"offer""#));
    let offers = m.get_offers("0".into());
    assert_eq!((offers.len(), offers[0].amount.0), (1, 2 * NEAR));
    assert_eq!(m.get_offers_by_buyer(acc("bob.near")).len(), 1);

    ctx("anyone.near", 0, 100);
    m.refund_expired("0".into(), acc("bob.near"));
    assert!(m.get_offers("0".into()).is_empty());
}

#[test]
#[should_panic(expected = "offer has not expired")]
fn refund_expired_rejects_live_offer() {
    let mut m = setup();
    ctx("bob.near", NEAR, 10);
    m.offer("0".into(), 100);
    ctx("anyone.near", 0, 99);
    m.refund_expired("0".into(), acc("bob.near"));
}

#[test]
#[should_panic(expected = "offer expired")]
fn accept_rejects_expired_offer() {
    let mut m = setup();
    ctx("bob.near", NEAR, 10);
    m.offer("0".into(), 100);
    ctx("nft.near", 0, 100);
    let msg = r#"{"accept_offer":{"buyer_id":"bob.near"}}"#.to_string();
    let _ = m.nft_on_approve("0".into(), acc("alice.near"), 1, msg);
}

#[test]
fn failed_accept_restores_offer() {
    let mut m = setup();
    ctx("bob.near", NEAR, 10);
    m.offer("0".into(), 100);
    ctx("nft.near", 0, 20);
    let msg = r#"{"accept_offer":{"buyer_id":"bob.near"}}"#.to_string();
    let _ = m.nft_on_approve("0".into(), acc("alice.near"), 1, msg);
    let offer = m.get_offers("0".into());
    assert!(offer.is_empty());
    let escrowed = Offer {
        token_id: "0".into(),
        buyer_id: acc("bob.near"),
        amount: U128(NEAR),
        expires_at: 100,
        created_at: 10,
    };
    callback_ctx(PromiseResult::Failed);
    assert!(!m.on_accept_offer(acc("alice.near"), escrowed.clone()));
    assert_eq!(m.get_offers("0".into()), vec![escrowed]);
}

#[test]
fn bad_payout_pays_seller_everything() {
    let m = setup();
    // Payout claims more than the balance: ignored, seller gets the full 98%.
    let p: Payout = serde_json::from_str(&format!(r#"{{"payout":{{"x.near":"{NEAR}"}}}}"#)).unwrap();
    assert_eq!(m.settle(&acc("alice.near"), NEAR, Some(p)), NEAR / 50);
    assert_eq!(split(NEAR), (NEAR / 50, NEAR - NEAR / 50));
}

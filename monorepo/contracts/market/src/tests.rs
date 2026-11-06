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
    callback_ctx_n(vec![result]);
}

fn callback_ctx_n(results: Vec<PromiseResult>) {
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(acc("market.near"))
            .predecessor_account_id(acc("market.near"))
            .build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        results
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
/// `OFFER_STORAGE_BYTES` at the unit-test storage price of 10^19 yocto per byte.
const STORAGE: u128 = OFFER_STORAGE_BYTES * 10u128.pow(19);

/// Bob offers `amount` on token 0 at `now`, attaching exactly amount + storage.
fn offer(m: &mut Market, amount: u128, now: u64, expires_at: u64, min: Option<Vec<MinBalance>>) {
    ctx("bob.near", amount + STORAGE, now);
    m.offer("0".into(), U128(amount), expires_at, min);
}

fn accept_msg(amount: u128) -> String {
    format!(r#"{{"accept_offer":{{"buyer_id":"bob.near","amount":"{amount}"}}}}"#)
}

fn escrowed(min_balances: Vec<MinBalance>) -> Offer {
    Offer {
        token_id: "0".into(),
        buyer_id: acc("bob.near"),
        amount: U128(NEAR),
        expires_at: 100,
        created_at: 10,
        storage_deposit: U128(STORAGE),
        min_balances,
    }
}

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
    ctx("bob.near", 1, 2);
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
    offer(&mut m, NEAR, 10, 100, None);
    offer(&mut m, 2 * NEAR, 20, 100, None);
    // The replaced offer is refunded (offer_cancel) before the new offer event.
    let logs = get_logs();
    assert!(logs[0].contains("offer_cancel") && logs[1].contains(r#""event":"offer""#));
    let offers = m.get_offers("0".into(), None, None);
    assert_eq!((offers.len(), offers[0].amount.0), (1, 2 * NEAR));
    assert_eq!(offers[0].storage_deposit.0, STORAGE);
    assert_eq!(m.get_offers_by_buyer(acc("bob.near"), None, None).len(), 1);

    ctx("anyone.near", 0, 100);
    m.refund_expired("0".into(), acc("bob.near"));
    assert!(m.get_offers("0".into(), None, None).is_empty());
    assert!(m.get_offers_by_buyer(acc("bob.near"), None, None).is_empty());
}

#[test]
fn offers_are_indexed_and_paginated() {
    let mut m = setup();
    for (buyer, token) in [("bob.near", "0"), ("bob.near", "1"), ("carol.near", "0")] {
        ctx(buyer, NEAR + STORAGE, 10);
        m.offer(token.into(), U128(NEAR), 100, None);
    }
    assert_eq!(m.get_offers("0".into(), None, None).len(), 2);
    assert_eq!(m.get_offers("0".into(), Some(U128(1)), Some(5)).len(), 1);
    assert_eq!(m.get_offers("1".into(), None, None).len(), 1);
    assert_eq!(m.get_offers_by_buyer(acc("bob.near"), None, Some(1)).len(), 1);
    ctx("carol.near", 1, 20);
    m.cancel_offer("0".into());
    assert_eq!(m.get_offers("0".into(), None, None)[0].buyer_id, acc("bob.near"));
    assert!(m.get_offers_by_buyer(acc("carol.near"), None, None).is_empty());
}

#[test]
#[should_panic(expected = "attach amount + offer_storage_cost()")]
fn offer_must_pay_storage() {
    let mut m = setup();
    ctx("bob.near", NEAR + STORAGE - 1, 10);
    m.offer("0".into(), U128(NEAR), 100, None);
}

#[test]
#[should_panic(expected = "invalid token id")]
fn offer_rejects_non_collection_token_id() {
    let mut m = setup();
    ctx("bob.near", NEAR + STORAGE, 10);
    m.offer("x".repeat(21), U128(NEAR), 100, None);
}

#[test]
#[should_panic(expected = "within a year")]
fn offer_expiry_is_capped() {
    let mut m = setup();
    offer(&mut m, NEAR, 10, u64::MAX, None);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn cancel_requires_one_yocto() {
    let mut m = setup();
    offer(&mut m, NEAR, 10, 100, None);
    ctx("bob.near", 0, 20);
    m.cancel_offer("0".into());
}

#[test]
#[should_panic(expected = "offer has not expired")]
fn refund_expired_rejects_live_offer() {
    let mut m = setup();
    offer(&mut m, NEAR, 10, 100, None);
    ctx("anyone.near", 0, 99);
    m.refund_expired("0".into(), acc("bob.near"));
}

#[test]
#[should_panic(expected = "offer expired")]
fn accept_rejects_expired_offer() {
    let mut m = setup();
    offer(&mut m, NEAR, 10, 100, None);
    ctx("nft.near", 0, 100);
    let _ = m.nft_on_approve("0".into(), acc("alice.near"), 1, accept_msg(NEAR));
}

#[test]
#[should_panic(expected = "offer amount changed")]
fn accept_rejects_swapped_offer() {
    let mut m = setup();
    offer(&mut m, 100 * NEAR, 10, 100, None);
    offer(&mut m, NEAR / 100, 11, 100, None);
    ctx("nft.near", 0, 20);
    let _ = m.nft_on_approve("0".into(), acc("alice.near"), 1, accept_msg(100 * NEAR));
}

#[test]
#[should_panic(expected = "invalid approve msg")]
fn accept_requires_amount() {
    let mut m = setup();
    offer(&mut m, NEAR, 10, 100, None);
    ctx("nft.near", 0, 20);
    let msg = r#"{"accept_offer":{"buyer_id":"bob.near"}}"#.to_string();
    let _ = m.nft_on_approve("0".into(), acc("alice.near"), 1, msg);
}

#[test]
fn failed_accept_restores_offer() {
    let mut m = setup();
    offer(&mut m, NEAR, 10, 100, None);
    ctx("nft.near", 0, 20);
    let _ = m.nft_on_approve("0".into(), acc("alice.near"), 1, accept_msg(NEAR));
    assert!(m.get_offers("0".into(), None, None).is_empty());
    callback_ctx(PromiseResult::Failed);
    assert!(!m.on_accept_offer(acc("alice.near"), escrowed(vec![])));
    assert_eq!(m.get_offers("0".into(), None, None), vec![escrowed(vec![])]);
}

#[test]
fn drained_vault_keeps_offer_and_skips_sale() {
    let mut m = setup();
    let min = vec![
        MinBalance { ft_id: acc("usdc.near"), amount: U128(1_000) },
        MinBalance { ft_id: acc("btc.near"), amount: U128(5) },
    ];
    // usdc fine, btc withdrawn below the floor.
    callback_ctx_n(vec![
        PromiseResult::Successful(br#""1000""#.to_vec()),
        PromiseResult::Successful(br#""4""#.to_vec()),
    ]);
    let r = m.on_balances_checked(acc("alice.near"), escrowed(min.clone()), 1);
    assert!(matches!(r, PromiseOrValue::Value(false)));
    assert_eq!(m.get_offers("0".into(), None, None), vec![escrowed(min.clone())]);

    // Both at the floor: proceeds to nft_transfer_payout.
    let mut m = setup();
    callback_ctx_n(vec![
        PromiseResult::Successful(br#""1000""#.to_vec()),
        PromiseResult::Successful(br#""5""#.to_vec()),
    ]);
    let r = m.on_balances_checked(acc("alice.near"), escrowed(min), 1);
    assert!(matches!(r, PromiseOrValue::Promise(_)));
}

#[test]
fn prune_drops_only_unapproved_listing() {
    let mut m = setup();
    list(&mut m, "0", "alice.near", NEAR);
    callback_ctx(PromiseResult::Successful(b"true".to_vec()));
    assert!(!m.on_prune_listing("0".into(), 7));
    callback_ctx(PromiseResult::Failed);
    assert!(!m.on_prune_listing("0".into(), 7));
    callback_ctx(PromiseResult::Successful(b"false".to_vec()));
    assert!(!m.on_prune_listing("0".into(), 8), "relisted under another approval");
    assert!(m.on_prune_listing("0".into(), 7));
    assert!(m.get_listing("0".into()).is_none());
}

#[test]
fn bad_payout_pays_seller_everything() {
    let m = setup();
    // Payout claims more than the balance: ignored, seller gets the full 98%.
    let p: Payout = serde_json::from_str(&format!(r#"{{"payout":{{"x.near":"{NEAR}"}}}}"#)).unwrap();
    assert_eq!(m.settle(&acc("alice.near"), NEAR, Some(p)), NEAR / 50);
    assert_eq!(split(NEAR), (NEAR / 50, NEAR - NEAR / 50));
}

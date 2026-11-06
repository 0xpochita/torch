use super::*;
use near_sdk::mock::{MockAction, Receipt};
use near_sdk::test_utils::{get_created_receipts, get_logs, VMContextBuilder};
use near_sdk::{testing_env, PromiseResult};

const PRICE: NearToken = NearToken::from_millinear(100);

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn tiers() -> Vec<Tier> {
    [
        ("Common", 6000),
        ("Rare", 2800),
        ("Epic", 1000),
        ("Legendary", 200),
    ]
    .into_iter()
    .map(|(rarity, weight_bps)| Tier {
        rarity: rarity.into(),
        weight_bps,
        baskets: vec![Basket {
            name: format!("{rarity} basket"),
            category: "Blue Chip".into(),
            bg: "#9fd3ff".into(),
            items: vec![
                Item {
                    token: acc("tusdc.t"),
                    amount: U128(1_000),
                },
                Item {
                    token: acc("tbtc.t"),
                    amount: U128(10),
                },
            ],
        }],
    })
    .collect()
}

fn ctx(predecessor: &str, deposit: NearToken, seed: [u8; 32]) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(acc("gacha.t"))
        .predecessor_account_id(acc(predecessor))
        .attached_deposit(deposit)
        .account_balance(NearToken::from_near(100))
        .random_seed(seed)
        .build());
}

fn setup() -> Gacha {
    ctx("owner.t", NearToken::from_yoctonear(0), [0; 32]);
    Gacha::new(
        acc("owner.t"),
        acc("nft.t"),
        U128(PRICE.as_yoctonear()),
        50,
        tiers(),
    )
}

fn fund(g: &mut Gacha, token: &str, amount: u128) {
    ctx(token, NearToken::from_yoctonear(0), [0; 32]);
    g.ft_on_transfer(acc("owner.t"), U128(amount), "fund".into());
}

fn treasury(g: &Gacha, token: &str) -> u128 {
    g.get_treasury()
        .into_iter()
        .find(|(t, _)| t.as_str() == token)
        .map_or(0, |(_, a)| a.0)
}

fn rarity_of(g: &Gacha, seed: [u8; 32], i: u8) -> String {
    let rand = env::sha256_array([&seed[..], &[i]].concat());
    g.tiers[g.roll(&rand, false).0].rarity.clone()
}

/// Method names, args and deposits of a receipt as text.
fn text(r: &Receipt) -> String {
    r.actions
        .iter()
        .map(|a| match a {
            MockAction::FunctionCallWeight {
                method_name, args, ..
            } => format!(
                "{} {}",
                String::from_utf8_lossy(method_name),
                String::from_utf8_lossy(args)
            ),
            other => format!("{other:?}"),
        })
        .collect()
}

/// Mint calls created by the last pull.
fn mints() -> usize {
    get_created_receipts()
        .iter()
        .filter(|r| r.receiver_id.as_str() == "nft.t")
        .count()
}

#[test]
fn rarity_frequencies_match_weights() {
    let g = setup();
    let n = 200_000u32;
    let mut hits = [0u32; 4];
    for i in 0..n {
        if i % 10_000 == 0 {
            testing_env!(VMContextBuilder::new().build()); // fresh gas budget for the hashing
        }
        let rand = env::sha256_array(i.to_le_bytes());
        hits[g.roll(&rand, false).0] += 1;
    }
    for (hit, expected) in hits.iter().zip([0.60, 0.28, 0.10, 0.02]) {
        let freq = *hit as f64 / n as f64;
        assert!((freq - expected).abs() < 0.005, "freq {freq} vs {expected}");
    }
}

#[test]
fn pity_forces_legendary_then_resets() {
    let mut g = setup();
    fund(&mut g, "tusdc.t", 1_000_000);
    fund(&mut g, "tbtc.t", 1_000_000);
    // A seed whose single roll is never Legendary, so only pity can produce one.
    let seed = (0u8..)
        .map(|b| [b; 32])
        .find(|s| rarity_of(&g, *s, 0) != LEGENDARY)
        .unwrap();
    for expected in 1..50 {
        ctx("bob.t", PRICE, seed);
        g.pull(1);
        assert_eq!(g.get_pity(acc("bob.t")), expected);
    }
    ctx("bob.t", PRICE, seed);
    g.pull(1);
    assert_eq!(g.get_pity(acc("bob.t")), 0);
    // The forced pull minted Legendary metadata.
    let mint = get_created_receipts()
        .into_iter()
        .find(|r| r.receiver_id.as_str() == "nft.t")
        .unwrap();
    assert!(
        text(&mint).contains(r#"\"rarity\":\"Legendary\""#),
        "{}",
        text(&mint)
    );
}

#[test]
fn ten_pull_costs_nine_and_mints_ten() {
    let mut g = setup();
    fund(&mut g, "tusdc.t", 1_000_000);
    fund(&mut g, "tbtc.t", 1_000_000);
    ctx("bob.t", PRICE.saturating_mul(9), [7; 32]);
    g.pull(10);
    assert_eq!(mints(), 10);
    assert_eq!(treasury(&g, "tusdc.t"), 1_000_000 - 10 * 1_000);
    let legendaries = (0..10)
        .filter(|i| rarity_of(&g, [7; 32], *i) == LEGENDARY)
        .count() as u32;
    if legendaries == 0 {
        assert_eq!(g.get_pity(acc("bob.t")), 10);
    }
}

#[test]
#[should_panic(expected = "attach exactly the pull price")]
fn ten_pull_rejects_full_price() {
    let mut g = setup();
    ctx("bob.t", PRICE.saturating_mul(10), [7; 32]);
    g.pull(10);
}

#[test]
#[should_panic(expected = "count must be 1 or 10")]
fn rejects_other_counts() {
    let mut g = setup();
    ctx("bob.t", PRICE.saturating_mul(2), [7; 32]);
    g.pull(2);
}

#[test]
fn empty_treasury_refunds_and_keeps_pity() {
    let mut g = setup();
    fund(&mut g, "tusdc.t", 2_500); // covers two pulls; tbtc covers all
    fund(&mut g, "tbtc.t", 1_000_000);
    ctx("bob.t", PRICE.saturating_mul(9), [3; 32]);
    g.pull(10);
    assert_eq!(mints(), 2);
    assert_eq!(treasury(&g, "tusdc.t"), 500);
    let refund = get_created_receipts()
        .into_iter()
        .find(|r| r.receiver_id.as_str() == "bob.t")
        .expect("refund");
    // 8 refunded pulls at 0.09 NEAR each.
    assert!(
        text(&refund).contains("720000000000000000000000"),
        "{}",
        text(&refund)
    );
    assert!(g.get_pity(acc("bob.t")) <= 2);
}

#[test]
fn low_near_balance_refunds() {
    let mut g = setup();
    fund(&mut g, "tusdc.t", 1_000_000);
    fund(&mut g, "tbtc.t", 1_000_000);
    testing_env!(VMContextBuilder::new()
        .current_account_id(acc("gacha.t"))
        .predecessor_account_id(acc("bob.t"))
        .attached_deposit(PRICE)
        .account_balance(PRICE)
        .build());
    g.pull(1);
    assert_eq!(mints(), 0);
    assert_eq!(treasury(&g, "tusdc.t"), 1_000_000);
    assert_eq!(g.get_pity(acc("bob.t")), 0);
}

#[test]
fn fund_requires_owner_and_msg() {
    let mut g = setup();
    ctx("tusdc.t", NearToken::from_yoctonear(0), [0; 32]);
    let not_owner = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        g.ft_on_transfer(acc("bob.t"), U128(5), "fund".into())
    }));
    assert!(not_owner.is_err());
    let bad_msg = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        g.ft_on_transfer(acc("owner.t"), U128(5), "".into())
    }));
    assert!(bad_msg.is_err());
    assert_eq!(treasury(&g, "tusdc.t"), 0);
}

fn callback_ctx(result: PromiseResult) {
    callback_ctx_n(vec![result]);
}

fn callback_ctx_n(results: Vec<PromiseResult>) {
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(acc("gacha.t"))
            .predecessor_account_id(acc("gacha.t"))
            .build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        results,
    );
}

#[test]
fn on_minted_funds_vault_then_resolves() {
    let mut g = setup();
    callback_ctx(PromiseResult::Successful(b"\"7\"".to_vec()));
    g.on_minted(
        acc("bob.t"),
        "Epic".into(),
        tiers()[2].baskets[0].items.clone(),
        U128(9),
        3,
    );
    let receipts = get_created_receipts();
    assert_eq!(receipts.len(), 3);
    let actions = text(&receipts[0]);
    assert!(actions.contains("storage_deposit") && actions.contains("ft_transfer_call"));
    assert!(actions.contains("7.nft.t"), "{actions}");
    assert!(text(&receipts[2]).contains("on_funded"));
    // `gacha_pull` waits for the funding to resolve.
    assert!(get_logs().is_empty());
}

fn event_data(log: &str) -> serde_json::Value {
    let event: serde_json::Value = serde_json::from_str(&log["EVENT_JSON:".len()..]).unwrap();
    event["data"][0].clone()
}

#[test]
fn funded_vault_emits_pull() {
    let mut g = setup();
    callback_ctx_n(vec![
        PromiseResult::Successful(b"\"1000\"".to_vec()),
        PromiseResult::Successful(b"\"10\"".to_vec()),
    ]);
    let items = tiers()[2].baskets[0].items.clone();
    g.on_funded(acc("bob.t"), "7".into(), "Epic".into(), items, U128(9), 3);
    assert_eq!(get_logs().len(), 1);
    assert_eq!(
        event_data(&get_logs()[0]),
        json!({ "player_id": "bob.t", "token_id": "7", "rarity": "Epic", "pity_after": 3, "price": "9" })
    );
    assert_eq!(treasury(&g, "tusdc.t"), 0);
}

#[test]
fn failed_funding_goes_back_to_treasury() {
    let mut g = setup();
    // tusdc: the vault refused it (resolve returned 0 used); tbtc: the batch or resolver failed.
    callback_ctx_n(vec![
        PromiseResult::Successful(b"\"0\"".to_vec()),
        PromiseResult::Failed,
    ]);
    let items = tiers()[2].baskets[0].items.clone();
    g.on_funded(acc("bob.t"), "7".into(), "Epic".into(), items, U128(9), 3);
    assert_eq!(treasury(&g, "tusdc.t"), 1_000);
    // Unknown whether tbtc moved: not credited, the owner resyncs.
    assert_eq!(treasury(&g, "tbtc.t"), 0);
    let logs = get_logs();
    assert_eq!(logs.len(), 3);
    assert_eq!(
        event_data(&logs[0]),
        json!({ "player_id": "bob.t", "token_id": "7", "ft_id": "tusdc.t", "amount": "1000" })
    );
    assert!(
        logs[1].contains(r#""event":"gacha_fund_unknown""#),
        "{}",
        logs[1]
    );
    assert_eq!(
        event_data(&logs[1]),
        json!({ "player_id": "bob.t", "token_id": "7", "ft_id": "tbtc.t", "amount": "10" })
    );
    assert!(logs[2].contains(r#""event":"gacha_pull""#));
}

#[test]
fn resync_treasury_sets_the_real_balance() {
    let mut g = setup();
    ctx("owner.t", NearToken::from_yoctonear(0), [0; 32]);
    let _ = g.resync_treasury(acc("tbtc.t"));
    callback_ctx(PromiseResult::Successful(b"\"42\"".to_vec()));
    assert_eq!(g.on_resync(acc("tbtc.t")), U128(42));
    assert_eq!(treasury(&g, "tbtc.t"), 42);
}

#[test]
#[should_panic(expected = "only the owner")]
fn resync_treasury_is_owner_only() {
    let mut g = setup();
    ctx("bob.t", NearToken::from_yoctonear(0), [0; 32]);
    let _ = g.resync_treasury(acc("tbtc.t"));
}

#[test]
fn unreadable_mint_result_keeps_price_and_basket() {
    let mut g = setup();
    callback_ctx(PromiseResult::Successful(b"true".to_vec()));
    g.on_minted(
        acc("bob.t"),
        "Epic".into(),
        tiers()[2].baskets[0].items.clone(),
        U128(9),
        3,
    );
    assert_eq!(treasury(&g, "tusdc.t"), 1_000);
    assert!(get_created_receipts().is_empty());
    assert_eq!(
        event_data(&get_logs()[0]),
        json!({ "player_id": "bob.t", "rarity": "Epic", "result": "true" })
    );
}

#[test]
#[should_panic(expected = "token is not in any basket")]
fn fund_rejects_unknown_tokens() {
    let mut g = setup();
    fund(&mut g, "fake.t", 5);
}

#[test]
fn failed_mint_restores_treasury_and_refunds() {
    failed_mint(PromiseResult::Failed);
}

/// The collection's mint resolves to `null` when the vault could not be created.
#[test]
fn null_mint_restores_treasury_and_refunds() {
    failed_mint(PromiseResult::Successful(b"null".to_vec()));
}

fn failed_mint(result: PromiseResult) {
    let mut g = setup();
    callback_ctx(result);
    g.on_minted(
        acc("bob.t"),
        "Epic".into(),
        tiers()[2].baskets[0].items.clone(),
        U128(9),
        3,
    );
    assert_eq!(treasury(&g, "tusdc.t"), 1_000);
    let receipts = get_created_receipts();
    assert_eq!(receipts.len(), 1);
    assert_eq!(receipts[0].receiver_id.as_str(), "bob.t");
    assert!(get_logs().is_empty());
}

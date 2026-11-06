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
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(acc("gacha.t"))
            .predecessor_account_id(acc("gacha.t"))
            .build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result],
    );
}

#[test]
fn on_minted_funds_vault_and_emits_event() {
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
    assert_eq!(receipts.len(), 2);
    let actions = text(&receipts[0]);
    assert!(actions.contains("storage_deposit") && actions.contains("ft_transfer_call"));
    assert!(actions.contains("7.nft.t"), "{actions}");
    let log = &get_logs()[0];
    assert!(log.starts_with("EVENT_JSON:"));
    let event: serde_json::Value = serde_json::from_str(&log["EVENT_JSON:".len()..]).unwrap();
    assert_eq!(
        event["data"][0],
        json!({ "player_id": "bob.t", "token_id": "7", "rarity": "Epic", "pity_after": 3, "price": "9" })
    );
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

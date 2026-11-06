//! H-3: an offer can be swapped for a smaller one between the seller's `nft_approve` and the
//! market's `nft_on_approve`; the accept message cannot pin the amount, so the sale settles at
//! whatever the buyer has escrowed at that moment.
use market::Market;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::json_types::U128;
use near_sdk::{testing_env, AccountId, NearToken};

fn ctx(predecessor: &str, deposit: NearToken) {
    testing_env!(VMContextBuilder::new()
        .current_account_id("market.testnet".parse().unwrap())
        .predecessor_account_id(predecessor.parse::<AccountId>().unwrap())
        .attached_deposit(deposit)
        .block_timestamp(1_000_000_000)
        .build());
}

#[test]
#[should_panic(expected = "offer amount changed")]
fn h3_accept_offer_must_reject_an_offer_swapped_for_less() {
    ctx("deployer.testnet", NearToken::from_near(0));
    let mut m = Market::new("nft.testnet".parse().unwrap(), "fee.testnet".parse().unwrap());

    // Buyer offers 100 NEAR; the seller sees it and signs nft_approve(accept_offer).
    ctx("buyer.testnet", NearToken::from_near(101));
    m.offer("0".into(), U128(NearToken::from_near(100).as_yoctonear()), 1_000_000, None);
    // Before nft_on_approve lands, the buyer replaces it with 0.01 NEAR (old one is refunded).
    ctx("buyer.testnet", NearToken::from_millinear(1010));
    m.offer("0".into(), U128(NearToken::from_millinear(10).as_yoctonear()), 1_000_000, None);

    // The seller's message names the amount they agreed to; the market must refuse to settle
    // for less. Before the fix the field was ignored and the NFT sold for 0.01 NEAR.
    ctx("nft.testnet", NearToken::from_near(0));
    let _ = m.nft_on_approve(
        "0".into(),
        "seller.testnet".parse().unwrap(),
        1,
        r#"{"accept_offer":{"buyer_id":"buyer.testnet","amount":"100000000000000000000000000"}}"#
            .into(),
    );
}

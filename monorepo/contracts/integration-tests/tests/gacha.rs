//! Gacha end to end with the real collection, vault and three mock-ft tokens.
use integration_tests::near_workspaces::result::ExecutionFinalResult;
use integration_tests::near_workspaces::types::{Gas, NearToken};
use integration_tests::serde_json::{json, Value};
use integration_tests::*;

const FUNDED: u128 = 10_000_000;

/// The owner registers the gacha on every token and funds the treasury with msg "fund".
async fn fund(e: &Env) {
    for ft in e.fts() {
        e.register(ft, e.gacha.id()).await;
        e.register(ft, e.owner.id()).await;
        e.ft_mint(ft, e.owner.id(), FUNDED).await;
        ok(&e
            .owner
            .call(ft.id(), "ft_transfer_call")
            .args_json(
                json!({ "receiver_id": e.gacha.id(), "amount": FUNDED.to_string(), "msg": "fund" }),
            )
            .deposit(NearToken::from_yoctonear(1))
            .gas(Gas::from_tgas(100))
            .transact()
            .await
            .unwrap());
    }
}

async fn pull(e: &Env, count: u8, gas: Gas) -> ExecutionFinalResult {
    let price = if count == 10 {
        PULL_PRICE.saturating_mul(9)
    } else {
        PULL_PRICE
    };
    e.bob
        .call(e.gacha.id(), "pull")
        .args_json(json!({ "count": count }))
        .deposit(price)
        .gas(gas)
        .transact()
        .await
        .unwrap()
}

/// Every pulled token belongs to bob, carries its rarity with `creator == gacha`, and its vault
/// holds exactly that rarity's basket.
async fn check_pulls(e: &Env, pulls: &[Value]) {
    for p in pulls {
        let id = p["token_id"].as_str().unwrap();
        assert_eq!(p["player_id"], e.bob.id().as_str());
        assert_eq!(e.owner_of(id).await, e.bob.id().as_str());
        let extra: Value =
            serde_json::from_str(e.token(id).await["metadata"]["extra"].as_str().unwrap()).unwrap();
        assert_eq!(extra["rarity"], p["rarity"]);
        assert_eq!(extra["creator"], e.gacha.id().as_str());
        let (a, b) = basket_amounts(p["rarity"].as_str().unwrap());
        let vault = e.vault_of(id);
        assert_eq!(e.ft_balance(&e.usdc, &vault).await, a, "{p}");
        assert_eq!(e.ft_balance(&e.btc, &vault).await, b, "{p}");
        assert_eq!(e.ft_balance(&e.eth, &vault).await, a, "{p}");
    }
}

#[tokio::test]
async fn one_pull_and_ten_pull() {
    let e = Env::new().await;
    fund(&e).await;

    let one = pull(&e, 1, Gas::from_tgas(300)).await;
    ok(&one);
    let mut pulls = events(&one, "gacha_pull");
    assert_eq!(pulls.len(), 1);
    assert_eq!(pulls[0]["token_id"], "0");
    assert_eq!(pulls[0]["price"], PULL_PRICE.as_yoctonear().to_string());
    check_pulls(&e, &pulls).await;

    // A player attaching the bare minimum cannot starve any step: below it the whole pull
    // reverts, at it every item still reaches the vault.
    let mut tgas = 90;
    let lean = loop {
        let r = pull(&e, 1, Gas::from_tgas(tgas)).await;
        if r.is_success() {
            break r;
        }
        assert!(events(&r, "gacha_pull").is_empty(), "{r:#?}");
        tgas += 1;
    };
    println!("1-pull minimum: {tgas} Tgas");
    ok(&lean);
    assert!(events(&lean, "gacha_fund_failed").is_empty());
    let lean = events(&lean, "gacha_pull");
    check_pulls(&e, &lean).await;
    pulls.extend(lean);

    // Too little gas for the 920 Tgas of static gas: the whole pull reverts and the
    // deposit comes back, nothing is minted and pity does not move.
    e.settle().await;
    let bob0 = e.near_balance(e.bob.id()).await;
    let short = pull(&e, 10, Gas::from_tgas(910)).await;
    assert!(
        short.is_failure() && events(&short, "gacha_pull").is_empty(),
        "{short:#?}"
    );
    e.settle().await;
    assert!(bob0 - e.near_balance(e.bob.id()).await < NEAR / 100);
    let supply: String = e
        .nft
        .view("nft_total_supply")
        .await
        .unwrap()
        .json()
        .unwrap();
    assert_eq!(supply, "2");

    // The minimum is ~950 Tgas; 960 keeps a 40 Tgas guard under testnet's 1 PGas limit.
    let ten = pull(&e, 10, Gas::from_tgas(960)).await;
    ok(&ten);
    assert!(events(&ten, "gacha_fund_failed").is_empty());
    let tens = events(&ten, "gacha_pull");
    assert_eq!(tens.len(), 10);
    check_pulls(&e, &tens).await;
    println!(
        "gas: 1-pull burnt {} Tgas, 10-pull burnt {} Tgas in total",
        one.total_gas_burnt.as_tgas(),
        ten.total_gas_burnt.as_tgas(),
    );

    pulls.extend(tens);
    let spent = |f: fn((u128, u128)) -> u128| -> u128 {
        pulls
            .iter()
            .map(|p| f(basket_amounts(p["rarity"].as_str().unwrap())))
            .sum()
    };
    assert_eq!(
        e.ft_balance(&e.usdc, e.gacha.id()).await,
        FUNDED - spent(|a| a.0)
    );
    assert_eq!(
        e.ft_balance(&e.btc, e.gacha.id()).await,
        FUNDED - spent(|a| a.1)
    );
    let pity: u32 = e
        .gacha
        .view("get_pity")
        .args_json(json!({ "account_id": e.bob.id() }))
        .await
        .unwrap()
        .json()
        .unwrap();
    assert_eq!(
        pity as u64,
        pulls.last().unwrap()["pity_after"].as_u64().unwrap()
    );
    let supply: String = e
        .nft
        .view("nft_total_supply")
        .await
        .unwrap()
        .json()
        .unwrap();
    assert_eq!(supply, "12");

    // Owner-only resync sets the treasury to the gacha's real balance.
    let resync = |who: &integration_tests::near_workspaces::Account| {
        who.call(e.gacha.id(), "resync_treasury")
            .args_json(json!({ "token": e.usdc.id() }))
            .gas(Gas::from_tgas(50))
            .transact()
    };
    assert!(resync(&e.bob).await.unwrap().is_failure());
    let r = resync(&e.owner).await.unwrap();
    ok(&r);
    let usdc = e.ft_balance(&e.usdc, e.gacha.id()).await;
    assert_eq!(r.json::<String>().unwrap(), usdc.to_string());
    let treasury: Vec<(String, String)> =
        e.gacha.view("get_treasury").await.unwrap().json().unwrap();
    assert!(treasury.contains(&(e.usdc.id().to_string(), usdc.to_string())));
}

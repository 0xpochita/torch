//! End-to-end on a local sandbox: mock collection + two mock NEP-141 tokens + the gacha.
use std::path::Path;
use std::process::Command;

use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract, Worker};
use serde_json::{json, Value};

const PRICE: NearToken = NearToken::from_millinear(100);
const TARGET: &str = "target/mocks";

fn build(manifest: &str, wasm: &str) -> Vec<u8> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let status = Command::new("cargo")
        .args([
            "build",
            "--release",
            "--target",
            "wasm32-unknown-unknown",
            "--manifest-path",
        ])
        .arg(root.join(manifest))
        .arg("--target-dir")
        .arg(root.join(TARGET))
        .status()
        .unwrap();
    assert!(status.success(), "building {manifest}");
    std::fs::read(
        root.join(TARGET)
            .join("wasm32-unknown-unknown/release")
            .join(wasm),
    )
    .unwrap()
}

/// Basket amounts per rarity: tusdc (and teth) then tbtc.
fn amounts(rarity: &str) -> (u128, u128) {
    match rarity {
        "Common" => (1_000, 1),
        "Rare" => (5_000, 5),
        "Epic" => (20_000, 20),
        _ => (100_000, 100),
    }
}

fn tiers(usdc: &Contract, btc: &Contract, eth: &Contract) -> Value {
    let tiers: Vec<_> = [
        ("Common", 6000),
        ("Rare", 2800),
        ("Epic", 1000),
        ("Legendary", 200),
    ]
    .into_iter()
    .map(|(rarity, weight)| {
        let (a, b) = amounts(rarity);
        json!({
            "rarity": rarity,
            "weight_bps": weight,
            "baskets": [{
                "name": format!("{rarity} basket"),
                "category": "Blue Chip",
                "bg": "#9fd3ff",
                "items": [
                    { "token": usdc.id(), "amount": a.to_string() },
                    { "token": btc.id(), "amount": b.to_string() },
                    { "token": eth.id(), "amount": a.to_string() },
                ],
            }],
        })
    })
    .collect();
    json!(tiers)
}

async fn deploy(root: &Account, name: &str, near: u128, wasm: &[u8]) -> Contract {
    let account = root
        .create_subaccount(name)
        .initial_balance(NearToken::from_near(near))
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
    account.deploy(wasm).await.unwrap().into_result().unwrap()
}

/// Asserts the transaction and every receipt it spawned succeeded.
fn ok(result: &ExecutionFinalResult) {
    assert!(result.is_success(), "{result:#?}");
    assert!(
        result.receipt_failures().is_empty(),
        "{:#?}",
        result.receipt_failures()
    );
}

fn pull_events(result: &ExecutionFinalResult) -> Vec<Value> {
    result
        .logs()
        .iter()
        .filter_map(|log| log.strip_prefix("EVENT_JSON:"))
        .map(|json| serde_json::from_str::<Value>(json).unwrap())
        .filter(|event| event["event"] == "gacha_pull")
        .map(|event| event["data"][0].clone())
        .collect()
}

async fn balance(worker: &Worker<Sandbox>, ft: &Contract, account: &str) -> u128 {
    let v: String = worker
        .view(ft.id(), "ft_balance_of")
        .args_json(json!({ "account_id": account }))
        .await
        .unwrap()
        .json()
        .unwrap();
    v.parse().unwrap()
}

/// Every event's vault holds its rarity's basket and belongs to the player.
async fn check_vaults(
    worker: &Worker<Sandbox>,
    events: &[Value],
    nft: &Contract,
    [usdc, btc, eth]: [&Contract; 3],
    player: &Account,
) {
    for event in events {
        let token_id = event["token_id"].as_str().unwrap();
        let vault = format!("{token_id}.{}", nft.id());
        let (a, b) = amounts(event["rarity"].as_str().unwrap());
        assert_eq!(balance(worker, usdc, &vault).await, a, "{event}");
        assert_eq!(balance(worker, btc, &vault).await, b, "{event}");
        assert_eq!(balance(worker, eth, &vault).await, a, "{event}");
        let (owner, extra): (String, String) = nft
            .view("owner_of")
            .args_json(json!({ "token_id": token_id }))
            .await
            .unwrap()
            .json::<Option<(String, String)>>()
            .unwrap()
            .unwrap();
        assert_eq!(owner, player.id().as_str());
        let extra: Value = serde_json::from_str(&extra).unwrap();
        assert_eq!(extra["rarity"], event["rarity"]);
        assert_eq!(event["player_id"], player.id().as_str());
    }
}

#[tokio::test]
async fn one_pull_and_ten_pull_end_to_end() {
    let gacha_wasm = build("Cargo.toml", "gacha.wasm");
    let nft_wasm = build("tests/mocks/collection/Cargo.toml", "mock_collection.wasm");
    let ft_wasm = build("tests/mocks/ft/Cargo.toml", "mock_ft.wasm");

    let worker = near_workspaces::sandbox().await.unwrap();
    let root = worker.root_account().unwrap();
    let owner = root
        .create_subaccount("owner")
        .initial_balance(NearToken::from_near(20))
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
    let player = root
        .create_subaccount("player")
        .initial_balance(NearToken::from_near(20))
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();

    let usdc = deploy(&root, "tusdc", 20, &ft_wasm).await;
    let btc = deploy(&root, "tbtc", 20, &ft_wasm).await;
    let eth = deploy(&root, "teth", 20, &ft_wasm).await;
    let nft = deploy(&root, "nft", 100, &nft_wasm).await;
    let gacha = deploy(&root, "gacha", 30, &gacha_wasm).await;

    ok(&nft
        .call("new")
        .args_json(
            json!({ "vault_code": near_sdk::json_types::Base64VecU8::from(nft_wasm.clone()) }),
        )
        .gas(Gas::from_tgas(300))
        .transact()
        .await
        .unwrap());
    ok(&gacha
        .call("new")
        .args_json(json!({
            "owner_id": owner.id(),
            "collection_id": nft.id(),
            "price_per_pull": PRICE.as_yoctonear().to_string(),
            "pity": 50,
            "tiers": tiers(&usdc, &btc, &eth),
        }))
        .transact()
        .await
        .unwrap());

    // Treasury: the owner funds both tokens with msg "fund".
    let funded = 10_000_000u128;
    for ft in [&usdc, &btc, &eth] {
        ok(&ft.call("new").transact().await.unwrap());
        ok(&ft
            .call("mint")
            .args_json(json!({ "account_id": owner.id(), "amount": funded.to_string() }))
            .transact()
            .await
            .unwrap());
        ok(&owner
            .call(ft.id(), "storage_deposit")
            .args_json(json!({ "account_id": gacha.id() }))
            .deposit(NearToken::from_millinear(10))
            .transact()
            .await
            .unwrap());
        ok(&owner
            .call(ft.id(), "ft_transfer_call")
            .args_json(
                json!({ "receiver_id": gacha.id(), "amount": funded.to_string(), "msg": "fund" }),
            )
            .deposit(NearToken::from_yoctonear(1))
            .gas(Gas::from_tgas(100))
            .transact()
            .await
            .unwrap());
    }
    let treasury: Vec<(String, String)> = gacha.view("get_treasury").await.unwrap().json().unwrap();
    assert_eq!(treasury.len(), 3);

    // 1-pull.
    let one = player
        .call(gacha.id(), "pull")
        .args_json(json!({ "count": 1 }))
        .deposit(PRICE)
        .gas(Gas::from_tgas(300))
        .transact()
        .await
        .unwrap();
    ok(&one);
    let events = pull_events(&one);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["price"], PRICE.as_yoctonear().to_string());
    check_vaults(&worker, &events, &nft, [&usdc, &btc, &eth], &player).await;
    println!("1-pull burnt {} Tgas", one.total_gas_burnt.as_tgas());

    // 10-pull at 0.9 NEAR.
    let ten = player
        .call(gacha.id(), "pull")
        .args_json(json!({ "count": 10 }))
        .deposit(PRICE.saturating_mul(9))
        .gas(Gas::from_tgas(1000))
        .transact()
        .await
        .unwrap();
    ok(&ten);
    let events = pull_events(&ten);
    assert_eq!(events.len(), 10);
    check_vaults(&worker, &events, &nft, [&usdc, &btc, &eth], &player).await;
    println!("10-pull burnt {} Tgas", ten.total_gas_burnt.as_tgas());

    // Treasury went down by exactly the 11 baskets.
    let all: Vec<Value> = pull_events(&one).into_iter().chain(events).collect();
    let spent: u128 = all
        .iter()
        .map(|e| amounts(e["rarity"].as_str().unwrap()).0)
        .sum();
    assert_eq!(
        balance(&worker, &usdc, gacha.id().as_str()).await,
        funded - spent
    );
    let pity: u32 = gacha
        .view("get_pity")
        .args_json(json!({ "account_id": player.id() }))
        .await
        .unwrap()
        .json()
        .unwrap();
    assert_eq!(
        pity,
        all.last().unwrap()["pity_after"].as_u64().unwrap() as u32
    );
}

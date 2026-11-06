//! Wave 2 re-audit (AUDIT.md "Wave 2 re-audit"): worst-case gas of every lock-releasing or
//! mint-completing callback, and the gacha's no-starve claim. Written for the contracts in
//! `Bimajadivaaa/torch-w2-contracts` (Option<TokenId> mint, GAS_CALLBACK 10 Tgas, approval cap,
//! gacha `on_funded`). Prints the measured numbers with `--nocapture`.
mod common;
use common::*;
use near_workspaces::types::Gas;

const TGAS: u64 = 1_000_000_000_000;

/// Gas burnt by the receipts `executor` ran whose logs contain `needle` ("" = any).
fn burnt(r: &ExecutionFinalResult, executor: &AccountId, needle: &str) -> Vec<u64> {
    r.receipt_outcomes()
        .iter()
        .filter(|o| {
            &o.executor_id == executor
                && (needle.is_empty() || o.logs.iter().any(|l| l.contains(needle)))
        })
        .map(|o| o.gas_burnt.as_gas())
        .collect()
}

fn events<'a>(r: &'a ExecutionFinalResult, name: &'a str) -> impl Iterator<Item = Value> + 'a {
    r.logs()
        .into_iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .filter_map(|j| serde_json::from_str::<Value>(j).ok())
        .filter(move |e| e["event"] == name)
        .map(|e| e["data"][0].clone())
}

/// I9 / L-1: `nft_resolve_transfer` runs on a fixed 5 Tgas. Fill the approval cap, bounce an
/// `nft_transfer_call` off an account without code, and measure the revert path.
#[tokio::test]
async fn w2_resolve_transfer_at_the_approval_cap() {
    let e = setup().await;
    mint(&e, "0").await;
    let mut approvals = 0;
    for i in 0..64 {
        let r = e
            .alice
            .call(e.nft.id(), "nft_approve")
            .args_json(json!({ "token_id": "0", "account_id": format!("{}{i:02}.test.near", "a".repeat(50)) }))
            .deposit(NearToken::from_millinear(10))
            .max_gas()
            .transact()
            .await
            .unwrap();
        if r.is_failure() {
            assert!(format!("{r:?}").contains("too many approvals"), "{r:?}");
            break;
        }
        approvals += 1;
    }
    assert!(approvals < 64, "approvals are capped");
    let r = e
        .alice
        .call(e.nft.id(), "nft_transfer_call")
        .args_json(json!({ "receiver_id": e.bob.id(), "token_id": "0", "msg": "" }))
        .deposit(YOCTO)
        .max_gas()
        .transact()
        .await
        .unwrap();
    let resolve = *burnt(&r, e.nft.id(), "nft_transfer").last().unwrap();
    println!(
        "cap = {approvals} approvals (62-char ids): nft_resolve_transfer revert burnt {:.2} Tgas",
        resolve as f64 / TGAS as f64
    );
    assert_eq!(owner_of(&e, "0").await, *e.alice.id());
    assert!(!is_locked(&e, "0").await, "I9: unlocked after the revert");
    assert!(
        resolve < 4 * TGAS,
        "keep >= 1 Tgas headroom under the fixed 5 Tgas"
    );
}

/// L-8 / I4: `on_vault_created` (GAS_CALLBACK, now 10 Tgas) with the largest metadata to a new
/// 64-character owner, called with the least gas `mint` accepts. An out-of-gas callback would
/// leave an orphan vault.
#[tokio::test]
async fn w2_on_vault_created_worst_case_with_minimum_gas() {
    let e = setup().await;
    let owner = sub(&e.root, &"o".repeat(64 - ".test.near".len()), 5).await;
    assert_eq!(owner.id().len(), 64);
    // Largest title the collection accepts (borsh metadata incl. extra.creator <= 1200 bytes).
    let mut title_len = 1200;
    let mut tgas = 20;
    let (r, title_len, tgas) = loop {
        let r = e
            .alice
            .call(e.nft.id(), "mint")
            .args_json(json!({ "metadata": { "title": "t".repeat(title_len), "extra": r##"{"bg":"#000"}"## }, "receiver_id": owner.id() }))
            .deposit(MINT_DEPOSIT)
            .gas(Gas::from_tgas(tgas))
            .transact()
            .await
            .unwrap();
        let err = format!("{:?}", r.failures());
        if r.is_success() && !r.receipt_failures().is_empty() {
            panic!("mint passed but a receipt failed: {err}");
        }
        if r.is_success() {
            break (r, title_len, tgas);
        }
        if err.contains("metadata too large") {
            title_len -= 10;
        } else {
            tgas += 1; // not enough prepaid gas for the static reservations: the whole mint reverts
        }
    };
    let cb = burnt(&r, e.nft.id(), "vault_created")[0];
    let token_id: Option<String> = r.json().unwrap();
    println!(
        "mint accepted at {tgas} Tgas with a {title_len}-char title to a 64-char owner: on_vault_created burnt {:.2} Tgas of 10, resolved to {token_id:?}",
        cb as f64 / TGAS as f64
    );
    let id = token_id.expect("mint resolves to the token id");
    assert_eq!(
        owner_of(&e, &id).await,
        *owner.id(),
        "I4: the vault's token exists"
    );
    assert!(cb < 6 * TGAS, "keep >= 4 Tgas headroom under GAS_CALLBACK");
}

/// I9: `on_vault_op` (GAS_CALLBACK 10 Tgas) releases the withdraw lock; called with minimum gas.
#[tokio::test]
async fn w2_on_vault_op_unlocks_with_minimum_gas() {
    let e = setup().await;
    let vault = mint(&e, "0").await;
    register(&e, &vault).await;
    mint_usdc(&e, e.alice.id(), 1000).await;
    ok(e.alice
        .call(e.usdc.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": vault, "amount": "1000", "msg": "" }))
        .deposit(YOCTO)
        .max_gas()
        .transact()
        .await
        .unwrap());
    let mut tgas = 40;
    let r = loop {
        let r = e
            .alice
            .call(e.nft.id(), "withdraw")
            .args_json(json!({ "token_id": "0", "ft_id": e.usdc.id(), "amount": "1" }))
            .deposit(YOCTO)
            .gas(Gas::from_tgas(tgas))
            .transact()
            .await
            .unwrap();
        if r.is_success() {
            break r;
        }
        assert!(
            !is_locked(&e, "0").await,
            "a rejected withdraw never leaves a lock"
        );
        tgas += 2;
    };
    let cb = *burnt(&r, e.nft.id(), "").last().unwrap();
    println!(
        "withdraw accepted at {tgas} Tgas: on_vault_op burnt {:.2} Tgas of 10",
        cb as f64 / TGAS as f64
    );
    assert!(!is_locked(&e, "0").await, "I9: unlocked");
    assert!(cb < 5 * TGAS);
}

struct Gacha {
    e: Env,
    gacha: Contract,
    fts: Vec<Contract>,
}

/// Gacha over the real collection; every tier has one 3-item basket (usdc, teth, tbtc).
async fn gacha_env() -> Gacha {
    let e = setup().await;
    let mut fts = vec![];
    for (name, decimals) in [("teth", 18), ("tbtc", 8)] {
        let ft = deploy(&e.root, name, 5, "mock-ft").await;
        ok(ft
            .call("new")
            .args_json(json!({ "owner_id": e.root.id(), "metadata": { "spec": "ft-1.0.0", "name": name, "symbol": name, "decimals": decimals } }))
            .transact()
            .await
            .unwrap());
        fts.push(ft);
    }
    fts.insert(0, e.usdc.clone());
    let gacha = deploy(&e.root, "gacha", 20, "gacha").await;
    let items: Vec<_> = fts
        .iter()
        .map(|ft| json!({ "token": ft.id(), "amount": "1000" }))
        .collect();
    let tiers: Vec<_> = [("Common", 6000), ("Rare", 2800), ("Epic", 1000), ("Legendary", 200)]
        .iter()
        .map(|(rarity, w)| json!({ "rarity": rarity, "weight_bps": w, "baskets": [{ "name": rarity, "category": "Blue Chip", "bg": "#fff", "items": items }] }))
        .collect();
    ok(gacha
        .call("new")
        .args_json(json!({ "owner_id": e.root.id(), "collection_id": e.nft.id(), "price_per_pull": NearToken::from_millinear(100).as_yoctonear().to_string(), "pity": 50, "tiers": tiers }))
        .transact()
        .await
        .unwrap());
    for ft in &fts {
        for who in [e.root.id(), gacha.id()] {
            ok(e.root
                .call(ft.id(), "storage_deposit")
                .args_json(json!({ "account_id": who }))
                .deposit(STORAGE)
                .transact()
                .await
                .unwrap());
        }
        ok(e.root
            .call(ft.id(), "mint")
            .args_json(json!({ "account_id": e.root.id(), "amount": "1000000" }))
            .transact()
            .await
            .unwrap());
        ok(e.root
            .call(ft.id(), "ft_transfer_call")
            .args_json(json!({ "receiver_id": gacha.id(), "amount": "1000000", "msg": "fund" }))
            .deposit(YOCTO)
            .max_gas()
            .transact()
            .await
            .unwrap());
    }
    Gacha { e, gacha, fts }
}

/// M-1 / M-4: the least gas a player can attach to `pull(count)` without it reverting still funds
/// every vault (statics cover every step), and a 10-pull fits under 1 PGas.
async fn pull_with_minimum_gas(g: &Gacha, count: u8, from_tgas: u64) -> u64 {
    let price = NearToken::from_millinear(if count == 10 { 900 } else { 100 });
    let mut tgas = from_tgas;
    let r = loop {
        assert!(tgas <= 1000, "pull({count}) does not fit 1 PGas");
        let r =
            g.e.bob
                .call(g.gacha.id(), "pull")
                .args_json(json!({ "count": count }))
                .deposit(price)
                .gas(Gas::from_tgas(tgas))
                .transact()
                .await
                .unwrap();
        if r.is_success() {
            break r;
        }
        tgas += 5;
    };
    let pulls: Vec<_> = events(&r, "gacha_pull").collect();
    let failed: Vec<_> = events(&r, "gacha_fund_failed").collect();
    println!(
        "pull({count}) accepted at {tgas} Tgas: {} gacha_pull, {} gacha_fund_failed, {:.0} Tgas burnt in total",
        pulls.len(),
        failed.len(),
        r.total_gas_burnt.as_gas() as f64 / TGAS as f64
    );
    assert_eq!(
        pulls.len(),
        count as usize,
        "every pull minted and logged after funding"
    );
    assert!(
        failed.is_empty(),
        "a minimum-gas pull must not starve funding: {failed:?}"
    );
    for p in pulls {
        let vault: AccountId = format!("{}.{}", p["token_id"].as_str().unwrap(), g.e.nft.id())
            .parse()
            .unwrap();
        for ft in &g.fts {
            let b: String = ft
                .view("ft_balance_of")
                .args_json(json!({ "account_id": vault }))
                .await
                .unwrap()
                .json()
                .unwrap();
            assert_eq!(b, "1000", "{vault} funded with {}", ft.id());
        }
    }
    tgas
}

#[tokio::test]
async fn w2_gacha_minimum_gas_pulls_fund_every_vault() {
    let g = gacha_env().await;
    pull_with_minimum_gas(&g, 1, 60).await;
    pull_with_minimum_gas(&g, 10, 900).await;
    let treasury: Vec<(String, String)> =
        g.gacha.view("get_treasury").await.unwrap().json().unwrap();
    for (token, amount) in treasury {
        assert_eq!(
            amount,
            (1_000_000 - 11 * 1000).to_string(),
            "treasury of {token} debited exactly once per pull"
        );
    }
}

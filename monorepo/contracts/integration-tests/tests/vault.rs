//! Mint -> deposit -> withdraw through the real collection, vault (global by hash) and mock-ft.
use integration_tests::near_workspaces::ContractState;
use integration_tests::serde_json::json;
use integration_tests::*;

#[tokio::test]
async fn create_deposit_withdraw() {
    let e = Env::new().await;

    // mint resolves to the token id and creates a key-less vault running the global contract.
    let id = e.mint(&e.carol, e.alice.id()).await;
    assert_eq!(id, "0");
    assert_eq!(e.mint(&e.carol, e.alice.id()).await, "1");
    let vault = e.vault_of(&id);
    assert_eq!(e.owner_of(&id).await, e.alice.id().as_str());
    assert!(e.worker.view_access_keys(&vault).await.unwrap().is_empty());
    let code = e.worker.view_account(&vault).await.unwrap().contract_state;
    assert!(matches!(code, ContractState::GlobalHash(_)), "{code:?}");
    let extra: serde_json::Value =
        serde_json::from_str(e.token(&id).await["metadata"]["extra"].as_str().unwrap()).unwrap();
    assert_eq!(extra["creator"], e.carol.id().as_str());

    e.deposit(&e.alice, &id, 500_000).await;
    assert_eq!(e.ft_balance(&e.usdc, &vault).await, 500_000);
    assert_eq!(e.ft_balance(&e.usdc, e.alice.id()).await, 500_000);

    let r = e.withdraw(&e.alice, &id, 100_000).await;
    ok(&r);
    assert_eq!(
        events(&r, "vault_withdraw")[0],
        json!({ "token_id": id, "ft_id": e.usdc.id(), "amount": "100000", "owner_id": e.alice.id() })
    );
    assert_eq!(e.ft_balance(&e.usdc, &vault).await, 400_000);
    assert_eq!(e.ft_balance(&e.usdc, e.alice.id()).await, 600_000);

    // Only the owner, only through the collection.
    assert!(e.withdraw(&e.bob, &id, 1).await.is_failure());
    let r = e
        .bob
        .call(&vault, "withdraw")
        .args_json(json!({ "ft_id": e.usdc.id(), "amount": "1", "receiver_id": e.bob.id() }))
        .transact()
        .await
        .unwrap();
    assert!(r.is_failure());
    // Withdrawing more than the vault holds fails and unlocks the token.
    let r = e.withdraw(&e.alice, &id, 400_001).await;
    assert!(!has_event(&r, "vault_withdraw"), "{r:#?}");
    let locked: bool = e
        .nft
        .view("is_locked")
        .args_json(json!({ "token_id": id }))
        .await
        .unwrap()
        .json()
        .unwrap();
    assert!(!locked);
    assert_eq!(e.ft_balance(&e.usdc, &vault).await, 400_000);

    // The vault keeps the mint deposit minus the collection's 0.02 NEAR storage share, less the
    // 1 yocto every successful withdraw attaches to `ft_transfer`.
    assert_eq!(
        e.near_balance(&vault).await,
        MINT_DEPOSIT.as_yoctonear() - NEAR / 50 - 1
    );
}

/// A withdraw and a transfer of the same token race (two keys, same block): exactly one wins,
/// and the vault balance matches whoever won.
#[tokio::test]
async fn withdraw_races_transfer() {
    use integration_tests::near_workspaces::types::{AccessKey, KeyType, NearToken, SecretKey};
    use integration_tests::near_workspaces::Account;

    let e = Env::new().await;
    let id = e.mint(&e.alice, e.alice.id()).await;
    e.deposit(&e.alice, &id, 500_000).await;
    let sk = SecretKey::from_random(KeyType::ED25519);
    ok(&e
        .alice
        .batch(e.alice.id())
        .add_key(sk.public_key(), AccessKey::full_access())
        .transact()
        .await
        .unwrap());
    let alice2 = Account::from_secret_key(e.alice.id().clone(), sk, &e.worker);

    let w = e
        .alice
        .call(e.nft.id(), "withdraw")
        .args_json(json!({ "token_id": id, "ft_id": e.usdc.id(), "amount": "100000" }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact_async()
        .await
        .unwrap();
    let t = alice2
        .call(e.nft.id(), "nft_transfer")
        .args_json(json!({ "receiver_id": e.bob.id(), "token_id": id }))
        .deposit(NearToken::from_yoctonear(1))
        .transact_async()
        .await
        .unwrap();
    let (w, t) = (w.await.unwrap(), t.await.unwrap());
    let vault = e.vault_of(&id);
    if has_event(&w, "vault_withdraw") {
        assert!(t.is_failure(), "{t:#?}");
        assert_eq!(e.owner_of(&id).await, e.alice.id().as_str());
        assert_eq!(e.ft_balance(&e.usdc, &vault).await, 400_000);
    } else {
        assert!(t.is_success(), "{t:#?}");
        assert_eq!(e.owner_of(&id).await, e.bob.id().as_str());
        assert_eq!(e.ft_balance(&e.usdc, &vault).await, 500_000);
    }
}

/// The 0.02 NEAR the collection keeps per mint covers a max-size token minted to a new owner.
#[tokio::test]
async fn max_size_mint_fits_mint_storage() {
    use integration_tests::near_workspaces::types::Gas;

    let e = Env::new().await;
    let usage = || async {
        e.worker
            .view_account(e.nft.id())
            .await
            .unwrap()
            .storage_usage
    };
    // A 64-character owner id: the longest per-owner enumeration keys.
    let owner = |c: char| {
        format!(
            "{}.{}",
            c.to_string().repeat(63 - e.root.id().len()),
            e.root.id()
        )
    };
    let mint = |title_len: usize, receiver: String| {
        e.alice
            .call(e.nft.id(), "mint")
            .args_json(json!({
                "metadata": { "title": "x".repeat(title_len), "extra": "{}" },
                "receiver_id": receiver,
            }))
            .deposit(MINT_DEPOSIT)
            .gas(Gas::from_tgas(100))
            .transact()
    };
    // Largest title the size check accepts.
    let mut len = 1_200;
    while mint(len, owner('p')).await.unwrap().is_failure() {
        len -= 10;
    }
    let before = usage().await;
    let r = mint(len, owner('o')).await.unwrap();
    ok(&r);
    // The callback runs on 10 Tgas static; it must never run out (an orphan vault, no refund).
    let callback = r
        .receipt_outcomes()
        .iter()
        .find(|o| o.logs.iter().any(|l| l.contains("vault_created")))
        .unwrap()
        .gas_burnt;
    println!("on_vault_created burnt {} Ggas", callback.as_ggas());
    assert!(callback.as_tgas() < 5);
    let used = usage().await - before;
    println!("max-size mint to a new owner stores {used} bytes (title {len})");
    assert!(used <= 2_000, "{used} bytes > 0.02 NEAR of storage");
}

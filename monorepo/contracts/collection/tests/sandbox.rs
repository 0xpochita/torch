//! Sandbox tests 1-5 from skills/near-nft-account. Builds the wasm with `cargo near build` first.
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{AccessKey, NearToken, SecretKey};
use near_workspaces::{Account, AccountId, Contract, ContractState, Worker};
use serde_json::json;

const MINT_DEPOSIT: NearToken = NearToken::from_millinear(110);
const STORAGE: NearToken = NearToken::from_micronear(1250);

fn wasm(krate: &str) -> Vec<u8> {
    let dir = env!("CARGO_MANIFEST_DIR");
    let status = std::process::Command::new("cargo")
        .args(["near", "build", "non-reproducible-wasm", "--no-abi"])
        .current_dir(format!("{dir}/../{krate}"))
        .status()
        .expect("cargo near is installed");
    assert!(status.success(), "building {krate}");
    let name = krate.replace('-', "_");
    std::fs::read(format!("{dir}/../target/near/{name}/{name}.wasm")).unwrap()
}

/// near-workspaces has no helper for DeployGlobalContract, so sign it by hand. Returns the base58 hash.
async fn deploy_global_by_hash(
    worker: &Worker<Sandbox>,
    account: &Account,
    code: Vec<u8>,
) -> String {
    use near_jsonrpc_client::methods;
    use near_primitives::action::{Action, DeployGlobalContractAction, GlobalContractDeployMode};
    use near_primitives::transaction::{Transaction, TransactionV0};
    use near_primitives::types::{BlockReference, Finality};
    use near_primitives::views::{QueryRequest, TxExecutionStatus};

    let hash = near_primitives::hash::hash(&code).to_string();
    let client = near_jsonrpc_client::JsonRpcClient::connect(worker.rpc_addr());
    let secret: near_crypto::SecretKey = account.secret_key().to_string().parse().unwrap();
    let signer = near_crypto::InMemorySigner::from_secret_key(account.id().clone(), secret);
    let key = client
        .call(methods::query::RpcQueryRequest {
            block_reference: BlockReference::Finality(Finality::Final),
            request: QueryRequest::ViewAccessKey {
                account_id: account.id().clone(),
                public_key: signer.public_key(),
            },
        })
        .await
        .unwrap();
    let near_jsonrpc_primitives::types::query::QueryResponseKind::AccessKey(view) = key.kind else {
        panic!("access key")
    };
    let tx = Transaction::V0(TransactionV0 {
        nonce: view.nonce + 1,
        signer_id: account.id().clone(),
        public_key: signer.public_key(),
        receiver_id: account.id().clone(),
        block_hash: key.block_hash,
        actions: vec![Action::DeployGlobalContract(DeployGlobalContractAction {
            code: code.into(),
            deploy_mode: GlobalContractDeployMode::CodeHash,
        })],
    });
    let outcome = client
        .call(methods::send_tx::RpcSendTransactionRequest {
            signed_transaction: tx.sign(&signer),
            wait_until: TxExecutionStatus::Final,
        })
        .await
        .unwrap();
    let status = outcome
        .final_execution_outcome
        .unwrap()
        .into_outcome()
        .status;
    assert!(
        matches!(
            status,
            near_primitives::views::FinalExecutionStatus::SuccessValue(_)
        ),
        "{status:?}"
    );
    hash
}

struct Env {
    worker: Worker<Sandbox>,
    nft: Contract,
    usdc: Contract,
    alice: Account,
    bob: Account,
    market: Account,
}

async fn setup() -> Env {
    let worker = near_workspaces::sandbox().await.unwrap();
    let root = worker.root_account().unwrap();
    let vault_hash = deploy_global_by_hash(&worker, &root, wasm("vault")).await;

    let sub = |name: &'static str, near: u128| {
        let root = root.clone();
        async move {
            root.create_subaccount(name)
                .initial_balance(NearToken::from_near(near))
                .transact()
                .await
                .unwrap()
                .into_result()
                .unwrap()
        }
    };
    let nft = sub("nft", 30)
        .await
        .deploy(&wasm("collection"))
        .await
        .unwrap()
        .into_result()
        .unwrap();
    nft.call("new")
        .args_json(json!({
            "owner_id": root.id(),
            "vault_code_hash": vault_hash,
            "metadata": { "spec": "nft-1.0.0", "name": "Torch", "symbol": "TORCH" },
        }))
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
    let usdc = sub("usdc", 10)
        .await
        .deploy(&wasm("mock-ft"))
        .await
        .unwrap()
        .into_result()
        .unwrap();
    usdc.call("new")
        .args_json(json!({
            "owner_id": root.id(),
            "metadata": { "spec": "ft-1.0.0", "name": "Test USDC", "symbol": "tUSDC", "decimals": 6 },
        }))
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
    let (alice, bob, market) = (
        sub("alice", 20).await,
        sub("bob", 20).await,
        sub("market", 20).await,
    );

    for who in [alice.id(), bob.id()] {
        register(&root, &usdc, who).await;
    }
    root.call(usdc.id(), "mint")
        .args_json(json!({ "account_id": alice.id(), "amount": "1000000" }))
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
    Env {
        worker,
        nft,
        usdc,
        alice,
        bob,
        market,
    }
}

async fn register(payer: &Account, ft: &Contract, account_id: &AccountId) {
    payer
        .call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": account_id }))
        .deposit(STORAGE)
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
}

async fn ft_balance(e: &Env, account_id: &AccountId) -> u128 {
    let b: String = e
        .usdc
        .view("ft_balance_of")
        .args_json(json!({ "account_id": account_id }))
        .await
        .unwrap()
        .json()
        .unwrap();
    b.parse().unwrap()
}

async fn owner(e: &Env) -> AccountId {
    let t: serde_json::Value = e
        .nft
        .view("nft_token")
        .args_json(json!({ "token_id": "0" }))
        .await
        .unwrap()
        .json()
        .unwrap();
    t["owner_id"].as_str().unwrap().parse().unwrap()
}

async fn withdraw(e: &Env, who: &Account, amount: u128) -> ExecutionFinalResult {
    who.call(e.nft.id(), "withdraw")
        .args_json(json!({ "token_id": "0", "ft_id": e.usdc.id(), "amount": amount.to_string() }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await
        .unwrap()
}

fn has_event(r: &ExecutionFinalResult, event: &str) -> bool {
    r.logs()
        .iter()
        .any(|l| l.contains(&format!(r#""event":"{event}""#)))
}

#[tokio::test]
async fn vault_lifecycle() {
    let e = setup().await;
    let vault: AccountId = format!("0.{}", e.nft.id()).parse().unwrap();

    // 1. mint creates 0.<collection>, and the vault has no access keys.
    let r = e
        .alice
        .call(e.nft.id(), "mint")
        .args_json(json!({ "metadata": { "title": "Blue", "extra": r##"{"basket":[],"bg":"#9fd3ff","category":"Blue Chip","rarity":null}"## }, "receiver_id": null }))
        .deposit(MINT_DEPOSIT)
        .max_gas()
        .transact()
        .await
        .unwrap();
    assert!(r.is_success(), "{r:?}");
    assert!(has_event(&r, "vault_created"));
    assert_eq!(owner(&e).await, *e.alice.id());
    let vault_of: AccountId = e
        .nft
        .view("vault_of")
        .args_json(json!({ "token_id": "0" }))
        .await
        .unwrap()
        .json()
        .unwrap();
    assert_eq!(vault_of, vault);
    assert!(e.worker.view_access_keys(&vault).await.unwrap().is_empty());
    let code = e.worker.view_account(&vault).await.unwrap().contract_state;
    assert!(matches!(code, ContractState::GlobalHash(_)), "{code:?}");

    // 2. deposit FT to the vault, ft_balance_of(vault) matches.
    register(&e.alice, &e.usdc, &vault).await;
    let r = e
        .alice
        .call(e.usdc.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": vault, "amount": "500000", "msg": "" }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await
        .unwrap();
    assert!(r.is_success() && has_event(&r, "vault_deposit"), "{r:?}");
    assert_eq!(ft_balance(&e, &vault).await, 500_000);

    // 3a. withdraw and a transfer race (second key, same block): exactly one wins.
    let sk = SecretKey::from_random(near_workspaces::types::KeyType::ED25519);
    e.alice
        .batch(e.alice.id())
        .add_key(sk.public_key(), AccessKey::full_access())
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
    let alice2 = Account::from_secret_key(e.alice.id().clone(), sk, &e.worker);
    let w = e
        .alice
        .call(e.nft.id(), "withdraw")
        .args_json(json!({ "token_id": "0", "ft_id": e.usdc.id(), "amount": "100000" }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact_async()
        .await
        .unwrap();
    let t = alice2
        .call(e.nft.id(), "nft_transfer")
        .args_json(json!({ "receiver_id": e.bob.id(), "token_id": "0" }))
        .deposit(NearToken::from_yoctonear(1))
        .transact_async()
        .await
        .unwrap();
    let (w, t) = (w.await.unwrap(), t.await.unwrap());
    assert!(
        w.is_success() != t.is_success(),
        "exactly one succeeds: {w:?} {t:?}"
    );
    if w.is_success() {
        assert!(has_event(&w, "vault_withdraw"));
        assert_eq!(ft_balance(&e, &vault).await, 400_000);
        assert_eq!(ft_balance(&e, e.alice.id()).await, 600_000);
        assert_eq!(owner(&e).await, *e.alice.id());
    } else {
        assert_eq!(ft_balance(&e, &vault).await, 500_000);
        assert_eq!(owner(&e).await, *e.bob.id());
        // Hand it back so the rest of the test runs from one state.
        e.bob
            .call(e.nft.id(), "nft_transfer")
            .args_json(json!({ "receiver_id": e.alice.id(), "token_id": "0" }))
            .deposit(NearToken::from_yoctonear(1))
            .transact()
            .await
            .unwrap()
            .into_result()
            .unwrap();
    }
    let before_sale = ft_balance(&e, &vault).await;

    // 3b. listed: the marketplace sale and a withdraw race; the withdraw must lose (I6),
    // so the buyer gets the NFT with the full balance.
    e.alice
        .call(e.nft.id(), "nft_approve")
        .args_json(json!({ "token_id": "0", "account_id": e.market.id() }))
        .deposit(NearToken::from_millinear(10))
        .max_gas()
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap();
    let t: serde_json::Value = e
        .nft
        .view("nft_token")
        .args_json(json!({ "token_id": "0" }))
        .await
        .unwrap()
        .json()
        .unwrap();
    let approval_id = t["approved_account_ids"][e.market.id().as_str()].clone();
    let w = e
        .alice
        .call(e.nft.id(), "withdraw")
        .args_json(json!({ "token_id": "0", "ft_id": e.usdc.id(), "amount": "100000" }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact_async()
        .await
        .unwrap();
    let sale = e
        .market
        .call(e.nft.id(), "nft_transfer_payout")
        .args_json(json!({ "receiver_id": e.bob.id(), "token_id": "0", "approval_id": approval_id, "balance": "1000000", "max_len_payout": 10 }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact_async()
        .await
        .unwrap();
    let (w, sale) = (w.await.unwrap(), sale.await.unwrap());
    assert!(w.is_failure() && sale.is_success(), "{w:?} {sale:?}");
    let payout: serde_json::Value = sale.json().unwrap();
    assert_eq!(payout["payout"][e.alice.id().as_str()], "1000000"); // alice is also the creator
    assert_eq!(owner(&e).await, *e.bob.id());
    assert_eq!(ft_balance(&e, &vault).await, before_sale);

    // 4. after the sale, the old owner's withdraw fails, the new owner's succeeds.
    assert!(withdraw(&e, &e.alice, 1).await.is_failure());
    let bob_before = ft_balance(&e, e.bob.id()).await;
    let r = withdraw(&e, &e.bob, 50_000).await;
    assert!(r.is_success() && has_event(&r, "vault_withdraw"), "{r:?}");
    assert_eq!(ft_balance(&e, e.bob.id()).await, bob_before + 50_000);
    assert_eq!(ft_balance(&e, &vault).await, before_sale - 50_000);

    // 5. calling the vault directly from anyone but the collection fails.
    for who in [&e.alice, &e.bob] {
        let r = who
            .call(&vault, "withdraw")
            .args_json(json!({ "ft_id": e.usdc.id(), "amount": "1", "receiver_id": who.id() }))
            .max_gas()
            .transact()
            .await
            .unwrap();
        assert!(r.is_failure());
    }
    assert_eq!(ft_balance(&e, &vault).await, before_sale - 50_000);
}

//! Shared sandbox helpers: real wasm of every contract, collection + vault (global by hash) + mock-ft.
#![allow(dead_code)]
pub use near_workspaces::network::Sandbox;
pub use near_workspaces::result::ExecutionFinalResult;
pub use near_workspaces::types::NearToken;
pub use near_workspaces::{Account, AccountId, Contract, Worker};
pub use serde_json::{json, Value};

pub const MINT_DEPOSIT: NearToken = NearToken::from_millinear(110);
pub const STORAGE: NearToken = NearToken::from_micronear(1250);
pub const YOCTO: NearToken = NearToken::from_yoctonear(1);

pub fn wasm(krate: &str) -> Vec<u8> {
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

/// near-workspaces has no helper for DeployGlobalContract (same as collection/tests/sandbox.rs).
pub async fn deploy_global_by_hash(
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
    client
        .call(methods::send_tx::RpcSendTransactionRequest {
            signed_transaction: tx.sign(&signer),
            wait_until: TxExecutionStatus::Final,
        })
        .await
        .unwrap();
    hash
}

pub struct Env {
    pub worker: Worker<Sandbox>,
    pub root: Account,
    pub nft: Contract,
    pub usdc: Contract,
    pub alice: Account,
    pub bob: Account,
}

pub async fn sub(root: &Account, name: &str, near: u128) -> Account {
    root.create_subaccount(name)
        .initial_balance(NearToken::from_near(near))
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap()
}

pub async fn deploy(root: &Account, name: &str, near: u128, krate: &str) -> Contract {
    sub(root, name, near)
        .await
        .deploy(&wasm(krate))
        .await
        .unwrap()
        .into_result()
        .unwrap()
}

pub fn ok(r: ExecutionFinalResult) {
    assert!(r.is_success(), "{r:#?}");
}

/// Real collection (vault as global contract by hash) + mock-ft usdc; alice and bob registered.
pub async fn setup() -> Env {
    let worker = near_workspaces::sandbox().await.unwrap();
    let root = worker.root_account().unwrap();
    let vault_hash = deploy_global_by_hash(&worker, &root, wasm("vault")).await;
    let nft = deploy(&root, "nft", 30, "collection").await;
    ok(nft
        .call("new")
        .args_json(json!({
            "owner_id": root.id(),
            "vault_code_hash": vault_hash,
            "metadata": { "spec": "nft-1.0.0", "name": "Torch", "symbol": "TORCH" },
        }))
        .transact()
        .await
        .unwrap());
    let usdc = deploy(&root, "usdc", 10, "mock-ft").await;
    ok(usdc
        .call("new")
        .args_json(json!({
            "owner_id": root.id(),
            "metadata": { "spec": "ft-1.0.0", "name": "Test USDC", "symbol": "tUSDC", "decimals": 6 },
        }))
        .transact()
        .await
        .unwrap());
    let (alice, bob) = (sub(&root, "alice", 50).await, sub(&root, "bob", 50).await);
    let e = Env {
        worker,
        root,
        nft,
        usdc,
        alice,
        bob,
    };
    for who in [e.root.id(), e.alice.id(), e.bob.id()] {
        register(&e, who).await;
    }
    e
}

pub async fn register(e: &Env, account_id: &AccountId) {
    ok(e.root
        .call(e.usdc.id(), "storage_deposit")
        .args_json(json!({ "account_id": account_id }))
        .deposit(STORAGE)
        .transact()
        .await
        .unwrap());
}

pub async fn mint_usdc(e: &Env, to: &AccountId, amount: u128) {
    ok(e.root
        .call(e.usdc.id(), "mint")
        .args_json(json!({ "account_id": to, "amount": amount.to_string() }))
        .transact()
        .await
        .unwrap());
}

pub async fn usdc_of(e: &Env, account_id: &AccountId) -> u128 {
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

pub async fn owner_of(e: &Env, token_id: &str) -> AccountId {
    let t: Value = e
        .nft
        .view("nft_token")
        .args_json(json!({ "token_id": token_id }))
        .await
        .unwrap()
        .json()
        .unwrap();
    t["owner_id"].as_str().unwrap().parse().unwrap()
}

pub async fn is_locked(e: &Env, token_id: &str) -> bool {
    e.nft
        .view("is_locked")
        .args_json(json!({ "token_id": token_id }))
        .await
        .unwrap()
        .json()
        .unwrap()
}

/// Alice mints the next token; returns its vault id.
pub async fn mint(e: &Env, token_id: &str) -> AccountId {
    ok(e.alice
        .call(e.nft.id(), "mint")
        .args_json(json!({ "metadata": { "title": "Blue" }, "receiver_id": null }))
        .deposit(MINT_DEPOSIT)
        .max_gas()
        .transact()
        .await
        .unwrap());
    format!("{token_id}.{}", e.nft.id()).parse().unwrap()
}

pub async fn deploy_market(e: &Env, near: u128) -> Contract {
    let market = deploy(&e.root, "market", near, "market").await;
    ok(market
        .call("new")
        .args_json(json!({ "collection_id": e.nft.id(), "fee_receiver_id": e.root.id() }))
        .transact()
        .await
        .unwrap());
    market
}

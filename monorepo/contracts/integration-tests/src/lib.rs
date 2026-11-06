//! Shared setup for the sandbox tests: builds every contract with `cargo near` and deploys the
//! real mock-ft, vault (global contract by hash), collection, market and gacha together.
use std::sync::OnceLock;

use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, AccountId, Contract, Worker};
use serde_json::{json, Value};

pub use near_workspaces;
pub use serde_json;

pub const NEAR: u128 = 10u128.pow(24);
pub const MINT_DEPOSIT: NearToken = NearToken::from_millinear(110);
pub const FT_STORAGE: NearToken = NearToken::from_micronear(1250);
pub const PULL_PRICE: NearToken = NearToken::from_millinear(100);
/// What a 10-pull attaches: testnet's `max_total_prepaid_gas` (1 PGas since protocol 83).
pub const MAX_TX_GAS: Gas = Gas::from_tgas(1000);

/// `cargo near build` once per test binary; returns the wasm bytes.
pub fn wasm(krate: &str) -> Vec<u8> {
    static BUILT: OnceLock<()> = OnceLock::new();
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/..");
    BUILT.get_or_init(|| {
        for c in ["mock-ft", "vault", "collection", "market", "gacha"] {
            let status = std::process::Command::new("cargo")
                .args(["near", "build", "non-reproducible-wasm", "--no-abi"])
                .current_dir(format!("{dir}/{c}"))
                .status()
                .expect("cargo near is installed");
            assert!(status.success(), "building {c}");
        }
    });
    let name = krate.replace('-', "_");
    std::fs::read(format!("{dir}/target/near/{name}/{name}.wasm")).unwrap()
}

/// near-workspaces has no helper for DeployGlobalContract, so sign it by hand. Returns the base58 hash.
pub async fn deploy_global_by_hash(
    worker: &Worker<Sandbox>,
    account: &Account,
    code: Vec<u8>,
) -> String {
    use near_jsonrpc_client::methods;
    use near_primitives::action::{Action, DeployGlobalContractAction, GlobalContractDeployMode};
    use near_primitives::transaction::{Transaction, TransactionV0};
    use near_primitives::types::{BlockReference, Finality};
    use near_primitives::views::{FinalExecutionStatus, QueryRequest, TxExecutionStatus};

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
        matches!(status, FinalExecutionStatus::SuccessValue(_)),
        "{status:?}"
    );
    hash
}

/// The transaction and every receipt it spawned succeeded.
pub fn ok(r: &ExecutionFinalResult) {
    assert!(r.is_success(), "{r:#?}");
    assert!(r.receipt_failures().is_empty(), "{r:#?}");
}

/// `data[0]` of every torch event named `event`.
pub fn events(r: &ExecutionFinalResult, event: &str) -> Vec<Value> {
    r.logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .map(|j| serde_json::from_str::<Value>(j).unwrap())
        .filter(|e| e["event"] == event)
        .map(|e| e["data"][0].clone())
        .collect()
}

pub fn has_event(r: &ExecutionFinalResult, event: &str) -> bool {
    !events(r, event).is_empty()
}

pub struct Env {
    pub worker: Worker<Sandbox>,
    pub root: Account,
    pub nft: Contract,
    pub market: Contract,
    pub gacha: Contract,
    pub usdc: Contract,
    pub btc: Contract,
    pub eth: Contract,
    /// Seller in the market tests.
    pub alice: Account,
    /// Buyer in the market tests, player in the gacha tests.
    pub bob: Account,
    /// Mints tokens for alice, so the royalty goes to a third account.
    pub carol: Account,
    pub fee: Account,
    /// Gacha owner, funds the treasury.
    pub owner: Account,
}

/// Basket amounts per rarity: (usdc and eth, btc).
pub fn basket_amounts(rarity: &str) -> (u128, u128) {
    match rarity {
        "Common" => (1_000, 1),
        "Rare" => (5_000, 5),
        "Epic" => (20_000, 20),
        _ => (100_000, 100),
    }
}

impl Env {
    pub async fn new() -> Env {
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
        let deploy = |name: &'static str, near: u128, krate: &'static str| async move {
            sub(name, near)
                .await
                .deploy(&wasm(krate))
                .await
                .unwrap()
                .into_result()
                .unwrap()
        };

        let nft = deploy("nft", 50, "collection").await;
        let market = deploy("market", 5, "market").await;
        let gacha = deploy("gacha", 30, "gacha").await;
        let usdc = deploy("usdc", 10, "mock-ft").await;
        let btc = deploy("btc", 10, "mock-ft").await;
        let eth = deploy("eth", 10, "mock-ft").await;
        let (alice, bob, carol, fee, owner) = (
            sub("alice", 50).await,
            sub("bob", 50).await,
            sub("carol", 20).await,
            sub("fee", 5).await,
            sub("owner", 20).await,
        );

        ok(&nft
            .call("new")
            .args_json(json!({
                "owner_id": root.id(),
                "vault_code_hash": vault_hash,
                "metadata": { "spec": "nft-1.0.0", "name": "Torch", "symbol": "TORCH" },
            }))
            .transact()
            .await
            .unwrap());
        ok(&market
            .call("new")
            .args_json(json!({ "collection_id": nft.id(), "fee_receiver_id": fee.id() }))
            .transact()
            .await
            .unwrap());
        for (ft, symbol, decimals) in [(&usdc, "tUSDC", 6), (&btc, "tBTC", 8), (&eth, "tETH", 18)] {
            ok(&ft
                .call("new")
                .args_json(json!({
                    "owner_id": root.id(),
                    "metadata": { "spec": "ft-1.0.0", "name": symbol, "symbol": symbol, "decimals": decimals },
                }))
                .transact()
                .await
                .unwrap());
        }
        let tiers: Vec<_> = [
            ("Common", 6000),
            ("Rare", 2800),
            ("Epic", 1000),
            ("Legendary", 200),
        ]
        .into_iter()
        .map(|(rarity, weight)| {
            let (a, b) = basket_amounts(rarity);
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
        ok(&gacha
            .call("new")
            .args_json(json!({
                "owner_id": owner.id(),
                "collection_id": nft.id(),
                "price_per_pull": PULL_PRICE.as_yoctonear().to_string(),
                "pity": 50,
                "tiers": tiers,
            }))
            .transact()
            .await
            .unwrap());

        let e = Env {
            worker,
            root,
            nft,
            market,
            gacha,
            usdc,
            btc,
            eth,
            alice,
            bob,
            carol,
            fee,
            owner,
        };
        e.register(&e.usdc, e.alice.id()).await;
        e.register(&e.usdc, e.bob.id()).await;
        e.ft_mint(&e.usdc, e.alice.id(), 1_000_000).await;
        e
    }

    pub fn fts(&self) -> [&Contract; 3] {
        [&self.usdc, &self.btc, &self.eth]
    }

    pub async fn register(&self, ft: &Contract, account_id: &AccountId) {
        ok(&self
            .root
            .call(ft.id(), "storage_deposit")
            .args_json(json!({ "account_id": account_id }))
            .deposit(FT_STORAGE)
            .transact()
            .await
            .unwrap());
    }

    pub async fn ft_mint(&self, ft: &Contract, account_id: &AccountId, amount: u128) {
        ok(&self
            .root
            .call(ft.id(), "mint")
            .args_json(json!({ "account_id": account_id, "amount": amount.to_string() }))
            .transact()
            .await
            .unwrap());
    }

    pub async fn ft_balance(&self, ft: &Contract, account_id: &AccountId) -> u128 {
        let b: String = ft
            .view("ft_balance_of")
            .args_json(json!({ "account_id": account_id }))
            .await
            .unwrap()
            .json()
            .unwrap();
        b.parse().unwrap()
    }

    pub async fn near_balance(&self, account_id: &AccountId) -> u128 {
        self.worker
            .view_account(account_id)
            .await
            .unwrap()
            .balance
            .as_yoctonear()
    }

    pub fn vault_of(&self, token_id: &str) -> AccountId {
        format!("{token_id}.{}", self.nft.id()).parse().unwrap()
    }

    /// `minter` mints to `receiver`; returns the token id `mint` resolved to.
    pub async fn mint(&self, minter: &Account, receiver: &AccountId) -> String {
        let r = minter
            .call(self.nft.id(), "mint")
            .args_json(json!({
                "metadata": { "title": "Blue", "extra": r##"{"basket":[],"bg":"#9fd3ff","category":"Blue Chip"}"## },
                "receiver_id": receiver,
            }))
            .deposit(MINT_DEPOSIT)
            .gas(Gas::from_tgas(100))
            .transact()
            .await
            .unwrap();
        ok(&r);
        assert!(has_event(&r, "vault_created"));
        r.json::<Option<String>>()
            .unwrap()
            .expect("mint resolved to null")
    }

    /// `from` registers the vault on `usdc` and deposits `amount` with `ft_transfer_call`.
    pub async fn deposit(&self, from: &Account, token_id: &str, amount: u128) {
        let vault = self.vault_of(token_id);
        self.register(&self.usdc, &vault).await;
        let r = from
            .call(self.usdc.id(), "ft_transfer_call")
            .args_json(json!({ "receiver_id": vault, "amount": amount.to_string(), "msg": "" }))
            .deposit(NearToken::from_yoctonear(1))
            .gas(Gas::from_tgas(100))
            .transact()
            .await
            .unwrap();
        ok(&r);
        assert!(has_event(&r, "vault_deposit"));
    }

    pub async fn token(&self, token_id: &str) -> Value {
        self.nft
            .view("nft_token")
            .args_json(json!({ "token_id": token_id }))
            .await
            .unwrap()
            .json()
            .unwrap()
    }

    pub async fn owner_of(&self, token_id: &str) -> String {
        self.token(token_id).await["owner_id"]
            .as_str()
            .unwrap()
            .to_string()
    }

    pub async fn market_view(&self, method: &str, args: Value) -> Value {
        self.market
            .view(method)
            .args_json(args)
            .await
            .unwrap()
            .json()
            .unwrap()
    }

    /// Owner approves the market with `msg` (`{"list":..}` or `{"accept_offer":..}`).
    pub async fn approve(&self, who: &Account, token_id: &str, msg: Value) -> ExecutionFinalResult {
        who.call(self.nft.id(), "nft_approve")
            .args_json(json!({ "token_id": token_id, "account_id": self.market.id(), "msg": msg.to_string() }))
            .deposit(NearToken::from_millinear(10))
            .gas(Gas::from_tgas(250))
            .transact()
            .await
            .unwrap()
    }

    pub async fn withdraw(
        &self,
        who: &Account,
        token_id: &str,
        amount: u128,
    ) -> ExecutionFinalResult {
        who.call(self.nft.id(), "withdraw")
            .args_json(json!({ "token_id": token_id, "ft_id": self.usdc.id(), "amount": amount.to_string() }))
            .deposit(NearToken::from_yoctonear(1))
            .gas(Gas::from_tgas(100))
            .transact()
            .await
            .unwrap()
    }

    /// Lets pending gas refunds land before a test snapshots NEAR balances.
    pub async fn settle(&self) {
        self.worker.fast_forward(3).await.unwrap();
    }
}

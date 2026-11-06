//! Sandbox reproductions for ../AUDIT.md. Each test asserts the SAFE behaviour, so it fails
//! while the finding is open. Builds the real wasm of every contract with `cargo near build`.
use near_workspaces::network::Sandbox;
use near_workspaces::result::ExecutionFinalResult;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, AccountId, Contract, Worker};
use serde_json::{json, Value};

const MINT_DEPOSIT: NearToken = NearToken::from_millinear(110);
const STORAGE: NearToken = NearToken::from_micronear(1250);
const YOCTO: NearToken = NearToken::from_yoctonear(1);

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

/// near-workspaces has no helper for DeployGlobalContract (same as collection/tests/sandbox.rs).
async fn deploy_global_by_hash(worker: &Worker<Sandbox>, account: &Account, code: Vec<u8>) -> String {
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

struct Env {
    worker: Worker<Sandbox>,
    root: Account,
    nft: Contract,
    usdc: Contract,
    alice: Account,
    bob: Account,
}

async fn sub(root: &Account, name: &str, near: u128) -> Account {
    root.create_subaccount(name)
        .initial_balance(NearToken::from_near(near))
        .transact()
        .await
        .unwrap()
        .into_result()
        .unwrap()
}

async fn deploy(root: &Account, name: &str, near: u128, krate: &str) -> Contract {
    sub(root, name, near)
        .await
        .deploy(&wasm(krate))
        .await
        .unwrap()
        .into_result()
        .unwrap()
}

fn ok(r: ExecutionFinalResult) -> ExecutionFinalResult {
    assert!(r.is_success(), "{r:#?}");
    r
}

/// Real collection (vault as global contract by hash) + mock-ft usdc; alice and bob registered.
async fn setup() -> Env {
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
    let e = Env { worker, root, nft, usdc, alice, bob };
    for who in [e.root.id(), e.alice.id(), e.bob.id()] {
        register(&e, who).await;
    }
    e
}

async fn register(e: &Env, account_id: &AccountId) {
    ok(e.root
        .call(e.usdc.id(), "storage_deposit")
        .args_json(json!({ "account_id": account_id }))
        .deposit(STORAGE)
        .transact()
        .await
        .unwrap());
}

async fn mint_usdc(e: &Env, to: &AccountId, amount: u128) {
    ok(e.root
        .call(e.usdc.id(), "mint")
        .args_json(json!({ "account_id": to, "amount": amount.to_string() }))
        .transact()
        .await
        .unwrap());
}

async fn usdc_of(e: &Env, account_id: &AccountId) -> u128 {
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

async fn owner_of(e: &Env, token_id: &str) -> AccountId {
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

async fn is_locked(e: &Env, token_id: &str) -> bool {
    e.nft
        .view("is_locked")
        .args_json(json!({ "token_id": token_id }))
        .await
        .unwrap()
        .json()
        .unwrap()
}

/// Alice mints the next token; returns its vault id.
async fn mint(e: &Env, token_id: &str) -> AccountId {
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

async fn deploy_market(e: &Env, near: u128) -> Contract {
    let market = deploy(&e.root, "market", near, "market").await;
    ok(market
        .call("new")
        .args_json(json!({ "collection_id": e.nft.id(), "fee_receiver_id": e.root.id() }))
        .transact()
        .await
        .unwrap());
    market
}

/// C-1: the real collection's `mint` resolves to `on_vault_created -> bool`, but the gacha
/// parses the result as a token-id string. Every pull is treated as a failed mint: the player
/// keeps the NFT AND gets the price back, the vault is never funded, and pity still advances.
#[tokio::test]
async fn c1_gacha_pull_against_real_collection_funds_vault_and_keeps_price() {
    let e = setup().await;
    let gacha = deploy(&e.root, "gacha", 20, "gacha").await;
    ok(gacha
        .call("new")
        .args_json(json!({
            "owner_id": e.root.id(),
            "collection_id": e.nft.id(),
            "price_per_pull": NearToken::from_millinear(100).as_yoctonear().to_string(),
            "pity": 50,
            "tiers": [{
                "rarity": "Legendary",
                "weight_bps": 10000,
                "baskets": [{ "name": "B", "category": "Blue Chip", "bg": "#fff",
                    "items": [{ "token": e.usdc.id(), "amount": "1000" }] }],
            }],
        }))
        .transact()
        .await
        .unwrap());
    register(&e, gacha.id()).await;
    mint_usdc(&e, e.root.id(), 1_000_000).await;
    ok(e.root
        .call(e.usdc.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": gacha.id(), "amount": "1000000", "msg": "fund" }))
        .deposit(YOCTO)
        .max_gas()
        .transact()
        .await
        .unwrap());

    let before = e.bob.view_account().await.unwrap().balance;
    ok(e.bob
        .call(gacha.id(), "pull")
        .args_json(json!({ "count": 1 }))
        .deposit(NearToken::from_millinear(100))
        .max_gas()
        .transact()
        .await
        .unwrap());
    let after = e.bob.view_account().await.unwrap().balance;

    assert_eq!(owner_of(&e, "0").await, *e.bob.id(), "the pull minted token 0 to the player");
    let vault: AccountId = format!("0.{}", e.nft.id()).parse().unwrap();
    assert_eq!(
        usdc_of(&e, &vault).await,
        1000,
        "the minted vault must hold the basket (gacha treated the mint as failed)"
    );
    assert!(
        before.as_yoctonear() - after.as_yoctonear() >= NearToken::from_millinear(100).as_yoctonear(),
        "the player must pay for a pull that minted an NFT (was refunded)"
    );
}

/// H-1: offers are not tied to the vault's contents. The seller drains the vault (no approval
/// exists, so I6 does not apply), then accepts the standing offer: the buyer pays full price for
/// an empty vault.
#[tokio::test]
async fn h1_accepting_an_offer_after_draining_the_vault_must_fail() {
    let e = setup().await;
    let market = deploy_market(&e, 10).await;
    let vault = mint(&e, "0").await;
    register(&e, &vault).await;
    mint_usdc(&e, e.alice.id(), 1_000_000).await;
    ok(e.alice
        .call(e.usdc.id(), "ft_transfer_call")
        .args_json(json!({ "receiver_id": vault, "amount": "1000000", "msg": "" }))
        .deposit(YOCTO)
        .max_gas()
        .transact()
        .await
        .unwrap());

    // Bob offers 5 NEAR for a vault holding 1_000_000 usdc.
    ok(e.bob
        .call(market.id(), "offer")
        .args_json(json!({ "token_id": "0", "expires_at": u64::MAX }))
        .deposit(NearToken::from_near(5))
        .transact()
        .await
        .unwrap());
    // Alice empties the vault, then accepts.
    ok(e.alice
        .call(e.nft.id(), "withdraw")
        .args_json(json!({ "token_id": "0", "ft_id": e.usdc.id(), "amount": "1000000" }))
        .deposit(YOCTO)
        .max_gas()
        .transact()
        .await
        .unwrap());
    let _ = e
        .alice
        .call(e.nft.id(), "nft_approve")
        .args_json(json!({
            "token_id": "0",
            "account_id": market.id(),
            "msg": json!({ "accept_offer": { "buyer_id": e.bob.id() } }).to_string(),
        }))
        .deposit(NearToken::from_millinear(10))
        .max_gas()
        .transact()
        .await
        .unwrap();

    let sold = owner_of(&e, "0").await == *e.bob.id();
    assert!(
        !sold || usdc_of(&e, &vault).await == 1_000_000,
        "bob paid 5 NEAR for token 0 but its vault was drained to {}",
        usdc_of(&e, &vault).await
    );
}

/// H-2: `offer` stores an unbounded caller-chosen `token_id` three times in market storage that
/// the market pays for, out of a balance that includes other buyers' escrow. A few 0.01 NEAR
/// offers with ~1.9 kB ids push storage above the free balance, and honest buyers can no
/// longer cancel (LackBalanceForState) until someone tops the market up.
#[tokio::test]
async fn h2_long_token_id_offers_must_not_freeze_other_buyers_escrow() {
    let e = setup().await;
    let market = deploy_market(&e, 10).await;
    // Leave the market a realistic 0.3 NEAR above its storage stake.
    let info = market.view_account().await.unwrap();
    let staked = info.storage_usage as u128 * 10u128.pow(19);
    let excess = info.balance.as_yoctonear() - staked - NearToken::from_millinear(300).as_yoctonear();
    ok(market
        .as_account()
        .transfer_near(e.root.id(), NearToken::from_yoctonear(excess))
        .await
        .unwrap());

    ok(e.bob
        .call(market.id(), "offer")
        .args_json(json!({ "token_id": "0", "expires_at": u64::MAX }))
        .deposit(NearToken::from_near(1))
        .transact()
        .await
        .unwrap());

    let mallory = sub(&e.root, "mallory", 10).await;
    let mut placed = 0;
    for i in 0..20 {
        let r = mallory
            .call(market.id(), "offer")
            .args_json(json!({ "token_id": format!("{i:02}{}", "x".repeat(1900)), "expires_at": u64::MAX }))
            .deposit(NearToken::from_millinear(10))
            .max_gas()
            .transact()
            .await
            .unwrap();
        if r.is_failure() {
            break;
        }
        placed += 1;
    }
    let r = e
        .bob
        .call(market.id(), "cancel_offer")
        .args_json(json!({ "token_id": "0" }))
        .max_gas()
        .transact()
        .await
        .unwrap();
    assert!(
        r.is_success(),
        "after {placed} attacker offers (0.01 NEAR each) bob cannot get his 1 NEAR back: {:?}",
        r.failures()
    );
}

/// I9 check: `nft_resolve_transfer` gets a fixed 5 Tgas from near-contract-standards (unused gas
/// weight 0). If the revert path runs out of gas, the lock is never removed and the token is
/// stuck with the receiver forever. Exercised with no approvals and with 30 approvals.
#[tokio::test]
async fn i9_transfer_call_revert_unlocks_with_many_approvals() {
    let e = setup().await;
    for (token_id, approvals) in [("0", 0), ("1", 30)] {
        mint(&e, token_id).await;
        for i in 0..approvals {
            ok(e.alice
                .call(e.nft.id(), "nft_approve")
                .args_json(json!({ "token_id": token_id, "account_id": format!("approved-{i:02}.test.near") }))
                .deposit(NearToken::from_millinear(10))
                .max_gas()
                .transact()
                .await
                .unwrap());
        }
        // bob has no contract, so nft_on_transfer fails and the transfer must be reverted.
        let _ = e
            .alice
            .call(e.nft.id(), "nft_transfer_call")
            .args_json(json!({ "receiver_id": e.bob.id(), "token_id": token_id, "msg": "" }))
            .deposit(YOCTO)
            .max_gas()
            .transact()
            .await
            .unwrap();
        assert_eq!(owner_of(&e, token_id).await, *e.alice.id(), "token {token_id} returned");
        assert!(!is_locked(&e, token_id).await, "token {token_id} ({approvals} approvals) stays locked");
    }
    let _ = &e.worker;
}

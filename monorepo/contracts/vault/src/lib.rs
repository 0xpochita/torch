//! One vault per NFT. Holds the basket's NEP-141 tokens. No access keys; obeys only the collection.
use near_sdk::json_types::U128;
use near_sdk::{
    env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};

#[allow(dead_code)] // only the generated `ext_ft` is used
#[ext_contract(ext_ft)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Vault {
    collection_id: AccountId,
}

#[near]
impl Vault {
    /// Called in the same batch that creates the account, so the predecessor is the collection.
    #[init]
    pub fn new(collection_id: AccountId) -> Self {
        require!(
            env::predecessor_account_id() == collection_id,
            "only the collection can init"
        );
        require!(
            collection_id != env::current_account_id(),
            "vault cannot be its own collection"
        );
        Self { collection_id }
    }

    /// Only the collection may move funds; it has already checked the NFT owner and locks.
    /// The collection emits `vault_withdraw` once this resolves.
    pub fn withdraw(&mut self, ft_id: AccountId, amount: U128, receiver_id: AccountId) -> Promise {
        self.assert_collection();
        ext_ft::ext(ft_id)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(Gas::from_tgas(10))
            .ft_transfer(receiver_id, amount, None)
    }

    /// NEP-141 receiver: anyone may deposit into the basket. Keep everything.
    /// `ft_id` is the predecessor, so indexers must only trust events from known token contracts.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let _ = msg;
        // Hand-written JSON keeps serde_json's serializer out of the wasm (a global contract
        // costs NEAR per byte). Account ids and the token id never need escaping.
        env::log_str(&format!(
            r#"EVENT_JSON:{{"standard":"torch","version":"1.0.0","event":"vault_deposit","data":[{{"token_id":"{}","ft_id":"{}","amount":"{}","sender_id":"{}"}}]}}"#,
            token_id(),
            env::predecessor_account_id(),
            amount.0,
            sender_id,
        ));
        PromiseOrValue::Value(U128(0))
    }

    pub fn collection_id(&self) -> AccountId {
        self.collection_id.clone()
    }
}

impl Vault {
    fn assert_collection(&self) {
        require!(
            env::predecessor_account_id() == self.collection_id,
            "only the collection"
        );
    }
}

/// The vault account is `<token_id>.<collection>`.
fn token_id() -> String {
    let id = env::current_account_id();
    id.as_str()
        .split_once('.')
        .map_or("", |(t, _)| t)
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_logs, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(predecessor: &str) {
        testing_env!(VMContextBuilder::new()
            .current_account_id("7.nft.testnet".parse().unwrap())
            .predecessor_account_id(predecessor.parse().unwrap())
            .build());
    }

    #[test]
    #[should_panic(expected = "only the collection can init")]
    fn only_collection_can_init() {
        ctx("mallory.testnet");
        Vault::new("nft.testnet".parse().unwrap());
    }

    #[test]
    #[should_panic(expected = "only the collection")]
    fn only_collection_can_withdraw() {
        ctx("nft.testnet");
        let mut v = Vault::new("nft.testnet".parse().unwrap());
        ctx("mallory.testnet");
        let _ = v.withdraw(
            "usdc.testnet".parse().unwrap(),
            U128(1),
            "mallory.testnet".parse().unwrap(),
        );
    }

    #[test]
    fn deposit_keeps_all_and_logs_event() {
        ctx("nft.testnet");
        let mut v = Vault::new("nft.testnet".parse().unwrap());
        ctx("usdc.testnet");
        let kept = v.ft_on_transfer("alice.testnet".parse().unwrap(), U128(5), String::new());
        assert!(matches!(kept, PromiseOrValue::Value(U128(0))));
        assert_eq!(
            get_logs(),
            vec![
                r#"EVENT_JSON:{"standard":"torch","version":"1.0.0","event":"vault_deposit","data":[{"token_id":"7","ft_id":"usdc.testnet","amount":"5","sender_id":"alice.testnet"}]}"#
            ]
        );
    }
}

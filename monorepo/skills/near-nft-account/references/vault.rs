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
    pub fn withdraw(&mut self, ft_id: AccountId, amount: U128, receiver_id: AccountId) -> Promise {
        self.assert_collection();
        ext_ft::ext(ft_id)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(Gas::from_tgas(10))
            .ft_transfer(receiver_id, amount, None)
    }

    /// NEP-141 receiver: anyone may deposit into the basket. Keep everything.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let _ = (sender_id, amount, msg);
        PromiseOrValue::Value(U128(0))
    }

    pub fn collection_id(&self) -> AccountId {
        self.collection_id.clone()
    }

    fn assert_collection(&self) {
        require!(
            env::predecessor_account_id() == self.collection_id,
            "only the collection"
        );
    }
}

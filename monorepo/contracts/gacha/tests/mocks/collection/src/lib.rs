//! Test double for the collection: `mint` creates `<id>.<self>` running this same code as a
//! vault (accepts every `ft_on_transfer`) through a global contract, like the real collection,
//! then records the owner and returns the token id.
use near_sdk::json_types::Base64VecU8;
use near_sdk::serde_json::Value;
use near_sdk::store::LookupMap;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue};
use near_sdk::json_types::U128;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Mock {
    vault_code_hash: [u8; 32],
    next_id: u64,
    owners: LookupMap<String, (AccountId, String)>,
}

#[near]
impl Mock {
    #[init]
    pub fn new(vault_code: Base64VecU8) -> Self {
        let code: Vec<u8> = vault_code.into();
        let vault_code_hash = env::sha256_array(&code);
        Promise::new(env::current_account_id()).deploy_global_contract(code).detach();
        Self { vault_code_hash, next_id: 0, owners: LookupMap::new(b"o") }
    }

    /// Vault role: the deployed vault is initialised with an empty state.
    #[init]
    pub fn new_vault() -> Self {
        Self { vault_code_hash: [0; 32], next_id: 0, owners: LookupMap::new(b"o") }
    }

    #[payable]
    pub fn mint(&mut self, metadata: Value, receiver_id: Option<AccountId>) -> Promise {
        require!(env::attached_deposit() >= NearToken::from_millinear(110), "attach 0.11 NEAR");
        let token_id = self.next_id.to_string();
        self.next_id += 1;
        let extra = metadata["extra"].as_str().unwrap_or_default().to_string();
        let owner = receiver_id.unwrap_or_else(env::predecessor_account_id);
        Promise::new(format!("{token_id}.{}", env::current_account_id()).parse().unwrap())
            .create_account()
            .transfer(NearToken::from_millinear(100))
            .use_global_contract(self.vault_code_hash)
            .function_call("new_vault", vec![], NearToken::from_yoctonear(0), Gas::from_tgas(5))
            .then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(5)).on_created(token_id, owner, extra))
    }

    #[private]
    pub fn on_created(&mut self, token_id: String, owner: AccountId, extra: String) -> String {
        self.owners.insert(token_id.clone(), (owner, extra));
        token_id
    }

    pub fn owner_of(&self, token_id: String) -> Option<(AccountId, String)> {
        self.owners.get(&token_id).cloned()
    }

    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let _ = (sender_id, amount, msg);
        PromiseOrValue::Value(U128(0))
    }
}

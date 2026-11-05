//! NEP-171 collection where every token owns a vault sub-account `<token_id>.<collection>`.
use std::collections::HashMap;

use near_contract_standards::non_fungible_token::core::{
    NonFungibleTokenCore, NonFungibleTokenResolver,
};
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata,
};
use near_contract_standards::non_fungible_token::{
    NonFungibleToken, NonFungibleTokenApproval, NonFungibleTokenEnumeration, Token, TokenId,
};
use near_sdk::collections::{LazyOption, LookupSet};
use near_sdk::json_types::{Base58CryptoHash, U128};
use near_sdk::{
    assert_one_yocto, env, ext_contract, is_promise_success, near, require, AccountId,
    BorshStorageKey, CryptoHash, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
};

/// NEAR kept by the collection to pay for the token's storage; the rest funds the vault.
const MINT_STORAGE: NearToken = NearToken::from_millinear(10);
const MIN_VAULT_BALANCE: NearToken = NearToken::from_millinear(100);
const GAS_VAULT_INIT: Gas = Gas::from_tgas(10);
const GAS_VAULT_OP: Gas = Gas::from_tgas(40);
const GAS_CALLBACK: Gas = Gas::from_tgas(15);

#[allow(dead_code)] // only the generated `ext_vault` is used
#[ext_contract(ext_vault)]
trait Vault {
    fn withdraw(&mut self, ft_id: AccountId, amount: U128, receiver_id: AccountId) -> Promise;
}

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    OwnerById,
    TokenMetadata,
    Enumeration,
    Approval,
    Metadata,
    Locked,
}

#[near(serializers = [json])]
pub struct Payout {
    pub payout: HashMap<AccountId, U128>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Collection {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    vault_code_hash: CryptoHash,
    next_id: u64,
    /// Tokens with a vault op or an `nft_transfer_call` in flight. Locked tokens cannot move or be approved.
    locked: LookupSet<TokenId>,
}

#[near]
impl Collection {
    #[init]
    pub fn new(
        owner_id: AccountId,
        vault_code_hash: Base58CryptoHash,
        metadata: NFTContractMetadata,
    ) -> Self {
        metadata.assert_valid();
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::OwnerById,
                owner_id,
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            vault_code_hash: vault_code_hash.into(),
            next_id: 0,
            locked: LookupSet::new(StorageKey::Locked),
        }
    }

    /// Create the vault first, mint only once it exists.
    #[payable]
    pub fn mint(&mut self, token_metadata: TokenMetadata) -> Promise {
        let deposit = env::attached_deposit();
        require!(
            deposit >= MINT_STORAGE.saturating_add(MIN_VAULT_BALANCE),
            "attach at least 0.11 NEAR"
        );
        let token_id = self.next_id.to_string();
        self.next_id += 1;

        Promise::new(self.vault_id(&token_id))
            .create_account()
            .transfer(deposit.saturating_sub(MINT_STORAGE))
            .use_global_contract(self.vault_code_hash)
            .function_call(
                "new",
                near_sdk::serde_json::json!({ "collection_id": env::current_account_id() })
                    .to_string(),
                NearToken::from_yoctonear(0),
                GAS_VAULT_INIT,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_vault_created(
                        token_id,
                        env::predecessor_account_id(),
                        token_metadata,
                        deposit,
                    ),
            )
    }

    #[private]
    pub fn on_vault_created(
        &mut self,
        token_id: TokenId,
        owner_id: AccountId,
        token_metadata: TokenMetadata,
        deposit: NearToken,
    ) -> bool {
        if !is_promise_success() {
            // The batch is atomic: no account was created and its NEAR comes back to us. Refund the minter.
            Promise::new(owner_id).transfer(deposit).detach();
            return false;
        }
        let token =
            self.tokens
                .internal_mint_with_refund(token_id, owner_id, Some(token_metadata), None);
        NftMint {
            owner_id: &token.owner_id,
            token_ids: &[&token.token_id],
            memo: None,
        }
        .emit();
        true
    }

    /// Owner withdraws a basket token from the vault to themselves.
    #[payable]
    pub fn withdraw(&mut self, token_id: TokenId, ft_id: AccountId, amount: U128) -> Promise {
        assert_one_yocto();
        let owner_id = self.owner_of(&token_id);
        require!(
            env::predecessor_account_id() == owner_id,
            "only the NFT owner"
        );
        require!(
            !self.is_listed(&token_id),
            "revoke marketplace approvals before withdrawing"
        );
        self.lock(&token_id);

        ext_vault::ext(self.vault_id(&token_id))
            .with_static_gas(GAS_VAULT_OP)
            .withdraw(ft_id, amount, owner_id)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_CALLBACK)
                    .on_vault_op(token_id),
            )
    }

    /// Must never panic: a panic here would leave the token locked forever.
    #[private]
    pub fn on_vault_op(&mut self, token_id: TokenId) -> bool {
        self.locked.remove(&token_id);
        is_promise_success()
    }

    /// NEP-199. Marketplaces call this to settle a sale.
    #[payable]
    pub fn nft_transfer_payout(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> Payout {
        let _ = max_len_payout;
        self.assert_unlocked(&token_id);
        let owner_id = self.owner_of(&token_id);
        self.tokens
            .nft_transfer(receiver_id, token_id, approval_id, memo);
        Payout {
            payout: HashMap::from([(owner_id, balance)]),
        }
    }

    pub fn nft_payout(
        &self,
        token_id: TokenId,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> Payout {
        let _ = max_len_payout;
        Payout {
            payout: HashMap::from([(self.owner_of(&token_id), balance)]),
        }
    }

    pub fn vault_of(&self, token_id: TokenId) -> AccountId {
        self.vault_id(&token_id)
    }

    pub fn is_locked(&self, token_id: TokenId) -> bool {
        self.locked.contains(&token_id)
    }
}

impl Collection {
    fn vault_id(&self, token_id: &TokenId) -> AccountId {
        format!("{token_id}.{}", env::current_account_id())
            .parse()
            .unwrap()
    }

    fn owner_of(&self, token_id: &TokenId) -> AccountId {
        self.tokens
            .owner_by_id
            .get(token_id)
            .unwrap_or_else(|| env::panic_str("token not found"))
    }

    fn is_listed(&self, token_id: &TokenId) -> bool {
        self.tokens
            .approvals_by_id
            .as_ref()
            .and_then(|by_id| by_id.get(token_id))
            .is_some_and(|approvals| !approvals.is_empty())
    }

    fn lock(&mut self, token_id: &TokenId) {
        require!(
            self.locked.insert(token_id),
            "token busy: another operation is in flight"
        );
    }

    fn assert_unlocked(&self, token_id: &TokenId) {
        require!(
            !self.locked.contains(token_id),
            "token busy: another operation is in flight"
        );
    }
}

#[near]
impl NonFungibleTokenCore for Collection {
    #[payable]
    fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.assert_unlocked(&token_id);
        self.tokens
            .nft_transfer(receiver_id, token_id, approval_id, memo);
    }

    /// Locked until `nft_resolve_transfer`, so the temporary receiver cannot drain the vault and hand the NFT back.
    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        self.lock(&token_id);
        self.tokens
            .nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for Collection {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        self.locked.remove(&token_id);
        self.tokens.nft_resolve_transfer(
            previous_owner_id,
            receiver_id,
            token_id,
            approved_account_ids,
        )
    }
}

#[near]
impl NonFungibleTokenApproval for Collection {
    #[payable]
    fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        self.assert_unlocked(&token_id);
        self.tokens.nft_approve(token_id, account_id, msg)
    }

    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.tokens.nft_revoke(token_id, account_id);
    }

    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.tokens.nft_revoke_all(token_id);
    }

    fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        self.tokens
            .nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for Collection {
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token> {
        self.tokens
            .nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for Collection {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_contract_standards::non_fungible_token::metadata::NFT_METADATA_SPEC;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(predecessor: AccountId, deposit: u128) {
        testing_env!(VMContextBuilder::new()
            .current_account_id("torch.testnet".parse().unwrap())
            .predecessor_account_id(predecessor)
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .build());
    }

    /// Collection with token "0" owned by alice (mint callback simulated).
    fn setup() -> Collection {
        ctx(accounts(0), 0);
        let mut c = Collection::new(
            accounts(0),
            [0u8; 32].into(),
            NFTContractMetadata {
                spec: NFT_METADATA_SPEC.into(),
                name: "Torch".into(),
                symbol: "TORCH".into(),
                icon: None,
                base_uri: None,
                reference: None,
                reference_hash: None,
            },
        );
        c.tokens.internal_mint_with_refund(
            "0".into(),
            accounts(1),
            Some(TokenMetadata::default()),
            None,
        );
        c
    }

    #[test]
    fn vault_id_is_sub_account() {
        let c = setup();
        assert_eq!(c.vault_of("0".into()).as_str(), "0.torch.testnet");
    }

    #[test]
    #[should_panic(expected = "token busy")]
    fn transfer_rejected_while_withdraw_in_flight() {
        let mut c = setup();
        ctx(accounts(1), 1);
        let _ = c.withdraw("0".into(), "usdc.testnet".parse().unwrap(), U128(5));
        c.nft_transfer(accounts(2), "0".into(), None, None);
    }

    #[test]
    #[should_panic(expected = "token busy")]
    fn payout_sale_rejected_while_withdraw_in_flight() {
        let mut c = setup();
        ctx(accounts(1), 1);
        let _ = c.withdraw("0".into(), "usdc.testnet".parse().unwrap(), U128(5));
        c.nft_transfer_payout(accounts(2), "0".into(), None, None, U128(100), None);
    }

    #[test]
    fn unlock_after_callback_then_transfer_works() {
        let mut c = setup();
        ctx(accounts(1), 1);
        let _ = c.withdraw("0".into(), "usdc.testnet".parse().unwrap(), U128(5));
        testing_env!(
            VMContextBuilder::new()
                .current_account_id("torch.testnet".parse().unwrap())
                .predecessor_account_id("torch.testnet".parse().unwrap())
                .build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            Default::default(),
            vec![near_sdk::PromiseResult::Successful(vec![])],
        );
        assert!(c.on_vault_op("0".into()));
        ctx(accounts(1), 1);
        c.nft_transfer(accounts(2), "0".into(), None, None);
        assert_eq!(c.nft_token("0".into()).unwrap().owner_id, accounts(2));
    }

    #[test]
    #[should_panic(expected = "revoke marketplace approvals")]
    fn withdraw_blocked_while_listed() {
        let mut c = setup();
        ctx(accounts(1), 10u128.pow(22));
        let _ = c.nft_approve("0".into(), accounts(3), None);
        ctx(accounts(1), 1);
        let _ = c.withdraw("0".into(), "usdc.testnet".parse().unwrap(), U128(5));
    }

    #[test]
    #[should_panic(expected = "only the NFT owner")]
    fn previous_owner_cannot_withdraw_after_sale() {
        let mut c = setup();
        ctx(accounts(1), 1);
        c.nft_transfer(accounts(2), "0".into(), None, None);
        let _ = c.withdraw("0".into(), "usdc.testnet".parse().unwrap(), U128(5));
    }

    #[test]
    #[should_panic(expected = "token busy")]
    fn transfer_call_locks_until_resolved() {
        let mut c = setup();
        ctx(accounts(1), 1);
        let _ = c.nft_transfer_call(accounts(2), "0".into(), None, None, "".into());
        ctx(accounts(2), 1);
        let _ = c.withdraw("0".into(), "usdc.testnet".parse().unwrap(), U128(5));
    }
}

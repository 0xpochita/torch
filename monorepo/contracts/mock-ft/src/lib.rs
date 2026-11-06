//! Mock NEP-141 token for testnet baskets, with a rate-limited public faucet.
use near_contract_standards::fungible_token::events::FtMint;
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::collections::{LazyOption, LookupMap};
use near_sdk::json_types::U128;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue,
};

const FAUCET_COOLDOWN_MS: u64 = 3_600_000;

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Token,
    Metadata,
    LastFaucet,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockFt {
    owner_id: AccountId,
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    // ponytail: the contract pays ~100 bytes per faucet user; fine on testnet.
    last_faucet: LookupMap<AccountId, u64>,
}

#[near]
impl MockFt {
    #[init]
    pub fn new(owner_id: AccountId, metadata: FungibleTokenMetadata) -> Self {
        metadata.assert_valid();
        require!(metadata.decimals >= 1, "decimals must be >= 1");
        Self {
            owner_id,
            token: FungibleToken::new(StorageKey::Token),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            last_faucet: LookupMap::new(StorageKey::LastFaucet),
        }
    }

    /// Registers the caller if needed (attach the storage minimum, the rest is refunded),
    /// then mints 0.1 token. Once per account per hour.
    #[payable]
    pub fn faucet(&mut self) -> U128 {
        let account_id = env::predecessor_account_id();
        require!(self.faucet_next_at(account_id.clone()) == 0, "faucet: wait");
        // Registers with the minimum and refunds the rest, or refunds everything if registered.
        self.token.storage_deposit(None, Some(true));
        self.last_faucet
            .insert(&account_id, &env::block_timestamp_ms());
        let amount = 10u128.pow(self.metadata.get().unwrap().decimals as u32 - 1);
        self.mint_to(&account_id, amount);
        U128(amount)
    }

    /// Owner only: fund treasuries (the gacha).
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "only the owner"
        );
        self.mint_to(&account_id, amount.0);
    }

    /// Milliseconds timestamp when `account_id` may use the faucet again; 0 if now.
    pub fn faucet_next_at(&self, account_id: AccountId) -> u64 {
        match self.last_faucet.get(&account_id) {
            Some(last) if last + FAUCET_COOLDOWN_MS > env::block_timestamp_ms() => {
                last + FAUCET_COOLDOWN_MS
            }
            _ => 0,
        }
    }
}

impl MockFt {
    fn mint_to(&mut self, account_id: &AccountId, amount: u128) {
        self.token.internal_deposit(account_id, amount);
        FtMint {
            owner_id: account_id,
            amount: U128(amount),
            memo: None,
        }
        .emit();
    }
}

#[near]
impl FungibleTokenCore for MockFt {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for MockFt {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, _burned) =
            self.token
                .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for MockFt {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        #[allow(unused_variables)]
        if let Some((account_id, balance)) = self.token.internal_storage_unregister(force) {
            near_sdk::log!("Closed @{} with {}", account_id, balance);
            true
        } else {
            false
        }
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for MockFt {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_contract_standards::fungible_token::metadata::FT_METADATA_SPEC;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const MIN: NearToken = NearToken::from_micronear(1250);

    fn ctx(predecessor: AccountId, deposit: NearToken, now_ms: u64) {
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(predecessor)
            .attached_deposit(deposit)
            .block_timestamp(now_ms * 1_000_000)
            .build());
    }

    fn setup(decimals: u8) -> MockFt {
        ctx(accounts(0), NearToken::from_near(0), 0);
        MockFt::new(
            accounts(0),
            FungibleTokenMetadata {
                spec: FT_METADATA_SPEC.into(),
                name: "Test USDC".into(),
                symbol: "tUSDC".into(),
                icon: None,
                reference: None,
                reference_hash: None,
                decimals,
            },
        )
    }

    #[test]
    fn faucet_registers_mints_and_rate_limits() {
        let mut t = setup(6);
        ctx(accounts(1), MIN, 1_000);
        assert_eq!(t.faucet().0, 100_000);
        assert_eq!(t.ft_balance_of(accounts(1)).0, 100_000);
        assert_eq!(t.faucet_next_at(accounts(1)), 1_000 + FAUCET_COOLDOWN_MS);

        ctx(
            accounts(1),
            NearToken::from_near(0),
            1_000 + FAUCET_COOLDOWN_MS,
        );
        assert_eq!(t.faucet_next_at(accounts(1)), 0);
        t.faucet();
        assert_eq!(t.ft_balance_of(accounts(1)).0, 200_000);
    }

    #[test]
    #[should_panic(expected = "faucet: wait")]
    fn faucet_twice_in_an_hour_fails() {
        let mut t = setup(18);
        ctx(accounts(1), MIN, 0);
        t.faucet();
        ctx(accounts(1), NearToken::from_near(0), FAUCET_COOLDOWN_MS - 1);
        t.faucet();
    }

    #[test]
    #[should_panic(expected = "only the owner")]
    fn mint_is_owner_only() {
        let mut t = setup(18);
        ctx(accounts(1), NearToken::from_near(0), 0);
        t.mint(accounts(1), U128(1));
    }
}

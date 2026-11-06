//! Minimal collection for market tests: NEP-171 + NEP-178 from near-contract-standards, a
//! NEP-199 `nft_transfer_payout` with a 2.5% creator royalty, and a `lock` flag that makes
//! sales fail the way the real collection does while a vault withdraw is in flight.
use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::core::NonFungibleTokenCore;
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::collections::{LookupMap, LookupSet};
use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, PanicOnDefault, Promise};
use std::collections::HashMap;

#[near(serializers = [json])]
pub struct Payout {
    pub payout: HashMap<AccountId, U128>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockNft {
    tokens: NonFungibleToken,
    creators: LookupMap<TokenId, AccountId>,
    locked: LookupSet<TokenId>,
}

#[near]
impl MockNft {
    #[init]
    pub fn new() -> Self {
        Self {
            tokens: NonFungibleToken::new(
                b"t".to_vec(),
                env::current_account_id(),
                None::<Vec<u8>>,
                None::<Vec<u8>>,
                Some(b"a".to_vec()),
            ),
            creators: LookupMap::new(b"c".to_vec()),
            locked: LookupSet::new(b"k".to_vec()),
        }
    }

    pub fn mint(&mut self, token_id: TokenId, owner_id: AccountId, creator_id: AccountId) {
        self.creators.insert(&token_id, &creator_id);
        self.tokens.internal_mint_with_refund(token_id, owner_id, None, None);
    }

    /// Simulates a vault withdraw in flight.
    pub fn lock(&mut self, token_id: TokenId) {
        self.locked.insert(&token_id);
    }

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
        require!(!self.locked.contains(&token_id), "token busy");
        let owner_id = self.tokens.owner_by_id.get(&token_id).expect("no token");
        self.tokens.nft_transfer(receiver_id, token_id.clone(), approval_id, memo);
        let creator = self.creators.get(&token_id).unwrap();
        let royalty = balance.0 * 250 / 10_000;
        let mut payout = HashMap::new();
        *payout.entry(owner_id).or_insert(0) += balance.0 - royalty;
        *payout.entry(creator).or_insert(0) += royalty;
        Payout {
            payout: payout.into_iter().map(|(k, v)| (k, U128(v))).collect(),
        }
    }

    #[payable]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        self.tokens.nft_transfer(receiver_id, token_id, approval_id, memo)
    }

    pub fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }

    #[payable]
    pub fn nft_approve(
        &mut self,
        token_id: TokenId,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Option<Promise> {
        self.tokens.nft_approve(token_id, account_id, msg)
    }

    #[payable]
    pub fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.tokens.nft_revoke(token_id, account_id)
    }
}

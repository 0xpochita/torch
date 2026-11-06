//! Torch marketplace: NEAR-priced listings and escrowed offers for the vault collection.
//!
//! Listings and offer acceptance arrive through NEP-178 `nft_on_approve`; sales settle with
//! NEP-199 `nft_transfer_payout`. The market keeps 2% of the price for the fee receiver and
//! passes the remaining 98% as the payout `balance`, so royalties are split by the collection.
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json, Value};
use near_sdk::store::{IterableMap, IterableSet, LookupMap};
use near_sdk::{
    assert_one_yocto, env, ext_contract, near, require, AccountId, BorshStorageKey, CryptoHash,
    Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue,
};
use std::collections::HashMap;

pub type TokenId = String;

const FEE_BPS: u128 = 200;
const MAX_LEN_PAYOUT: u32 = 10;
const MIN_OFFER: NearToken = NearToken::from_millinear(10);
/// Storage stake every offer pays on top of its amount, returned whenever the offer leaves.
/// Covers the record and both indexes for the largest allowed offer (checked in
/// audit-tests `h2_…`: 1,347 bytes measured).
pub const OFFER_STORAGE_BYTES: u128 = 2_000;
/// Collection token ids are sequential `u64`s.
const MAX_TOKEN_ID_LEN: usize = 20;
/// Enough for a 3-item basket plus wNEAR; each entry costs one `ft_balance_of` at accept time.
const MAX_MIN_BALANCES: usize = 4;
const MAX_OFFER_TTL_MS: u64 = 365 * 24 * 3_600_000;
const GAS_FOR_PAYOUT: Gas = Gas::from_tgas(50);
const GAS_FOR_RESOLVE: Gas = Gas::from_tgas(30);
const GAS_FOR_BALANCE: Gas = Gas::from_tgas(10);
const GAS_FOR_CHECK: Gas = Gas::from_tgas(95);
const GAS_FOR_IS_APPROVED: Gas = Gas::from_tgas(10);
const GAS_FOR_PRUNE: Gas = Gas::from_tgas(10);
/// Big enough for `MAX_LEN_PAYOUT` entries; anything longer is treated as a bad payout.
const MAX_PAYOUT_BYTES: usize = 4096;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Listing {
    pub token_id: TokenId,
    pub seller_id: AccountId,
    pub price: U128,
    pub approval_id: u64,
    pub listed_at: u64,
}

/// The buyer's floor for one basket token in the vault, checked right before the sale settles.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct MinBalance {
    pub ft_id: AccountId,
    pub amount: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Offer {
    pub token_id: TokenId,
    pub buyer_id: AccountId,
    pub amount: U128,
    pub expires_at: u64,
    pub created_at: u64,
    /// Escrowed on top of `amount` for the offer's storage; always returned to the buyer.
    pub storage_deposit: U128,
    pub min_balances: Vec<MinBalance>,
}

#[near(serializers = [json])]
pub struct Payout {
    pub payout: HashMap<AccountId, U128>,
}

#[near(serializers = [json])]
#[serde(rename_all = "snake_case", deny_unknown_fields)]
enum ApproveMsg {
    List { price: U128 },
    AcceptOffer { buyer_id: AccountId, amount: U128 },
}

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Listings,
    Offers,
    OffersByToken,
    OffersByBuyer,
    TokenBuyers { token_hash: CryptoHash },
    BuyerTokens { buyer_hash: CryptoHash },
}

#[ext_contract(ext_nft)]
#[allow(dead_code)]
trait Nft {
    fn nft_transfer_payout(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> Payout;
    fn nft_is_approved(
        &self,
        token_id: TokenId,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool;
}

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait Ft {
    fn ft_balance_of(&self, account_id: AccountId) -> U128;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Market {
    collection_id: AccountId,
    fee_receiver_id: AccountId,
    listings: IterableMap<TokenId, Listing>,
    offers: LookupMap<(TokenId, AccountId), Offer>,
    offers_by_token: LookupMap<TokenId, IterableSet<AccountId>>,
    offers_by_buyer: LookupMap<AccountId, IterableSet<TokenId>>,
}

#[near]
impl Market {
    #[init]
    pub fn new(collection_id: AccountId, fee_receiver_id: AccountId) -> Self {
        Self {
            collection_id,
            fee_receiver_id,
            listings: IterableMap::new(StorageKey::Listings),
            offers: LookupMap::new(StorageKey::Offers),
            offers_by_token: LookupMap::new(StorageKey::OffersByToken),
            offers_by_buyer: LookupMap::new(StorageKey::OffersByBuyer),
        }
    }

    /// NEP-178 receiver. `msg` is `{"list":{"price"}}` or `{"accept_offer":{"buyer_id","amount"}}`.
    pub fn nft_on_approve(
        &mut self,
        token_id: TokenId,
        owner_id: AccountId,
        approval_id: u64,
        msg: String,
    ) -> PromiseOrValue<bool> {
        require!(
            env::predecessor_account_id() == self.collection_id,
            "only the collection can call nft_on_approve"
        );
        let msg: ApproveMsg =
            serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("invalid approve msg"));
        match msg {
            ApproveMsg::List { price } => {
                require!(price.0 > 0, "price must be positive");
                self.listings.insert(
                    token_id.clone(),
                    Listing {
                        token_id: token_id.clone(),
                        seller_id: owner_id.clone(),
                        price,
                        approval_id,
                        listed_at: env::block_timestamp_ms(),
                    },
                );
                emit(
                    "list",
                    json!({ "token_id": token_id, "seller_id": owner_id, "price": price }),
                );
                PromiseOrValue::Value(true)
            }
            ApproveMsg::AcceptOffer { buyer_id, amount } => {
                require!(buyer_id != owner_id, "owner cannot accept own offer");
                let offer = self
                    .remove_offer(&token_id, &buyer_id)
                    .unwrap_or_else(|| env::panic_str("no offer from buyer"));
                // The seller agreed to this amount; a replaced offer must not settle (H-3).
                require!(offer.amount == amount, "offer amount changed");
                require!(
                    env::block_timestamp_ms() < offer.expires_at,
                    "offer expired"
                );
                PromiseOrValue::Promise(self.check_then_accept(owner_id, offer, approval_id))
            }
        }
    }

    /// Buys a listed token. The attached deposit must equal the listing price exactly.
    #[payable]
    pub fn buy(&mut self, token_id: TokenId) -> Promise {
        let buyer_id = env::predecessor_account_id();
        let listing = self
            .listings
            .remove(&token_id)
            .unwrap_or_else(|| env::panic_str("token is not listed"));
        require!(buyer_id != listing.seller_id, "seller cannot buy own listing");
        require!(
            env::attached_deposit().as_yoctonear() == listing.price.0,
            "attached deposit must equal the listing price"
        );
        let (_, balance) = split(listing.price.0);
        transfer_payout(
            &self.collection_id,
            &buyer_id,
            &token_id,
            listing.approval_id,
            balance,
        )
        .then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_FOR_RESOLVE)
                .on_buy(buyer_id, listing),
        )
    }

    /// Seller only, 1 yocto. The collection approval stays: call `nft_revoke` on the collection
    /// too, or `withdraw` keeps failing with "revoke marketplace approvals".
    #[payable]
    pub fn delist(&mut self, token_id: TokenId) {
        assert_one_yocto();
        let listing = self
            .listings
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("token is not listed"));
        require!(
            env::predecessor_account_id() == listing.seller_id,
            "only the seller can delist"
        );
        let seller_id = listing.seller_id.clone();
        self.listings.remove(&token_id);
        emit("delist", json!({ "token_id": token_id, "seller_id": seller_id }));
    }

    /// Anyone: drops a listing whose approval the collection no longer honours (token moved,
    /// approval revoked or replaced).
    pub fn prune_listing(&mut self, token_id: TokenId) -> Promise {
        let listing = self
            .listings
            .get(&token_id)
            .unwrap_or_else(|| env::panic_str("token is not listed"));
        ext_nft::ext(self.collection_id.clone())
            .with_static_gas(GAS_FOR_IS_APPROVED)
            .nft_is_approved(
                token_id.clone(),
                env::current_account_id(),
                Some(listing.approval_id),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_PRUNE)
                    .on_prune_listing(token_id, listing.approval_id),
            )
    }

    /// Escrows `amount` for `token_id` until `expires_at` (ms, at most a year ahead). Attach
    /// `amount + offer_storage_cost()`; anything above is refunded. `min_balances` (at most 4)
    /// are the vault balances the buyer expects: the sale reverts if the vault holds less of any
    /// of them when the seller accepts. A live offer from the same buyer is replaced and refunded.
    #[payable]
    pub fn offer(
        &mut self,
        token_id: TokenId,
        amount: U128,
        expires_at: u64,
        min_balances: Option<Vec<MinBalance>>,
    ) {
        require!(
            !token_id.is_empty()
                && token_id.len() <= MAX_TOKEN_ID_LEN
                && token_id.bytes().all(|b| b.is_ascii_digit()),
            "invalid token id"
        );
        require!(amount.0 >= MIN_OFFER.as_yoctonear(), "offer must be at least 0.01 NEAR");
        let now = env::block_timestamp_ms();
        require!(expires_at > now, "expires_at must be in the future");
        require!(
            expires_at <= now + MAX_OFFER_TTL_MS,
            "expires_at must be within a year"
        );
        let min_balances = min_balances.unwrap_or_default();
        require!(
            min_balances.len() <= MAX_MIN_BALANCES,
            "at most 4 min_balances"
        );
        let storage = storage_per_offer();
        let attached = env::attached_deposit().as_yoctonear();
        let needed = amount
            .0
            .checked_add(storage)
            .unwrap_or_else(|| env::panic_str("amount too large"));
        require!(attached >= needed, "attach amount + offer_storage_cost()");

        let buyer_id = env::predecessor_account_id();
        if let Some(old) = self.remove_offer(&token_id, &buyer_id) {
            self.refund_offer(old);
        }
        if attached > needed {
            Promise::new(buyer_id.clone())
                .transfer(NearToken::from_yoctonear(attached - needed))
                .detach();
        }
        let offer = Offer {
            token_id,
            buyer_id,
            amount,
            expires_at,
            created_at: now,
            storage_deposit: U128(storage),
            min_balances,
        };
        emit(
            "offer",
            json!({
                "token_id": offer.token_id,
                "buyer_id": offer.buyer_id,
                "amount": offer.amount,
                "expires_at": offer.expires_at,
                "created_at": offer.created_at,
                "min_balances": offer.min_balances,
            }),
        );
        self.insert_offer(offer);
    }

    /// Buyer only, 1 yocto. Refunds the amount and the storage deposit.
    #[payable]
    pub fn cancel_offer(&mut self, token_id: TokenId) {
        assert_one_yocto();
        let offer = self
            .remove_offer(&token_id, &env::predecessor_account_id())
            .unwrap_or_else(|| env::panic_str("no offer to cancel"));
        self.refund_offer(offer);
    }

    /// Anyone can return an expired offer to its buyer.
    pub fn refund_expired(&mut self, token_id: TokenId, buyer_id: AccountId) {
        let expires_at = self
            .offers
            .get(&(token_id.clone(), buyer_id.clone()))
            .unwrap_or_else(|| env::panic_str("no such offer"))
            .expires_at;
        require!(
            env::block_timestamp_ms() >= expires_at,
            "offer has not expired"
        );
        let offer = self.remove_offer(&token_id, &buyer_id).unwrap();
        self.refund_offer(offer);
    }

    #[private]
    pub fn on_buy(&mut self, buyer_id: AccountId, listing: Listing) -> bool {
        let price = listing.price.0;
        let Some(payout) = payout_result() else {
            // Token moved, approval revoked or token busy: the listing is stale, refund the buyer.
            Promise::new(buyer_id).transfer(NearToken::from_yoctonear(price)).detach();
            if !self.listings.contains_key(&listing.token_id) {
                emit(
                    "delist",
                    json!({ "token_id": listing.token_id, "seller_id": listing.seller_id }),
                );
            }
            return false;
        };
        let fee = self.settle(&listing.seller_id, price, payout);
        emit(
            "sale",
            json!({
                "token_id": listing.token_id,
                "seller_id": listing.seller_id,
                "buyer_id": buyer_id,
                "price": listing.price,
                "fee": U128(fee),
            }),
        );
        true
    }

    /// Settles only if every `ft_balance_of(vault)` came back at or above the buyer's floor.
    /// Sound because the collection refuses `withdraw` while the market's approval exists, and
    /// a revoke + re-approve changes `approval_id`, which `nft_transfer_payout` then rejects.
    #[private]
    pub fn on_balances_checked(
        &mut self,
        seller_id: AccountId,
        offer: Offer,
        approval_id: u64,
    ) -> PromiseOrValue<bool> {
        let ok = offer.min_balances.iter().enumerate().all(|(i, min)| {
            env::promise_result_checked(i as u64, 64)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<U128>(&bytes).ok())
                .is_some_and(|balance| balance.0 >= min.amount.0)
        });
        if !ok {
            env::log_str("vault holds less than the offer's min_balances");
            self.restore_offer(offer);
            return PromiseOrValue::Value(false);
        }
        PromiseOrValue::Promise(self.accept(seller_id, offer, approval_id))
    }

    #[private]
    pub fn on_accept_offer(&mut self, seller_id: AccountId, offer: Offer) -> bool {
        let Some(payout) = payout_result() else {
            self.restore_offer(offer);
            return false;
        };
        self.settle(&seller_id, offer.amount.0, payout);
        Promise::new(offer.buyer_id.clone())
            .transfer(NearToken::from_yoctonear(offer.storage_deposit.0))
            .detach();
        // The token changed hands, so any listing for it is stale.
        if let Some(listing) = self.listings.remove(&offer.token_id) {
            emit(
                "delist",
                json!({ "token_id": listing.token_id, "seller_id": listing.seller_id }),
            );
        }
        emit(
            "offer_accept",
            json!({
                "token_id": offer.token_id,
                "seller_id": seller_id,
                "buyer_id": offer.buyer_id,
                "amount": offer.amount,
                "created_at": offer.created_at,
            }),
        );
        true
    }

    #[private]
    pub fn on_prune_listing(&mut self, token_id: TokenId, approval_id: u64) -> bool {
        let approved = env::promise_result_checked(0, 16)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<bool>(&bytes).ok());
        // Only an explicit `false` prunes; a failed call proves nothing.
        if approved != Some(false) {
            return false;
        }
        let Some(listing) = self.listings.get(&token_id) else {
            return false;
        };
        if listing.approval_id != approval_id {
            return false; // relisted meanwhile
        }
        let seller_id = listing.seller_id.clone();
        self.listings.remove(&token_id);
        emit("delist", json!({ "token_id": token_id, "seller_id": seller_id }));
        true
    }

    pub fn get_listing(&self, token_id: TokenId) -> Option<Listing> {
        self.listings.get(&token_id).cloned()
    }

    pub fn get_listings(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Listing> {
        self.listings
            .values()
            .skip(from_index.map_or(0, |i| i.0 as usize))
            .take(limit.unwrap_or(50) as usize)
            .cloned()
            .collect()
    }

    pub fn get_offers(
        &self,
        token_id: TokenId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Offer> {
        let Some(buyers) = self.offers_by_token.get(&token_id) else {
            return vec![];
        };
        page(buyers.iter(), from_index, limit)
            .filter_map(|buyer| self.offers.get(&(token_id.clone(), buyer.clone())).cloned())
            .collect()
    }

    pub fn get_offers_by_buyer(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Offer> {
        let Some(tokens) = self.offers_by_buyer.get(&account_id) else {
            return vec![];
        };
        page(tokens.iter(), from_index, limit)
            .filter_map(|token| self.offers.get(&(token.clone(), account_id.clone())).cloned())
            .collect()
    }

    /// yoctoNEAR to attach to `offer` on top of the amount.
    pub fn offer_storage_cost(&self) -> U128 {
        U128(storage_per_offer())
    }
}

impl Market {
    /// Reads the vault's balances first when the buyer pinned any, then settles.
    fn check_then_accept(&self, seller_id: AccountId, offer: Offer, approval_id: u64) -> Promise {
        let vault: AccountId = format!("{}.{}", offer.token_id, self.collection_id)
            .parse()
            .unwrap_or_else(|_| env::panic_str("bad token id"));
        let checks = offer.min_balances.iter().map(|min| {
            ext_ft::ext(min.ft_id.clone())
                .with_static_gas(GAS_FOR_BALANCE)
                .ft_balance_of(vault.clone())
        });
        match checks.reduce(Promise::and) {
            None => self.accept(seller_id, offer, approval_id),
            Some(all) => all.then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CHECK)
                    .on_balances_checked(seller_id, offer, approval_id),
            ),
        }
    }

    fn accept(&self, seller_id: AccountId, offer: Offer, approval_id: u64) -> Promise {
        let (_, balance) = split(offer.amount.0);
        transfer_payout(
            &self.collection_id,
            &offer.buyer_id,
            &offer.token_id,
            approval_id,
            balance,
        )
        .then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_FOR_RESOLVE)
                .on_accept_offer(seller_id, offer),
        )
    }

    /// Puts an in-flight offer back, or refunds it if the buyer placed a new one meanwhile.
    fn restore_offer(&mut self, offer: Offer) {
        if self
            .offers
            .contains_key(&(offer.token_id.clone(), offer.buyer_id.clone()))
        {
            self.refund_offer(offer);
        } else {
            self.insert_offer(offer);
        }
    }

    fn insert_offer(&mut self, offer: Offer) {
        let (token_id, buyer_id) = (offer.token_id.clone(), offer.buyer_id.clone());
        set_add(
            &mut self.offers_by_token,
            &token_id,
            buyer_id.clone(),
            StorageKey::TokenBuyers {
                token_hash: env::sha256_array(token_id.as_bytes()),
            },
        );
        set_add(
            &mut self.offers_by_buyer,
            &buyer_id,
            token_id.clone(),
            StorageKey::BuyerTokens {
                buyer_hash: env::sha256_array(buyer_id.as_bytes()),
            },
        );
        self.offers.insert((token_id, buyer_id), offer);
    }

    fn remove_offer(&mut self, token_id: &TokenId, buyer_id: &AccountId) -> Option<Offer> {
        let offer = self.offers.remove(&(token_id.clone(), buyer_id.clone()))?;
        set_remove(&mut self.offers_by_token, token_id, buyer_id);
        set_remove(&mut self.offers_by_buyer, buyer_id, token_id);
        Some(offer)
    }

    fn refund_offer(&self, offer: Offer) {
        Promise::new(offer.buyer_id.clone())
            .transfer(NearToken::from_yoctonear(
                offer.amount.0 + offer.storage_deposit.0,
            ))
            .detach();
        emit(
            "offer_cancel",
            json!({
                "token_id": offer.token_id,
                "buyer_id": offer.buyer_id,
                "amount": offer.amount,
                "created_at": offer.created_at,
            }),
        );
    }

    /// Pays the fee and the payout for a sale at `price`. A malformed payout (too many
    /// entries, or more than the balance) sends the whole balance to the seller. Returns the fee.
    fn settle(&self, seller_id: &AccountId, price: u128, payout: Option<Payout>) -> u128 {
        let (fee, balance) = split(price);
        let mut rest = balance;
        let valid = payout.filter(|p| {
            p.payout.len() <= MAX_LEN_PAYOUT as usize
                && p
                    .payout
                    .values()
                    .try_fold(0u128, |sum, v| sum.checked_add(v.0))
                    .is_some_and(|sum| sum <= balance)
        });
        for (account_id, amount) in valid.map(|p| p.payout).unwrap_or_default() {
            if amount.0 > 0 {
                rest -= amount.0;
                Promise::new(account_id)
                    .transfer(NearToken::from_yoctonear(amount.0))
                    .detach();
            }
        }
        for (account_id, amount) in [(seller_id, rest), (&self.fee_receiver_id, fee)] {
            if amount > 0 {
                Promise::new(account_id.clone())
                    .transfer(NearToken::from_yoctonear(amount))
                    .detach();
            }
        }
        fee
    }
}

fn storage_per_offer() -> u128 {
    env::storage_byte_cost().as_yoctonear() * OFFER_STORAGE_BYTES
}

fn set_add<K, V>(
    map: &mut LookupMap<K, IterableSet<V>>,
    key: &K,
    value: V,
    prefix: StorageKey,
) where
    K: near_sdk::borsh::BorshSerialize + near_sdk::borsh::BorshDeserialize + Ord + Clone,
    V: near_sdk::borsh::BorshSerialize + near_sdk::borsh::BorshDeserialize + Ord + Clone,
{
    if !map.contains_key(key) {
        map.insert(key.clone(), IterableSet::new(prefix));
    }
    map.get_mut(key).unwrap().insert(value);
}

fn set_remove<K, V>(map: &mut LookupMap<K, IterableSet<V>>, key: &K, value: &V)
where
    K: near_sdk::borsh::BorshSerialize + near_sdk::borsh::BorshDeserialize + Ord + Clone,
    V: near_sdk::borsh::BorshSerialize + near_sdk::borsh::BorshDeserialize + Ord + Clone,
{
    let Some(set) = map.get_mut(key) else {
        return;
    };
    set.remove(value);
    if set.is_empty() {
        map.remove(key);
    }
}

fn page<'a, T: 'a>(
    iter: impl Iterator<Item = &'a T>,
    from_index: Option<U128>,
    limit: Option<u64>,
) -> impl Iterator<Item = &'a T> {
    iter.skip(from_index.map_or(0, |i| i.0 as usize))
        .take(limit.unwrap_or(50) as usize)
}

/// `(fee, balance)` for a sale at `price`.
fn split(price: u128) -> (u128, u128) {
    let fee = price * FEE_BPS / 10_000;
    (fee, price - fee)
}

fn transfer_payout(
    collection_id: &AccountId,
    receiver_id: &AccountId,
    token_id: &TokenId,
    approval_id: u64,
    balance: u128,
) -> Promise {
    ext_nft::ext(collection_id.clone())
        .with_static_gas(GAS_FOR_PAYOUT)
        .with_attached_deposit(NearToken::from_yoctonear(1))
        .nft_transfer_payout(
            receiver_id.clone(),
            token_id.clone(),
            Some(approval_id),
            None,
            U128(balance),
            Some(MAX_LEN_PAYOUT),
        )
}

/// `None` when `nft_transfer_payout` failed (the token did not move). `Some(None)` means it
/// moved but returned an unusable payout.
fn payout_result() -> Option<Option<Payout>> {
    match env::promise_result_checked(0, MAX_PAYOUT_BYTES) {
        Ok(bytes) => Some(serde_json::from_slice(&bytes).ok()),
        Err(near_sdk::PromiseError::TooLong(_)) => Some(None),
        Err(_) => None,
    }
}

fn emit(event: &str, data: Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": "torch", "version": "1.0.0", "event": event, "data": [data] })
    ));
}

#[cfg(test)]
mod tests;

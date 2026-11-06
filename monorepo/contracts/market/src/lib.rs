//! Torch marketplace: NEAR-priced listings and escrowed offers for the vault collection.
//!
//! Listings and offer acceptance arrive through NEP-178 `nft_on_approve`; sales settle with
//! NEP-199 `nft_transfer_payout`. The market keeps 2% of the price for the fee receiver and
//! passes the remaining 98% as the payout `balance`, so royalties are split by the collection.
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json, Value};
use near_sdk::store::IterableMap;
use near_sdk::{
    env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};
use std::collections::HashMap;

pub type TokenId = String;

const FEE_BPS: u128 = 200;
const MAX_LEN_PAYOUT: u32 = 10;
/// Escrowed offers pay for their own storage many times over, which keeps spam unattractive.
const MIN_OFFER: NearToken = NearToken::from_millinear(10);
const GAS_FOR_PAYOUT: Gas = Gas::from_tgas(50);
const GAS_FOR_RESOLVE: Gas = Gas::from_tgas(30);
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

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Offer {
    pub token_id: TokenId,
    pub buyer_id: AccountId,
    pub amount: U128,
    pub expires_at: u64,
    pub created_at: u64,
}

#[near(serializers = [json])]
pub struct Payout {
    pub payout: HashMap<AccountId, U128>,
}

#[near(serializers = [json])]
#[serde(rename_all = "snake_case")]
enum ApproveMsg {
    List { price: U128 },
    AcceptOffer { buyer_id: AccountId },
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
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Market {
    collection_id: AccountId,
    fee_receiver_id: AccountId,
    listings: IterableMap<TokenId, Listing>,
    offers: IterableMap<(TokenId, AccountId), Offer>,
}

#[near]
impl Market {
    #[init]
    pub fn new(collection_id: AccountId, fee_receiver_id: AccountId) -> Self {
        Self {
            collection_id,
            fee_receiver_id,
            listings: IterableMap::new(b"l"),
            offers: IterableMap::new(b"o"),
        }
    }

    /// NEP-178 receiver. `msg` is `{"list":{"price"}}` or `{"accept_offer":{"buyer_id"}}`.
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
            ApproveMsg::AcceptOffer { buyer_id } => {
                require!(buyer_id != owner_id, "owner cannot accept own offer");
                let key = (token_id.clone(), buyer_id.clone());
                let offer = self
                    .offers
                    .remove(&key)
                    .unwrap_or_else(|| env::panic_str("no offer from buyer"));
                require!(
                    env::block_timestamp_ms() < offer.expires_at,
                    "offer expired"
                );
                let (_, balance) = split(offer.amount.0);
                PromiseOrValue::Promise(
                    transfer_payout(&self.collection_id, &buyer_id, &token_id, approval_id, balance)
                        .then(
                            Self::ext(env::current_account_id())
                                .with_static_gas(GAS_FOR_RESOLVE)
                                .on_accept_offer(owner_id, offer),
                        ),
                )
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

    pub fn delist(&mut self, token_id: TokenId) {
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

    /// Escrows the attached NEAR as an offer. A live offer from the same buyer is replaced
    /// and refunded.
    #[payable]
    pub fn offer(&mut self, token_id: TokenId, expires_at: u64) {
        let buyer_id = env::predecessor_account_id();
        let amount = env::attached_deposit();
        require!(amount >= MIN_OFFER, "offer must be at least 0.01 NEAR");
        let now = env::block_timestamp_ms();
        require!(expires_at > now, "expires_at must be in the future");
        let old = self.offers.insert(
            (token_id.clone(), buyer_id.clone()),
            Offer {
                token_id: token_id.clone(),
                buyer_id: buyer_id.clone(),
                amount: U128(amount.as_yoctonear()),
                expires_at,
                created_at: now,
            },
        );
        if let Some(old) = old {
            self.refund_offer(old);
        }
        emit(
            "offer",
            json!({
                "token_id": token_id,
                "buyer_id": buyer_id,
                "amount": U128(amount.as_yoctonear()),
                "expires_at": expires_at,
            }),
        );
    }

    pub fn cancel_offer(&mut self, token_id: TokenId) {
        let offer = self
            .offers
            .remove(&(token_id, env::predecessor_account_id()))
            .unwrap_or_else(|| env::panic_str("no offer to cancel"));
        self.refund_offer(offer);
    }

    /// Anyone can return an expired offer to its buyer.
    pub fn refund_expired(&mut self, token_id: TokenId, buyer_id: AccountId) {
        let key = (token_id, buyer_id);
        let expires_at = self
            .offers
            .get(&key)
            .unwrap_or_else(|| env::panic_str("no such offer"))
            .expires_at;
        require!(
            env::block_timestamp_ms() >= expires_at,
            "offer has not expired"
        );
        let offer = self.offers.remove(&key).unwrap();
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

    #[private]
    pub fn on_accept_offer(&mut self, seller_id: AccountId, offer: Offer) -> bool {
        let Some(payout) = payout_result() else {
            // Keep the offer alive unless the buyer placed a new one meanwhile.
            let key = (offer.token_id.clone(), offer.buyer_id.clone());
            if self.offers.contains_key(&key) {
                self.refund_offer(offer);
            } else {
                self.offers.insert(key, offer);
            }
            return false;
        };
        self.settle(&seller_id, offer.amount.0, payout);
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
            }),
        );
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

    // ponytail: offer views scan every offer; add per-token / per-buyer indexes if offers grow
    // past a few thousand.
    pub fn get_offers(&self, token_id: TokenId) -> Vec<Offer> {
        self.offers
            .values()
            .filter(|o| o.token_id == token_id)
            .cloned()
            .collect()
    }

    pub fn get_offers_by_buyer(&self, account_id: AccountId) -> Vec<Offer> {
        self.offers
            .values()
            .filter(|o| o.buyer_id == account_id)
            .cloned()
            .collect()
    }
}

impl Market {
    fn refund_offer(&self, offer: Offer) {
        Promise::new(offer.buyer_id.clone())
            .transfer(NearToken::from_yoctonear(offer.amount.0))
            .detach();
        emit(
            "offer_cancel",
            json!({ "token_id": offer.token_id, "buyer_id": offer.buyer_id, "amount": offer.amount }),
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

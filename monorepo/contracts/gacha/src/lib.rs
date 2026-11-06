//! Gacha: each pull rolls a rarity, mints a fresh vault NFT to the player through the
//! collection, then funds the vault with a basket from the gacha's token treasury.
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError,
};

/// What the collection requires per mint; paid from the gacha's own NEAR balance.
pub const MINT_DEPOSIT: NearToken = NearToken::from_millinear(110);
/// NEP-145 minimum for a standard NEP-141 account registration.
const FT_STORAGE_DEPOSIT: NearToken = NearToken::from_micronear(1250);
/// Never spend below this on top of the contract's own storage stake.
const NEAR_RESERVE: NearToken = NearToken::from_millinear(100);
// Static gas per pull. Each callback's static covers its own burn, the execution fees of the
// receipts it creates and their static gas, so a player attaching the bare minimum cannot starve
// any step. A 10-pull reserves 10 x (30 + 12 + 5 + 3 x 15) = 920 Tgas and needs ~950 Tgas
// attached in total; testnet allows 1 PGas per transaction.
/// `mint` burns ~3.2, prepays ~9.3 of execution fees (7.2 for create_account) and reserves
/// 5 + 10 for the vault batch and its callback.
const GAS_MINT: Gas = Gas::from_tgas(30);
/// Burns ~3.8 and prepays ~6 of execution fees for the funding batches and `on_funded`.
const GAS_ON_MINTED: Gas = Gas::from_tgas(12);
/// Burns ~1.6.
const GAS_ON_FUNDED: Gas = Gas::from_tgas(5);
/// Per basket item: storage_deposit + ft_transfer_call (3.8), which reserves 5 for
/// ft_resolve_transfer (1.3) and passes the rest to the vault's ft_on_transfer (1.3).
const GAS_STORAGE_DEPOSIT: Gas = Gas::from_tgas(3);
const GAS_FT_TRANSFER_CALL: Gas = Gas::from_tgas(12);
const GAS_FT_BALANCE_OF: Gas = Gas::from_tgas(5);
const GAS_ON_RESYNC: Gas = Gas::from_tgas(5);
const LEGENDARY: &str = "Legendary";

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Item {
    pub token: AccountId,
    pub amount: U128,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Basket {
    pub name: String,
    pub category: String,
    pub bg: String,
    pub items: Vec<Item>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Tier {
    pub rarity: String,
    pub weight_bps: u32,
    pub baskets: Vec<Basket>,
}

#[near(serializers = [json])]
pub struct Config {
    pub owner_id: AccountId,
    pub collection_id: AccountId,
    pub price_per_pull: U128,
    pub pity: u32,
    pub tiers: Vec<Tier>,
}

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Pity,
    Treasury,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Gacha {
    owner_id: AccountId,
    collection_id: AccountId,
    price_per_pull: NearToken,
    pity: u32,
    tiers: Vec<Tier>,
    /// Pulls since the account's last Legendary.
    pity_of: LookupMap<AccountId, u32>,
    treasury: IterableMap<AccountId, u128>,
}

#[near]
impl Gacha {
    #[init]
    pub fn new(
        owner_id: AccountId,
        collection_id: AccountId,
        price_per_pull: U128,
        pity: u32,
        tiers: Vec<Tier>,
    ) -> Self {
        require!(pity > 0, "pity must be > 0");
        require!(
            tiers.iter().map(|t| t.weight_bps).sum::<u32>() == 10_000,
            "tier weights must sum to 10000"
        );
        require!(
            tiers.iter().all(|t| !t.baskets.is_empty()),
            "every tier needs a basket"
        );
        require!(
            tiers.iter().any(|t| t.rarity == LEGENDARY),
            "a Legendary tier is required for pity"
        );
        Self {
            owner_id,
            collection_id,
            price_per_pull: NearToken::from_yoctonear(price_per_pull.0),
            pity,
            tiers,
            pity_of: LookupMap::new(StorageKey::Pity),
            treasury: IterableMap::new(StorageKey::Treasury),
        }
    }

    /// 1 or 10 pulls. A result the treasury or NEAR balance cannot cover is refunded and does not count for pity.
    #[payable]
    pub fn pull(&mut self, count: u8) {
        require!(count == 1 || count == 10, "count must be 1 or 10");
        let total = if count == 10 {
            self.price_per_pull.saturating_mul(9)
        } else {
            self.price_per_pull
        };
        require!(
            env::attached_deposit() == total,
            "attach exactly the pull price"
        );
        let price = total.saturating_div(count as u128);

        let player = env::predecessor_account_id();
        let seed = env::random_seed_array();
        let mut pity = self.pity_of.get(&player).copied().unwrap_or(0);
        let mut available = self.spendable_near();
        let mut refund = NearToken::from_yoctonear(0);

        for i in 0..count {
            let rand = env::sha256_array([&seed[..], &[i]].concat());
            let (tier, basket) = self.roll(&rand, pity + 1 >= self.pity);
            let rarity = self.tiers[tier].rarity.clone();
            let basket = self.tiers[tier].baskets[basket].clone();

            let cost = MINT_DEPOSIT.saturating_add(
                FT_STORAGE_DEPOSIT
                    .saturating_add(NearToken::from_yoctonear(1))
                    .saturating_mul(basket.items.len() as u128),
            );
            if cost > available || !self.take_from_treasury(&basket.items) {
                refund = refund.saturating_add(price);
                continue;
            }
            available = available.saturating_sub(cost);
            pity = if rarity == LEGENDARY { 0 } else { pity + 1 };

            let metadata = self.token_metadata(&rarity, &basket);
            let callback_gas = GAS_ON_MINTED.saturating_add(GAS_ON_FUNDED).saturating_add(
                GAS_STORAGE_DEPOSIT
                    .saturating_add(GAS_FT_TRANSFER_CALL)
                    .saturating_mul(basket.items.len() as u64),
            );
            Promise::new(self.collection_id.clone())
                .function_call(
                    "mint",
                    json!({ "metadata": metadata, "receiver_id": player })
                        .to_string()
                        .into_bytes(),
                    MINT_DEPOSIT,
                    GAS_MINT,
                )
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(callback_gas)
                        .on_minted(
                            player.clone(),
                            rarity,
                            basket.items,
                            price.as_yoctonear().into(),
                            pity,
                        ),
                )
                .detach();
        }

        self.pity_of.insert(player.clone(), pity);
        if !refund.is_zero() {
            Promise::new(player).transfer(refund).detach();
        }
    }

    /// Funds the new vault from the treasury, or puts the basket back and refunds the pull.
    // ponytail: a failed mint does not roll back pity.
    #[private]
    pub fn on_minted(
        &mut self,
        player_id: AccountId,
        rarity: String,
        items: Vec<Item>,
        price: U128,
        pity_after: u32,
    ) {
        // `mint` resolves to the token id, or `null` when the vault could not be created.
        let token_id = match env::promise_result_checked(0, 64) {
            Ok(bytes) => serde_json::from_slice::<Option<String>>(&bytes).map_err(|_| ()),
            Err(PromiseError::Failed) => Ok(None),
            Err(_) => Err(()),
        };
        let token_id = match token_id {
            Ok(Some(token_id)) => token_id,
            Ok(None) => {
                for item in &items {
                    self.credit(&item.token, item.amount.0);
                }
                Promise::new(player_id)
                    .transfer(NearToken::from_yoctonear(price.0))
                    .detach();
                return;
            }
            Err(()) => {
                // A token may exist that we cannot fund: keep the price, put the basket back.
                for item in &items {
                    self.credit(&item.token, item.amount.0);
                }
                let result = match env::promise_result_checked(0, 64) {
                    Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
                    Err(_) => "<too long>".into(),
                };
                emit(
                    "gacha_mint_unreadable",
                    json!({ "player_id": player_id, "rarity": rarity, "result": result }),
                );
                return;
            }
        };

        let vault: AccountId = format!("{token_id}.{}", self.collection_id)
            .parse()
            .unwrap_or_else(|_| env::panic_str("bad token id from collection"));
        let funding = items.iter().map(|item| {
            Promise::new(item.token.clone())
                .function_call(
                    "storage_deposit",
                    json!({ "account_id": vault, "registration_only": true })
                        .to_string()
                        .into_bytes(),
                    FT_STORAGE_DEPOSIT,
                    GAS_STORAGE_DEPOSIT,
                )
                .function_call(
                    "ft_transfer_call",
                    json!({ "receiver_id": vault, "amount": item.amount, "msg": "" })
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(1),
                    GAS_FT_TRANSFER_CALL,
                )
        });
        let Some(funding) = funding.reduce(Promise::and) else {
            return emit_pull(&player_id, &token_id, &rarity, pity_after, price);
        };
        funding
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_FUNDED)
                    .on_funded(player_id, token_id, rarity, items, price, pity_after),
            )
            .detach();
    }

    /// Puts back whatever the vault returned, then emits `gacha_pull`.
    #[private]
    pub fn on_funded(
        &mut self,
        player_id: AccountId,
        token_id: String,
        rarity: String,
        items: Vec<Item>,
        price: U128,
        pity_after: u32,
    ) {
        for (i, item) in items.iter().enumerate() {
            // `ft_transfer_call` resolves to the amount the vault kept; the rest came back to us.
            let used = env::promise_result_checked(i as u64, 64)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<U128>(&bytes).ok());
            let Some(used) = used else {
                // Either the batch failed (nothing moved) or the FT's resolver failed after the
                // transfer: we cannot tell, so do not credit. The owner fixes it with `resync_treasury`.
                emit(
                    "gacha_fund_unknown",
                    json!({ "player_id": player_id, "token_id": token_id, "ft_id": item.token, "amount": item.amount }),
                );
                continue;
            };
            let lost = item.amount.0 - used.0.min(item.amount.0);
            if lost > 0 {
                self.credit(&item.token, lost);
                emit(
                    "gacha_fund_failed",
                    json!({ "player_id": player_id, "token_id": token_id, "ft_id": item.token, "amount": U128(lost) }),
                );
            }
        }
        emit_pull(&player_id, &token_id, &rarity, pity_after, price);
    }

    /// NEP-141 receiver. Only the owner may fund the treasury, with msg "fund"; anything else is returned.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        require!(msg == "fund", "msg must be \"fund\"");
        require!(
            sender_id == self.owner_id,
            "only the owner funds the treasury"
        );
        // `sender_id` is only as honest as the calling contract, so accept basket tokens only.
        let token = env::predecessor_account_id();
        require!(self.is_basket_token(&token), "token is not in any basket");
        self.credit(&token, amount.0);
        U128(0)
    }

    /// Owner only: sets `treasury[token]` to the gacha's actual balance on `token`.
    // ponytail: run it while no pull is in flight; a pending funding is still in our balance but
    // already debited, so it would be counted twice.
    pub fn resync_treasury(&mut self, token: AccountId) -> Promise {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "only the owner"
        );
        require!(self.is_basket_token(&token), "token is not in any basket");
        Promise::new(token.clone())
            .function_call(
                "ft_balance_of",
                json!({ "account_id": env::current_account_id() })
                    .to_string()
                    .into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_FT_BALANCE_OF,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_ON_RESYNC)
                    .on_resync(token),
            )
    }

    #[private]
    pub fn on_resync(&mut self, token: AccountId) -> U128 {
        let balance: U128 = env::promise_result_checked(0, 64)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_else(|| env::panic_str("ft_balance_of failed"));
        self.treasury.insert(token, balance.0);
        balance
    }

    pub fn get_pity(&self, account_id: AccountId) -> u32 {
        self.pity_of.get(&account_id).copied().unwrap_or(0)
    }

    pub fn get_config(&self) -> Config {
        Config {
            owner_id: self.owner_id.clone(),
            collection_id: self.collection_id.clone(),
            price_per_pull: self.price_per_pull.as_yoctonear().into(),
            pity: self.pity,
            tiers: self.tiers.clone(),
        }
    }

    pub fn get_treasury(&self) -> Vec<(AccountId, U128)> {
        self.treasury
            .iter()
            .map(|(token, amount)| (token.clone(), U128(*amount)))
            .collect()
    }
}

impl Gacha {
    fn is_basket_token(&self, token: &AccountId) -> bool {
        self.tiers
            .iter()
            .flat_map(|t| &t.baskets)
            .flat_map(|b| &b.items)
            .any(|i| &i.token == token)
    }

    fn credit(&mut self, token: &AccountId, amount: u128) {
        let balance = self.treasury.get(token).copied().unwrap_or(0);
        self.treasury.insert(token.clone(), balance + amount);
    }

    /// (tier index, basket index) from 32 random bytes.
    fn roll(&self, rand: &[u8; 32], force_legendary: bool) -> (usize, usize) {
        let tier = if force_legendary {
            self.tiers
                .iter()
                .position(|t| t.rarity == LEGENDARY)
                .unwrap()
        } else {
            let mut point = (u64::from_le_bytes(rand[..8].try_into().unwrap()) % 10_000) as u32;
            self.tiers
                .iter()
                .position(|t| {
                    let hit = point < t.weight_bps;
                    point = point.saturating_sub(t.weight_bps);
                    hit
                })
                .unwrap()
        };
        let pick = u64::from_le_bytes(rand[8..16].try_into().unwrap());
        (
            tier,
            (pick % self.tiers[tier].baskets.len() as u64) as usize,
        )
    }

    /// Deducts the whole basket, or nothing if any item is short.
    fn take_from_treasury(&mut self, items: &[Item]) -> bool {
        let covered = items.iter().all(|item| {
            let need: u128 = items
                .iter()
                .filter(|other| other.token == item.token)
                .map(|other| other.amount.0)
                .sum();
            self.treasury.get(&item.token).copied().unwrap_or(0) >= need
        });
        if covered {
            for item in items {
                let balance = self.treasury.get(&item.token).copied().unwrap_or(0);
                self.treasury
                    .insert(item.token.clone(), balance - item.amount.0);
            }
        }
        covered
    }

    fn spendable_near(&self) -> NearToken {
        let locked = env::storage_byte_cost().saturating_mul(env::storage_usage() as u128);
        env::account_balance()
            .saturating_sub(locked)
            .saturating_sub(NEAR_RESERVE)
    }

    /// NEP-177 metadata with the `extra` JSON described in INTERFACES.md.
    // ponytail: basket weights are an even split; real USD weights need prices, which live off-chain.
    fn token_metadata(&self, rarity: &str, basket: &Basket) -> serde_json::Value {
        let n = basket.items.len().max(1) as u32;
        let basket_weights: Vec<_> = basket
            .items
            .iter()
            .enumerate()
            .map(|(i, item)| {
                let weight = 100 / n + if i == 0 { 100 % n } else { 0 };
                json!({ "token": item.token, "weight": weight })
            })
            .collect();
        let extra = json!({
            "basket": basket_weights,
            "bg": basket.bg,
            "category": basket.category,
            "creator": env::current_account_id(),
            "rarity": rarity,
        });
        json!({
            "title": format!("{} · {rarity}", basket.name),
            "description": format!("{rarity} gacha vault"),
            "extra": extra.to_string(),
        })
    }
}

fn emit(event: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": "torch", "version": "1.0.0", "event": event, "data": [data] })
    ));
}

fn emit_pull(player_id: &AccountId, token_id: &str, rarity: &str, pity_after: u32, price: U128) {
    emit(
        "gacha_pull",
        json!({
            "player_id": player_id,
            "token_id": token_id,
            "rarity": rarity,
            "pity_after": pity_after,
            "price": price,
        }),
    );
}

#[cfg(test)]
mod tests;

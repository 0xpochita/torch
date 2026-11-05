use near_sdk::{env, log, near};

#[near(contract_state)]
pub struct Contract {
    greeting: String,
}

impl Default for Contract {
    fn default() -> Self {
        Self {
            greeting: "Hello".to_string(),
        }
    }
}

#[near]
impl Contract {
    pub fn get_greeting(&self) -> String {
        self.greeting.clone()
    }

    pub fn set_greeting(&mut self, greeting: String) {
        log!(
            "{} set greeting to {}",
            env::predecessor_account_id(),
            greeting
        );
        self.greeting = greeting;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_then_get() {
        let mut c = Contract::default();
        assert_eq!(c.get_greeting(), "Hello");
        c.set_greeting("howdy".to_string());
        assert_eq!(c.get_greeting(), "howdy");
    }
}

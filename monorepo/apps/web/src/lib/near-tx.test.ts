// Run from apps/web: ../api/node_modules/.bin/tsx --test src/lib/near-tx.test.ts (no wallet, no network)
import assert from "node:assert/strict";
import { test } from "node:test";
import { COLLECTION, GACHA, MARKET, WNEAR, vaultOf } from "./contracts";
import * as tx from "./near-tx";

const T = (n: number) => (BigInt(n) * BigInt(10) ** BigInt(12)).toString();
const fc = (t: tx.Tx, i = 0) => t.actions[i].params;

test("buy attaches the exact listing price with 200 Tgas", () => {
  const t = tx.buyTx("7", "5000000000000000000000000");
  assert.equal(t.receiverId, MARKET);
  assert.deepEqual(fc(t), { methodName: "buy", args: { token_id: "7" }, gas: T(200), deposit: "5000000000000000000000000" });
});

test("offer escrows the amount with expires_at", () => {
  assert.deepEqual(tx.offerTx("3", "10000000000000000000000", 1_700_000_000_000), {
    receiverId: MARKET,
    actions: [{ type: "FunctionCall", params: { methodName: "offer", args: { token_id: "3", expires_at: 1_700_000_000_000 }, gas: T(30), deposit: "10000000000000000000000" } }],
  });
});

test("list and accept are nft_approve to the market with the agreed msgs", () => {
  const list = tx.listTx("2", "42");
  assert.equal(list.receiverId, COLLECTION);
  assert.deepEqual(fc(list).args, { token_id: "2", account_id: MARKET, msg: '{"list":{"price":"42"}}' });
  const accept = tx.acceptTx("2", "bob.testnet");
  assert.equal(accept.receiverId, COLLECTION);
  assert.equal(fc(accept).methodName, "nft_approve");
  assert.equal(fc(accept).gas, T(250));
  assert.deepEqual(fc(accept).args, { token_id: "2", account_id: MARKET, msg: '{"accept_offer":{"buyer_id":"bob.testnet"}}' });
  assert.ok(BigInt(fc(accept).deposit) > BigInt(0));
});

test("delist also revokes the market approval (withdraw needs zero approvals)", () => {
  const [d, r] = tx.delistTxs("9");
  assert.deepEqual([d.receiverId, fc(d).methodName, fc(d).deposit], [MARKET, "delist", "0"]);
  assert.deepEqual([r.receiverId, fc(r).methodName, fc(r).deposit], [COLLECTION, "nft_revoke", "1"]);
  assert.deepEqual(fc(r).args, { token_id: "9", account_id: MARKET });
});

test("deposit registers the vault, then ft_transfer_call with 1 yocto", () => {
  const t = tx.depositTx("4", "tusdc.torchvault.testnet", "1500000");
  assert.equal(t.receiverId, "tusdc.torchvault.testnet");
  assert.deepEqual(fc(t, 0), { methodName: "storage_deposit", args: { account_id: vaultOf("4"), registration_only: true }, gas: T(30), deposit: tx.FT_STORAGE });
  assert.deepEqual(fc(t, 1), { methodName: "ft_transfer_call", args: { receiver_id: vaultOf("4"), amount: "1500000", msg: "" }, gas: T(100), deposit: "1" });
  assert.equal(vaultOf("4"), `4.${COLLECTION}`);
});

test("withdraw and transfer attach exactly 1 yocto", () => {
  const w = tx.withdrawTx("4", "tbtc.torchvault.testnet", "10");
  assert.deepEqual([w.receiverId, fc(w).methodName, fc(w).deposit], [COLLECTION, "withdraw", "1"]);
  assert.deepEqual(fc(w).args, { token_id: "4", ft_id: "tbtc.torchvault.testnet", amount: "10" });
  const t = tx.transferTx("4", "carol.testnet");
  assert.deepEqual([t.receiverId, fc(t).methodName, fc(t).deposit], [COLLECTION, "nft_transfer", "1"]);
  assert.deepEqual(fc(t).args, { receiver_id: "carol.testnet", token_id: "4" });
});

test("mint attaches MINT_DEPOSIT (0.11 NEAR)", () => {
  const t = tx.mintTx({ title: "X", extra: "{}" });
  assert.equal(t.receiverId, COLLECTION);
  assert.equal(fc(t).deposit, "110000000000000000000000");
  assert.deepEqual(fc(t).args, { metadata: { title: "X", extra: "{}" }, receiver_id: null });
});

test("pull: 1× = price, 10× = 9× price with 1 PGas", () => {
  const price = "100000000000000000000000";
  const one = tx.pullTx(1, price);
  assert.deepEqual([one.receiverId, fc(one).deposit, fc(one).gas], [GACHA, price, T(300)]);
  const ten = tx.pullTx(10, price);
  assert.deepEqual([fc(ten).args, fc(ten).deposit, fc(ten).gas], [{ count: 10 }, "900000000000000000000000", T(1000)]);
});

test("faucet and wrap", () => {
  const f = tx.faucetTx("teth.torchvault.testnet");
  assert.deepEqual([f.receiverId, fc(f).methodName, fc(f).deposit], ["teth.torchvault.testnet", "faucet", "1250000000000000000000"]);
  const w = tx.wrapTx("1000000000000000000000000");
  assert.equal(w.receiverId, WNEAR);
  assert.deepEqual(w.actions.map((a) => a.params.methodName), ["storage_deposit", "near_deposit"]);
  assert.equal(fc(w, 1).deposit, "1000000000000000000000000");
});

test("toUnits / fromUnits", () => {
  assert.equal(tx.toUnits("1.5", 6), "1500000");
  assert.equal(tx.toUnits("0.1", 24), "100000000000000000000000");
  assert.equal(tx.toUnits(".000000019", 8), "1");
  assert.equal(tx.toUnits(2, 0), "2");
  assert.throws(() => tx.toUnits("1e5", 6));
  assert.equal(tx.toUnits(0.9, 24), "900000000000000000000000");
  assert.equal(tx.toUnits(1e-7, 8), "10");
  assert.equal(tx.fromUnits("1500000", 6), 1.5);
  assert.equal(tx.formatUnits("1500000", 6), "1.5");
  assert.equal(tx.formatUnits("7", 8), "0.00000007");
  assert.equal(tx.formatUnits("100000000000000000000000", 24), "0.1");
  assert.equal(tx.formatUnits("2", 0), "2");
});

const outcome = (status: object, logs: string[] = [], receipts: object[] = []): tx.Outcome =>
  ({ transaction: { hash: "h" }, status, receipts_outcome: [{ outcome: { logs, status: { SuccessValue: "" } } }, ...receipts] }) as tx.Outcome;

test("check surfaces contract panics and false results", () => {
  const panic = { Failure: { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: "Smart contract panicked: faucet: wait" } } } } };
  assert.throws(() => tx.check([outcome(panic)]), /^Error: faucet: wait$/);
  assert.throws(() => tx.check([outcome({ SuccessValue: "" }, [], [{ outcome: { logs: [], status: panic } }])]), /faucet: wait/);
  assert.throws(() => tx.check([outcome({ SuccessValue: btoa("false") })]), /rolled this back/);
  assert.doesNotThrow(() => tx.check([outcome({ SuccessValue: btoa('"7"') })]));
  assert.throws(() => tx.check([outcome(panic)], true), /faucet: wait/);
  assert.doesNotThrow(() => tx.check([outcome({ SuccessValue: "" }, [], [{ outcome: { logs: [], status: panic } }])], true));
  assert.equal(tx.lastResult(outcome({ SuccessValue: btoa('"7"') })), "7");
});

test("events reads torch NEP-297 logs from every receipt", () => {
  const log = (event: string, data: object) => "EVENT_JSON:" + JSON.stringify({ standard: "torch", version: "1.0.0", event, data: [data] });
  const o = outcome({ SuccessValue: "" }, [log("gacha_pull", { token_id: "1", rarity: "Rare" }), "noise"], [
    { outcome: { logs: [log("gacha_pull", { token_id: "2", rarity: "Legendary" }), log("vault_created", { token_id: "2" })], status: {}, executor_id: GACHA } },
  ]);
  assert.deepEqual(tx.events([o], "gacha_pull", { from: GACHA }).map((d) => d.token_id), ["2"]);
  assert.deepEqual(tx.events([o], "gacha_pull").map((d) => d.token_id), ["1", "2"]);
  assert.deepEqual(tx.events([o], "vault_created"), [{ token_id: "2" }]);
  assert.deepEqual(tx.events([o], "nft_mint"), []);
});

test("explorer link points at testnet nearblocks", () => {
  assert.equal(tx.explorerTx("abc"), "https://testnet.nearblocks.io/txns/abc");
});

test("token list: wNEAR + the 14 mock FTs with INTERFACES decimals", async () => {
  const { FTS, ftByKey } = await import("./contracts");
  assert.equal(FTS.length, 15);
  assert.deepEqual(ftByKey("NEAR"), { key: "NEAR", id: WNEAR, decimals: 24 });
  assert.deepEqual(ftByKey("USDC"), { key: "USDC", id: "tusdc.torchvault.testnet", decimals: 6 });
  assert.equal(ftByKey("BTC").decimals, 8);
  assert.deepEqual(ftByKey("DRAGON"), { key: "DRAGON", id: "tdragon.torchvault.testnet", decimals: 18 });
});

test("send: one approval with batch wallets, sequential steps otherwise", async () => {
  const ok = { transaction: { hash: "x" }, status: { SuccessValue: "" }, receipts_outcome: [] };
  const calls: string[] = [];
  const wallet = (batch: boolean) =>
    ({
      manifest: { features: { signAndSendTransactions: batch } },
      signAndSendTransaction: async (t: tx.Tx) => (calls.push(`one:${t.receiverId}`), ok),
      signAndSendTransactions: async (p: { transactions: tx.Tx[] }) => (calls.push(`batch:${p.transactions.length}`), p.transactions.map(() => ok)),
    }) as unknown as Parameters<typeof tx.send>[0];
  const txs = tx.delistTxs("1");
  await tx.send(wallet(true), txs);
  assert.deepEqual(calls.splice(0), ["batch:2"]);
  const steps: string[] = [];
  const outs = await tx.send(wallet(false), txs, { onStep: (i, n) => steps.push(`${i + 1}/${n}`) });
  assert.equal(outs.length, 2);
  assert.deepEqual(calls, [`one:${MARKET}`, `one:${COLLECTION}`]);
  assert.deepEqual(steps, ["1/2", "2/2"]);
  assert.equal(tx.canBatch(null), false);
});

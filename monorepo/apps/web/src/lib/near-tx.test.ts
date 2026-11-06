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

test("offer: amount + storage attached, min_balances pinned (max 4)", () => {
  const pins = [1, 2, 3, 4, 5].map((i) => ({ ft_id: `t${i}.torchvault.testnet`, amount: String(i) }));
  assert.deepEqual(tx.offerTx("3", "10000000000000000000000", 1_700_000_000_000, pins, "20000000000000000000000"), {
    receiverId: MARKET,
    actions: [
      {
        type: "FunctionCall",
        params: { methodName: "offer", args: { token_id: "3", amount: "10000000000000000000000", expires_at: 1_700_000_000_000, min_balances: pins.slice(0, 4) }, gas: T(50), deposit: "30000000000000000000000" },
      },
    ],
  });
  assert.equal(fc(tx.offerTx("3", "1", 1)).deposit, (BigInt(1) + BigInt(tx.OFFER_STORAGE_FALLBACK)).toString());
  const c = tx.cancelOfferTx("3");
  assert.deepEqual([c.receiverId, fc(c).methodName, fc(c).deposit], [MARKET, "cancel_offer", "1"]);
});

test("list and accept are nft_approve to the market with the agreed msgs", () => {
  const list = tx.listTx("2", "42");
  assert.equal(list.receiverId, COLLECTION);
  assert.deepEqual(fc(list).args, { token_id: "2", account_id: MARKET, msg: '{"list":{"price":"42"}}' });
  const accept = tx.acceptTx("2", "bob.testnet", "77");
  assert.equal(accept.receiverId, COLLECTION);
  assert.equal(fc(accept).methodName, "nft_approve");
  assert.equal(fc(accept).gas, T(250));
  assert.deepEqual(fc(accept).args, { token_id: "2", account_id: MARKET, msg: '{"accept_offer":{"buyer_id":"bob.testnet","amount":"77"}}' });
  assert.ok(BigInt(fc(accept).deposit) > BigInt(0));
});

test("delist also revokes the market approval (withdraw needs zero approvals)", () => {
  const [d, r] = tx.delistTxs("9");
  assert.deepEqual([d.receiverId, fc(d).methodName, fc(d).deposit], [MARKET, "delist", "1"]);
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
  assert.equal(tx.fromUnits("100000000000000000000000", 24), 0.1);
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
  // collection.mint resolves to null when the vault could not be created (X-4): not a rollback, the caller decides
  assert.equal(tx.lastResult(outcome({ SuccessValue: btoa("null") })), null);
  assert.doesNotThrow(() => tx.check([outcome({ SuccessValue: btoa("null") })]));
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

test("pinsFor: basket from nft_token extra, live vault balances, known FTs only, max 4", async () => {
  const calls: string[] = [];
  const extra = JSON.stringify({
    basket: [
      { token: "tusdc.torchvault.testnet", weight: 40 },
      { token: "tusdc.evil.testnet", weight: 10 }, // look-alike: not in our FT list
      { token: "tbtc.torchvault.testnet", weight: 30 },
      { token: "teth.torchvault.testnet", weight: 20 },
      { token: "tzec.torchvault.testnet", weight: 5 },
      { token: "thot.torchvault.testnet", weight: 5 },
    ],
  });
  const bal: Record<string, string> = { "tusdc.torchvault.testnet": "300000000", "tbtc.torchvault.testnet": "0", "teth.torchvault.testnet": "7", "tzec.torchvault.testnet": "9" };
  const read = (async (contractId: string, method: string, args?: Record<string, unknown>) => {
    calls.push(`${contractId}:${method}`);
    if (method === "nft_token") return { metadata: { extra } };
    assert.equal(args?.account_id, vaultOf("0"));
    return bal[contractId] ?? "0";
  }) as Parameters<typeof tx.pinsFor>[1];
  const pins = await tx.pinsFor("0", read);
  assert.deepEqual(pins, [
    { ft_id: "tusdc.torchvault.testnet", amount: "300000000" },
    { ft_id: "teth.torchvault.testnet", amount: "7" },
    { ft_id: "tzec.torchvault.testnet", amount: "9" },
  ]);
  assert.equal(calls[0], `${COLLECTION}:nft_token`);
  assert.ok(!calls.some((c) => c.startsWith("tusdc.evil")));
  assert.ok(!calls.some((c) => c.startsWith("thot")), "5th known token is past the 4-pin cap");
  assert.deepEqual(await tx.pinsFor("9", (async () => null) as Parameters<typeof tx.pinsFor>[1]), []);
});

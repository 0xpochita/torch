// Small chain/encoding helpers for deploy-testnet.sh (node stdlib only, read-only RPC).
// Usage: node near-util.mjs <cmd> [args]; exit code 1 means "no" for the yes/no checks.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { tiersFor } from "./gacha-tiers.mjs";

const RPC = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const b58encode = (bytes) => {
  let n = BigInt("0x" + (Buffer.from(bytes).toString("hex") || "0"));
  let out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b) break; out = "1" + out; }
  return out;
};
const b58decode = (s) => {
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  const hex = n.toString(16);
  const body = Buffer.from(hex.length % 2 ? "0" + hex : hex, "hex");
  const zeros = s.match(/^1*/)[0].length;
  return Buffer.concat([Buffer.alloc(zeros), n ? body : Buffer.alloc(0)]);
};

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "torch", method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}
const query = (params) => rpc("query", { finality: "final", ...params });
const viewAccount = (account_id) => query({ request_type: "view_account", account_id });
async function view(contract, method, args = {}) {
  const r = await query({
    request_type: "call_function",
    account_id: contract,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(r.result).toString() || "null");
}
const yes = (ok) => process.exit(ok ? 0 : 1);

const [cmd, ...a] = process.argv.slice(2);
switch (cmd) {
  case "hash": // base58 sha256 of a wasm = its global contract code hash
    console.log(b58encode(createHash("sha256").update(readFileSync(a[0])).digest()));
    break;
  case "pubkey": // ed25519 secret key (64 bytes: seed + public) -> public key
    console.log("ed25519:" + b58encode(b58decode(a[0].replace(/^ed25519:/, "")).subarray(32)));
    break;
  case "exists":
    yes(await viewAccount(a[0]).then(() => true, () => false));
    break;
  case "has-code":
    yes(await viewAccount(a[0]).then((r) => r.code_hash !== "11111111111111111111111111111111" || !!r.global_contract_hash, () => false));
    break;
  case "balance": // yoctoNEAR
    console.log((await viewAccount(a[0])).amount);
    break;
  case "keys": // number of access keys
    console.log((await query({ request_type: "view_access_key_list", account_id: a[0] })).keys.length);
    break;
  case "global-exists": // code hash already published
    yes(await query({ request_type: "view_global_contract_code", code_hash: a[0] }).then(() => true, () => false));
    break;
  case "view":
    console.log(JSON.stringify(await view(a[0], a[1], a[2] ? JSON.parse(a[2]) : {})));
    break;
  case "height":
    console.log((await rpc("block", { finality: "final" })).header.height);
    break;
  case "tiers":
    console.log(JSON.stringify(tiersFor(a[0])));
    break;
  case "treasury": { // <root> <pulls>: "<token> <amount>" lines, enough for <pulls> draws of every basket
    const need = {};
    for (const t of tiersFor(a[0]))
      for (const b of t.baskets)
        for (const i of b.items) need[i.token] = (need[i.token] ?? 0n) + BigInt(i.amount) * BigInt(a[1]);
    for (const [token, amount] of Object.entries(need)) console.log(token, amount.toString());
    break;
  }
  case "ge": // a >= b for big integers
    yes(BigInt(a[0]) >= BigInt(a[1]));
    break;
  default:
    console.error(`unknown command: ${cmd}`);
    process.exit(2);
}

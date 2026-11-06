#!/usr/bin/env bash
# One command: the real deploy-testnet.sh + seed-testnet.ts end to end on a local near-sandbox.
# Nothing touches testnet except one read: the wrap.testnet wasm is downloaded once (cached in
# ~/.near-sandbox) so wNEAR baskets work. Everything started here is stopped on exit.
#
#   ./scripts/sandbox-e2e.sh            # from monorepo/; KEEP=1 leaves the sandbox running
#
# Same sandbox as CI (NEAR_SANDBOX_VERSION 2.14.0, binary in ~/.near-sandbox or
# NEAR_SANDBOX_BIN_PATH). Accounts keep the testnet shape with test.near as the TLA:
# torchvault.test.near, nft.torchvault.test.near, <id>.nft.torchvault.test.near, ...
# A temporary near-cli-rs connection named "sandbox" is added; the CLI config is restored on exit.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
MONO=$(dirname "$HERE")
VERSION=${NEAR_SANDBOX_VERSION:-2.14.0}
BIN=${NEAR_SANDBOX_BIN_PATH:-$HOME/.near-sandbox/near-sandbox}
WRAP_WASM=$HOME/.near-sandbox/wrap.wasm
CONN=sandbox
ROOT=torchvault.test.near
WRAP=wrap.test.near
CREATORS=(alice.test.near bob.test.near carol.test.near)

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) PLATFORM=Linux-x86_64 ;;
  Linux-aarch64) PLATFORM=Linux-aarch64 ;;
  Darwin-arm64) PLATFORM=Darwin-arm64 ;;
  *) echo "no near-sandbox build for $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac
if [[ ! -x $BIN ]]; then
  mkdir -p "$(dirname "$BIN")"
  curl -sSfL -o /tmp/near-sandbox.tar.gz \
    "https://s3-us-west-1.amazonaws.com/build.nearprotocol.com/nearcore/$PLATFORM/$VERSION/near-sandbox.tar.gz"
  tar -xzf /tmp/near-sandbox.tar.gz -C "$(dirname "$BIN")" --strip-components=1
  rm /tmp/near-sandbox.tar.gz
fi
if [[ ! -f $WRAP_WASM ]]; then
  near contract download-wasm regular wrap.testnet save-to-file "$WRAP_WASM" network-config testnet now
fi
[[ -d $HERE/node_modules ]] || (cd "$HERE" && pnpm install --frozen-lockfile --ignore-workspace)

WORK=$(mktemp -d)
CLI_CONFIG=$(near config show-connections 2>&1 | sed -n 's/.*stored in a file "\(.*\)".*/\1/p')
cp "$CLI_CONFIG" "$WORK/cli-config.toml"
SANDBOX_PID=''
cleanup() {
  cp "$WORK/cli-config.toml" "$CLI_CONFIG"
  if [[ ${KEEP:-0} == 1 && -n $SANDBOX_PID ]]; then
    echo "sandbox left running: pid $SANDBOX_PID, rpc $RPC, home $WORK"
    return
  fi
  [[ -n $SANDBOX_PID ]] && kill "$SANDBOX_PID" 2>/dev/null && wait "$SANDBOX_PID" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

free_port() { node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})'; }
RPC_PORT=$(free_port)
NET_PORT=$(free_port)
RPC=http://127.0.0.1:$RPC_PORT

echo "== sandbox $VERSION on $RPC"
"$BIN" --home "$WORK/home" init >/dev/null 2>&1
node -e '
  const fs = require("fs"), f = process.argv[1] + "/config.json", c = JSON.parse(fs.readFileSync(f));
  c.rpc.addr = "127.0.0.1:" + process.argv[2];
  c.network.addr = "127.0.0.1:" + process.argv[3];
  fs.writeFileSync(f, JSON.stringify(c, null, 2));
' "$WORK/home" "$RPC_PORT" "$NET_PORT"
"$BIN" --home "$WORK/home" run >"$WORK/sandbox.log" 2>&1 &
SANDBOX_PID=$!
for _ in $(seq 120); do curl -sf "$RPC/status" >/dev/null && break; sleep 0.5; done
curl -sf "$RPC/status" >/dev/null || { tail -20 "$WORK/sandbox.log"; exit 1; }

# `near config add-connection` prompts for the optional fields without a TTY, so append the section.
cat >>"$CLI_CONFIG" <<EOF

[network_connection.$CONN]
network_name = "$CONN"
rpc_url = "$RPC/"
wallet_url = "$RPC/"
explorer_transaction_url = "$RPC/"
EOF

# test.near (genesis, effectively unlimited NEAR) stands in for the faucet.
TEST_KEY=$(node -p "require('$WORK/home/validator_key.json').secret_key")
keypair() { node -e 'const {KeyPair}=require(process.argv[1]);const k=KeyPair.fromRandom("ed25519");console.log(k.toString(),k.getPublicKey().toString())' "$HERE/node_modules/near-api-js/lib/index.cjs"; }
fund() { # fund <account> <amount> <public key>
  near account create-account fund-myself "$1" "$2" use-manually-provided-public-key "$3" \
    sign-as test.near network-config "$CONN" sign-with-plaintext-private-key "$TEST_KEY" send >"$WORK/setup.log" 2>&1 || { cat "$WORK/setup.log"; exit 1; }
}
read -r ROOT_KEY ROOT_PUB < <(keypair)
fund "$ROOT" '60 NEAR' "$ROOT_PUB"
SEED_CREATORS=''
for c in "${CREATORS[@]}"; do
  read -r key pub < <(keypair)
  fund "$c" '10 NEAR' "$pub"
  SEED_CREATORS+="${SEED_CREATORS:+,}$c:$key"
done
read -r wkey wpub < <(keypair)
fund "$WRAP" '5 NEAR' "$wpub"
near contract deploy "$WRAP" use-file "$WRAP_WASM" with-init-call new json-args '{}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config "$CONN" \
  sign-with-plaintext-private-key "$wkey" send >"$WORK/setup.log" 2>&1 || { cat "$WORK/setup.log"; exit 1; }
echo "   $ROOT (60 NEAR), ${CREATORS[*]} (10 NEAR each), $WRAP (wNEAR stand-in)"

export NEAR_NETWORK=$CONN NEAR_RPC_URL=$RPC NEAR_ROOT_ID=$ROOT NEAR_WRAP_ID=$WRAP ENV_ROOT=$WORK/env
export SEED_CREATORS
cd "$MONO"
echo; echo "######## deploy"
NEAR_PRIVATE_KEY=$ROOT_KEY ./scripts/deploy-testnet.sh
echo; echo "######## deploy again (must skip everything)"
again=$(SKIP_BUILD=1 NEAR_PRIVATE_KEY=$ROOT_KEY ./scripts/deploy-testnet.sh)
grep '^+ ' <<<"$again" | grep -v 'list-keys' && { echo "FAIL: second deploy sent transactions" >&2; exit 1; }
echo "   ok: nothing to do"
echo; echo "######## seed"
(cd scripts && node_modules/.bin/tsx seed-testnet.ts)
echo; echo "######## seed --check"
(cd scripts && node_modules/.bin/tsx seed-testnet.ts --check) | tee "$WORK/check.log"
grep -q 'all seeded.' "$WORK/check.log" || { echo "FAIL: seed --check reports missing steps" >&2; exit 1; }
echo; echo "######## sandbox e2e: ok"

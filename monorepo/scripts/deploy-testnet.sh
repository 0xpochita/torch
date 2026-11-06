#!/usr/bin/env bash
# Deploy Torch to NEAR testnet with near-cli-rs (accounts, wasm, global vault, init, treasury, env files).
# Idempotent: every step checks chain state first and is skipped when already done.
#
#   DRY_RUN=1 ./scripts/deploy-testnet.sh   # print the full ordered plan, no network calls, no writes
#   ./scripts/deploy-testnet.sh             # real run; budget: scripts/budget.md
#
# Signing: every account here holds the root's key. NEAR_PRIVATE_KEY (ed25519:...) or, if unset,
# ~/.near-credentials/<network>/<root>.json. Sub-accounts are created with the root's public key.
# Needs: near (near-cli-rs), cargo near, node >= 18.
set -euo pipefail

ROOT=${NEAR_ROOT_ID:-torchvault.testnet}
NETWORK=${NEAR_NETWORK:-testnet}
export NEAR_RPC_URL=${NEAR_RPC_URL:-https://rpc.testnet.near.org}
DRY_RUN=${DRY_RUN:-0}
SKIP_BUILD=${SKIP_BUILD:-0}
TREASURY_PULLS=${TREASURY_PULLS:-500} # treasury covers this many draws of every basket
GACHA_NEAR=${GACHA_NEAR:-5}           # NEAR for mint deposits, ~0.12 NEAR per pull result

HERE=$(cd "$(dirname "$0")" && pwd)
MONO=$(dirname "$HERE")
CONTRACTS=$MONO/contracts
WASM=$CONTRACTS/target/near

NFT=nft.$ROOT
MARKET=market.$ROOT
GACHA=gacha.$ROOT
TOKENS=(tusdc tusdt tbtc teth thot trhea tlinear tstnear tzec taurora tnpro tdragon tshitzu tsweat)
PULL_PRICE=100000000000000000000000 # 0.1 NEAR
PITY=50

# symbol|name|decimals per mock token (INTERFACES: tusdc/tusdt 6, tbtc 8, rest 18)
meta() {
  case $1 in
    tusdc) echo "USDC|Torch Test USD Coin|6" ;;
    tusdt) echo "USDT|Torch Test Tether|6" ;;
    tbtc) echo "BTC|Torch Test Bitcoin|8" ;;
    teth) echo "ETH|Torch Test Ether|18" ;;
    thot) echo "HOT|Torch Test HOT|18" ;;
    trhea) echo "RHEA|Torch Test RHEA|18" ;;
    tlinear) echo "LINEAR|Torch Test LiNEAR|18" ;;
    tstnear) echo "STNEAR|Torch Test stNEAR|18" ;;
    tzec) echo "ZEC|Torch Test Zcash|18" ;;
    taurora) echo "AURORA|Torch Test Aurora|18" ;;
    tnpro) echo "NPRO|Torch Test NEAR Mobile|18" ;;
    tdragon) echo "BLACKDRAGON|Torch Test Black Dragon|18" ;;
    tshitzu) echo "SHITZU|Torch Test Shitzu|18" ;;
    tsweat) echo "SWEAT|Torch Test Sweat|18" ;;
  esac
}

util() { node "$HERE/near-util.mjs" "$@"; }
step() { printf '\n== %s\n' "$*"; }
skip() { printf '   skip: %s\n' "$*"; }

if [[ $DRY_RUN == 1 ]]; then
  PRIV='ed25519:<NEAR_PRIVATE_KEY>'
  PUB='ed25519:<NEAR_PUBLIC_KEY>'
else
  PRIV=${NEAR_PRIVATE_KEY:-$(node -p "require('$HOME/.near-credentials/$NETWORK/$ROOT.json').private_key")}
  PUB=$(util pubkey "$PRIV")
fi
SIGN=(sign-with-plaintext-private-key --signer-public-key "$PUB" --signer-private-key "$PRIV" send)
NET=(network-config "$NETWORK")

# Print the command (shell-quoted, private key masked), run it unless DRY_RUN.
run() {
  local a shown=()
  for a in "$@"; do
    a=${a//"$PRIV"/***}
    if [[ $a =~ ^[A-Za-z0-9_./:@=,+-]+$ ]]; then shown+=("$a"); else shown+=("'${a//\'/\'\\\'\'}'"); fi
  done
  printf '+ %s\n' "${shown[*]}"
  [[ $DRY_RUN == 1 ]] || "$@"
}
# Chain checks: in a dry run nothing is queried and every step counts as "not done yet".
check() { [[ $DRY_RUN != 1 ]] && util "$@" >/dev/null 2>&1; }

step "0. preflight"
if [[ $DRY_RUN == 1 ]]; then
  echo "   DRY_RUN=1: no network calls, nothing written; root=$ROOT network=$NETWORK"
else
  check exists "$ROOT" || { echo "root account $ROOT does not exist or is unfunded" >&2; exit 1; }
  echo "   root $ROOT balance: $(util balance "$ROOT") yocto"
fi
if [[ $DRY_RUN == 1 ]]; then START_HEIGHT='<current final block height>'; else START_HEIGHT=$(util height); fi

step "1. build wasm"
for c in vault collection mock-ft market gacha; do
  if [[ $SKIP_BUILD == 1 ]]; then skip "build $c (SKIP_BUILD=1)"; continue; fi
  run cargo near build non-reproducible-wasm --manifest-path "$CONTRACTS/$c/Cargo.toml"
done
if [[ -f $WASM/vault/vault.wasm ]]; then
  VAULT_HASH=$(util hash "$WASM/vault/vault.wasm")
else
  VAULT_HASH='<vault code hash>' # only reachable in a dry run before the first build
fi
echo "   vault code hash (base58 sha256): $VAULT_HASH"

step "2. sub-accounts of $ROOT (key: root public key)"
create() {
  if check exists "$1"; then skip "$1 exists"; return; fi
  run near account create-account fund-myself "$1" "$2" use-manually-provided-public-key "$PUB" \
    sign-as "$ROOT" "${NET[@]}" "${SIGN[@]}"
}
create "$NFT" '3.5 NEAR'
create "$MARKET" '2.5 NEAR'
create "$GACHA" '2.5 NEAR'
for t in "${TOKENS[@]}"; do create "$t.$ROOT" '2 NEAR'; done

step "3. publish vault as a global contract by hash"
if check global-exists "$VAULT_HASH" || check has-code "$NFT"; then
  skip "vault code $VAULT_HASH already published"
else
  run near contract deploy-as-global use-file "$WASM/vault/vault.wasm" as-global-hash "$ROOT" \
    "${NET[@]}" "${SIGN[@]}"
fi

# deploy <account> <wasm> <init json>
deploy() {
  if check has-code "$1"; then skip "$1 already has code"; return; fi
  run near contract deploy "$1" use-file "$2" with-init-call new json-args "$3" \
    prepaid-gas '100 Tgas' attached-deposit '0 NEAR' "${NET[@]}" "${SIGN[@]}"
}

step "4. mock NEP-141 tokens"
for t in "${TOKENS[@]}"; do
  IFS='|' read -r symbol name decimals <<<"$(meta "$t")"
  deploy "$t.$ROOT" "$WASM/mock_ft/mock_ft.wasm" \
    "{\"owner_id\":\"$ROOT\",\"metadata\":{\"spec\":\"ft-1.0.0\",\"name\":\"$name\",\"symbol\":\"$symbol\",\"icon\":null,\"reference\":null,\"reference_hash\":null,\"decimals\":$decimals}}"
done

step "5. collection, market, gacha"
deploy "$NFT" "$WASM/collection/collection.wasm" \
  "{\"owner_id\":\"$ROOT\",\"vault_code_hash\":\"$VAULT_HASH\",\"metadata\":{\"spec\":\"nft-1.0.0\",\"name\":\"Torch Vaults\",\"symbol\":\"TORCH\",\"icon\":null,\"base_uri\":null,\"reference\":null,\"reference_hash\":null}}"
deploy "$MARKET" "$WASM/market/market.wasm" \
  "{\"collection_id\":\"$NFT\",\"fee_receiver_id\":\"$ROOT\"}"
deploy "$GACHA" "$WASM/gacha/gacha.wasm" \
  "{\"owner_id\":\"$ROOT\",\"collection_id\":\"$NFT\",\"price_per_pull\":\"$PULL_PRICE\",\"pity\":$PITY,\"tiers\":$(util tiers "$ROOT")}"

step "6. storage_deposit for gacha, market and root (treasury minter) on every token"
for t in "${TOKENS[@]}"; do
  for who in "$GACHA" "$MARKET" "$ROOT"; do
    if [[ $DRY_RUN != 1 && $(util view "$t.$ROOT" storage_balance_of "{\"account_id\":\"$who\"}") != null ]]; then
      skip "$who registered on $t"; continue
    fi
    run near account manage-storage-deposit "$t.$ROOT" deposit "$who" '0.00125 NEAR' \
      sign-as "$ROOT" "${NET[@]}" "${SIGN[@]}"
  done
done

step "7. gacha treasury: mint to $ROOT, then ft_transfer_call msg \"fund\" ($TREASURY_PULLS draws of every basket)"
treasury_of() { # current treasury balance of token $1 in the gacha
  util view "$GACHA" get_treasury | node -e 'const t=JSON.parse(require("fs").readFileSync(0));const r=t.find(([id])=>id===process.argv[1]);console.log(r?r[1]:"0")' "$1"
}
while read -r ft amount; do
  if [[ $DRY_RUN != 1 ]] && check ge "$(treasury_of "$ft")" "$amount"; then skip "treasury has $ft"; continue; fi
  if [[ $DRY_RUN == 1 ]] || ! check ge "$(util view "$ft" ft_balance_of "{\"account_id\":\"$ROOT\"}" | tr -d '"')" "$amount"; then
    run near contract call-function as-transaction "$ft" mint \
      json-args "{\"account_id\":\"$ROOT\",\"amount\":\"$amount\"}" \
      prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-as "$ROOT" "${NET[@]}" "${SIGN[@]}"
  fi
  run near contract call-function as-transaction "$ft" ft_transfer_call \
    json-args "{\"receiver_id\":\"$GACHA\",\"amount\":\"$amount\",\"msg\":\"fund\"}" \
    prepaid-gas '100 Tgas' attached-deposit '1 yoctoNEAR' sign-as "$ROOT" "${NET[@]}" "${SIGN[@]}"
done < <(util treasury "$ROOT" "$TREASURY_PULLS")

step "8. NEAR for gacha mint deposits ($GACHA_NEAR NEAR on top of its storage)"
if [[ $DRY_RUN != 1 ]] && check ge "$(util balance "$GACHA")" "$(node -p "BigInt(Math.round(($GACHA_NEAR + 2) * 1e6)) * 10n ** 18n")"; then
  skip "$GACHA already holds >= $GACHA_NEAR NEAR spendable"
else
  run near tokens "$ROOT" send-near "$GACHA" "$GACHA_NEAR NEAR" "${NET[@]}" "${SIGN[@]}"
fi

step "9. verify a vault has no access keys (I1)"
if [[ $DRY_RUN == 1 || $(util view "$NFT" nft_total_supply) == '"0"' ]]; then
  run near contract call-function as-transaction "$NFT" mint \
    json-args "{\"metadata\":{\"title\":\"Deploy check\",\"description\":\"Empty vault minted by the deploy script\",\"extra\":\"{\\\"basket\\\":[],\\\"bg\\\":\\\"#d9d9d9\\\",\\\"category\\\":\\\"Stable\\\",\\\"creator\\\":\\\"$ROOT\\\",\\\"rarity\\\":null}\"},\"receiver_id\":null}" \
    prepaid-gas '100 Tgas' attached-deposit '0.11 NEAR' sign-as "$ROOT" "${NET[@]}" "${SIGN[@]}"
fi
run near account list-keys "0.$NFT" "${NET[@]}" now
if [[ $DRY_RUN != 1 ]]; then
  keys=$(util keys "0.$NFT")
  [[ $keys == 0 ]] || { echo "FAIL: 0.$NFT has $keys access keys" >&2; exit 1; }
  echo "   ok: 0.$NFT has no access keys"
fi

step "10. env files"
FT_IDS=$(printf "%s.$ROOT," "${TOKENS[@]}")wrap.testnet
upsert() { # upsert <file> KEY=VALUE...
  local file=$1 kv
  shift
  for kv in "$@"; do printf '   %s: %s\n' "${file#"$MONO"/}" "$kv"; done
  [[ $DRY_RUN == 1 ]] && return
  touch "$file"
  for kv in "$@"; do
    grep -v "^${kv%%=*}=" "$file" >"$file.tmp" || true
    mv "$file.tmp" "$file"
    echo "$kv" >>"$file"
  done
}
upsert "$MONO/apps/web/.env.local" \
  "NEXT_PUBLIC_NEAR_NETWORK=$NETWORK" \
  "NEXT_PUBLIC_NEAR_ROOT_ID=$ROOT" \
  "NEXT_PUBLIC_COLLECTION_ID=$NFT" \
  "NEXT_PUBLIC_MARKET_ID=$MARKET" \
  "NEXT_PUBLIC_GACHA_ID=$GACHA" \
  "NEXT_PUBLIC_FT_IDS=$FT_IDS" \
  "NEXT_PUBLIC_VAULT_CODE_HASH=$VAULT_HASH"
upsert "$MONO/apps/api/.env" \
  "NEAR_ROOT_ID=$ROOT" \
  "NEAR_COLLECTION_ID=$NFT" \
  "NEAR_MARKET_ID=$MARKET" \
  "NEAR_GACHA_ID=$GACHA" \
  "NEAR_FT_IDS=$FT_IDS" \
  "NEAR_RPC_URL=$NEAR_RPC_URL"
# Backfill the indexer from before this deploy, but never move an existing cursor start.
if [[ $DRY_RUN == 1 ]] || ! grep -q '^START_HEIGHT=' "$MONO/apps/api/.env"; then
  upsert "$MONO/apps/api/.env" "START_HEIGHT=$START_HEIGHT"
fi

step "done"
echo "   vault code hash: $VAULT_HASH"

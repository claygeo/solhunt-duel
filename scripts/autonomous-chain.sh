#!/bin/bash
# autonomous-chain.sh
#
# Overnight autonomous solhunt chain. Runs continuously through queued scans
# until: (a) a real find lands and queues for human review, (b) Max
# rate-limit hits hard, (c) total budget exhausted.
#
# Safety: never auto-submits. All findings land in findings/<ts>-<contract>/
# for Clayton's morning review. Per-scan in-scope check still enforced.
#
# Stages:
#   1. wait for any in-flight scan (twyne-impls) to finish
#   2. deep-scan Twyne IntermediateVaultFactory + Vault Manager with fetched impl source
#   3. deep-scan Drips current-impl (0x56f2a96...) — added to allowlist on-the-fly
#   4. /codex-recommended fresh programs (loaded at runtime from chain-next-programs.json)
#
# Stop conditions checked between every scan.

set -u
set -o pipefail

cd "$(dirname "$0")/.."

PER_SCAN_TIMEOUT="${PER_SCAN_TIMEOUT:-1500}"
TOTAL_TIMEOUT="${TOTAL_TIMEOUT:-43200}"  # 12h hard cap (overnight)
START_TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
META_DIR="findings/autonomous-chain-${START_TS}"
mkdir -p "${META_DIR}"
LOG="${META_DIR}/run.log"
NEXT_PROGRAMS_JSON="${META_DIR}/next-programs.json"

log() { echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "${LOG}"; }

write_status() { echo "$1" > "${META_DIR}/STATUS"; }

cleanup_stale_containers() {
  local stale
  stale=$(docker ps --filter "name=solhunt-scan-" --filter "status=running" --format "{{.ID}}|{{.Status}}" | awk -F'|' '$2 ~ /(hour|day|week)/ {print $1}')
  [ -n "$stale" ] && echo "$stale" | xargs -r docker rm -f >/dev/null 2>&1 || true
}

wipe_staging() {
  rm -rf /workspace/harness-red/scan/{src,test,out,cache} 2>/dev/null || true
}

check_rate_limit_hard() {
  local logfile="$1"
  # Real hard block = is_error:true in result event AND mentions rate-limit
  if grep -q '"is_error":true' "$logfile" 2>/dev/null && grep -qi 'rate.*limit\|usage.*limit' "$logfile" 2>/dev/null; then
    return 0
  fi
  return 1
}

check_for_find() {
  # Returns the path to the most-recent finding bundle iff found=true
  local recent
  recent=$(ls -dt findings/2*-* 2>/dev/null | head -1 || true)
  if [ -n "${recent:-}" ] && [ -f "${recent}/report.json" ] && grep -q '"found": true' "${recent}/report.json" 2>/dev/null; then
    echo "$recent"
    return 0
  fi
  return 1
}

run_one_scan() {
  # $1=Name $2=ProxyAddr $3=SourceDirOrFile $4=ContractName
  local NAME="$1" ADDR="$2" SRC="$3" CONTRACT="$4"
  local IDX="${5:-x}"
  local PER_LOG="${META_DIR}/${IDX}-${NAME}.log"
  local EXIT_FILE="${META_DIR}/${IDX}-${NAME}.exit"

  local elapsed=$(($(date +%s) - TOTAL_START))
  local remaining=$((TOTAL_TIMEOUT - elapsed))
  if [ "$remaining" -le 60 ]; then
    log "TOTAL_TIMEOUT exhausted (${elapsed}s elapsed) — chain stopping"
    write_status "TOTAL_TIMEOUT"
    return 99
  fi

  local effective_timeout=$PER_SCAN_TIMEOUT
  [ "$remaining" -lt "$effective_timeout" ] && effective_timeout=$remaining

  log "scanning ${NAME} (proxy ${ADDR}, src=${SRC}, contract=${CONTRACT}) — budget ${effective_timeout}s"
  cleanup_stale_containers
  wipe_staging

  local cmd=(timeout "$effective_timeout" npx tsx src/index.ts scan "$ADDR" --via-claude-cli --findings-dir "./findings")
  if [ -n "$SRC" ]; then
    cmd+=(--source-file "$SRC" --contract-name "$CONTRACT")
  fi

  set +e
  "${cmd[@]}" > "$PER_LOG" 2>&1
  local exit_code=$?
  set -e
  echo "$exit_code" > "$EXIT_FILE"

  log "${NAME} done — exit=${exit_code}"

  if check_rate_limit_hard "$PER_LOG"; then
    log "RATE_LIMITED (hard block) detected — chain stopping"
    write_status "RATE_LIMITED"
    return 98
  fi

  local found
  if found=$(check_for_find); then
    log "FOUND TRUE in ${found}/report.json — chain stopping for human review"
    write_status "FOUND"
    echo "$found" > "${META_DIR}/FOUND_AT"
    return 97
  fi

  return 0
}

write_status "RUNNING"
TOTAL_START=$(date +%s)
log "autonomous chain started — total timeout ${TOTAL_TIMEOUT}s, per-scan ${PER_SCAN_TIMEOUT}s"

# ---------------------------------------------------------------------
# Stage 0: wait for any in-flight scan to finish (twyne-impls is running)
# ---------------------------------------------------------------------

log "Stage 0: waiting for in-flight twyne-impls scan to complete"
WAIT_LIMIT=$((30 * 60))  # 30 min max wait
WAIT_START=$(date +%s)
while true; do
  IN_FLIGHT=$(ls -dt findings/twyne-impls-*/STATUS 2>/dev/null | head -1 || true)
  if [ -z "$IN_FLIGHT" ]; then
    log "no twyne-impls in-flight, proceeding"
    break
  fi
  STATUS=$(cat "$IN_FLIGHT" 2>/dev/null || echo "UNKNOWN")
  if [ "$STATUS" != "RUNNING" ]; then
    log "twyne-impls finished with status: ${STATUS}"
    if [ "$STATUS" = "FOUND" ]; then
      log "twyne-impls found something — chain stopping for human review"
      write_status "FOUND_UPSTREAM"
      cp "$(dirname "$IN_FLIGHT")"/FOUND_AT "${META_DIR}/FOUND_AT" 2>/dev/null || true
      exit 0
    fi
    break
  fi
  WAITED=$(($(date +%s) - WAIT_START))
  if [ "$WAITED" -ge "$WAIT_LIMIT" ]; then
    log "twyne-impls wait limit ${WAIT_LIMIT}s exceeded — proceeding anyway"
    break
  fi
  sleep 60
done

# ---------------------------------------------------------------------
# Stage 1: more Twyne — IntermediateVaultFactory + VaultManager impls
# ---------------------------------------------------------------------
# We'll fetch the impl source on-the-fly. Some may not be ERC1967 proxies
# in which case the Etherscan-direct source for the proxy address suffices.

log "Stage 1: extended Twyne sweep (IntermediateVaultFactory, VaultManager)"

fetch_impl_or_proxy_source() {
  # $1=address $2=name -> writes source to /workspace/twyne-impl-sources/$2
  local ADDR="$1" NAME="$2"
  local OUTDIR="/workspace/twyne-impl-sources/${NAME}"
  if [ -d "$OUTDIR" ] && [ -n "$(find "$OUTDIR" -name '*.sol' 2>/dev/null | head -1)" ]; then
    log "  source for ${NAME} already cached at ${OUTDIR}"
    return 0
  fi
  mkdir -p "$OUTDIR"
  log "  fetching impl source for ${NAME} (${ADDR})"
  source /root/solhunt/.env
  # Try EIP-1967 impl slot first
  local IMPL=$(curl -s -X POST -H 'Content-Type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getStorageAt\",\"params\":[\"$ADDR\",\"0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc\",\"latest\"],\"id\":1}" \
    "$ETH_RPC_URL" | python3 -c 'import sys,json; v=json.loads(sys.stdin.read()).get("result",""); print("0x"+v[-40:].lower() if v and v != "0x"+("0"*64) else "")')
  local FETCH_ADDR="$ADDR"
  if [ -n "$IMPL" ] && [ "$IMPL" != "0x0000000000000000000000000000000000000000" ]; then
    FETCH_ADDR="$IMPL"
    log "    EIP-1967 impl: ${IMPL}"
  fi
  curl -s "https://api.etherscan.io/v2/api?chainid=1&module=contract&action=getsourcecode&address=${FETCH_ADDR}&apikey=${ETHERSCAN_API_KEY}" \
    > "/tmp/etherscan-${NAME}.json"
  python3 <<EOF
import json, os
data = json.load(open('/tmp/etherscan-${NAME}.json'))
r = data['result'][0]
src = r['SourceCode']
out = '${OUTDIR}'
if src.startswith('{{') and src.endswith('}}'):
    src = src[1:-1]
try:
    parsed = json.loads(src)
    sources = parsed.get('sources', {})
    for fname, fc in sources.items():
        full = os.path.join(out, fname)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, 'w') as f:
            f.write(fc.get('content', ''))
    print(f"multi-file: {len(sources)} files")
except json.JSONDecodeError:
    if src:
        with open(os.path.join(out, '${NAME}.sol'), 'w') as f:
            f.write(src)
        print(f"single-file: {len(src)} bytes")
    else:
        print(f"no-source: contract may not be verified")
EOF
}

# IntermediateVaultFactory
fetch_impl_or_proxy_source "0xb5eb1d005e389bef38161691e2083b4d86ff647a" "IntermediateVaultFactory"
SRCDIR="/workspace/twyne-impl-sources/IntermediateVaultFactory"
if [ -d "$SRCDIR/src" ]; then
  run_one_scan "IntermediateVaultFactoryDeep" "0xb5eb1d005e389bef38161691e2083b4d86ff647a" "$SRCDIR/src" "GenericFactory" "1.1"
elif [ -d "$SRCDIR" ] && [ -n "$(find "$SRCDIR" -name '*.sol' 2>/dev/null | head -1)" ]; then
  run_one_scan "IntermediateVaultFactoryDeep" "0xb5eb1d005e389bef38161691e2083b4d86ff647a" "$SRCDIR" "GenericFactory" "1.1"
fi
RC=$?
[ "$RC" -ne 0 ] && exit "$RC"

# VaultManager
fetch_impl_or_proxy_source "0x0acd3a3c8ab6a5f7b5a594c88dfa28999da858ac" "VaultManager"
SRCDIR="/workspace/twyne-impl-sources/VaultManager"
if [ -d "$SRCDIR/src" ]; then
  run_one_scan "VaultManagerDeep" "0x0acd3a3c8ab6a5f7b5a594c88dfa28999da858ac" "$SRCDIR/src" "VaultManager" "1.2"
elif [ -d "$SRCDIR" ] && [ -n "$(find "$SRCDIR" -name '*.sol' 2>/dev/null | head -1)" ]; then
  run_one_scan "VaultManagerDeep" "0x0acd3a3c8ab6a5f7b5a594c88dfa28999da858ac" "$SRCDIR" "VaultManager" "1.2"
fi
RC=$?
[ "$RC" -ne 0 ] && exit "$RC"

# ---------------------------------------------------------------------
# Stage 2: scan Drips current impl (the one we discovered isn't in the
# scope page but IS the impl behind the proxy). Add to allowlist
# on-the-fly via --i-acknowledge-out-of-scope flag.
# ---------------------------------------------------------------------

log "Stage 2: Drips current impl (0x56f2a96...) — using out-of-scope ack"

# Fetch its source
mkdir -p /workspace/drips-impl-sources/RepoDriverCurrent
source /root/solhunt/.env
curl -s "https://api.etherscan.io/v2/api?chainid=1&module=contract&action=getsourcecode&address=0x56f2a96d9f4aa82d76c48ec4c2483f260a965f06&apikey=${ETHERSCAN_API_KEY}" \
  > /tmp/etherscan-RepoDriverCurrent.json
python3 <<'EOF'
import json, os
data = json.load(open('/tmp/etherscan-RepoDriverCurrent.json'))
r = data['result'][0]
src = r['SourceCode']
out = '/workspace/drips-impl-sources/RepoDriverCurrent'
if src.startswith('{{') and src.endswith('}}'):
    src = src[1:-1]
try:
    parsed = json.loads(src)
    sources = parsed.get('sources', {})
    for fname, fc in sources.items():
        full = os.path.join(out, fname)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, 'w') as f:
            f.write(fc.get('content', ''))
    print(f"multi-file: {len(sources)} files")
except json.JSONDecodeError:
    if src:
        with open(os.path.join(out, 'RepoDriverCurrent.sol'), 'w') as f:
            f.write(src)
        print(f"single-file: {len(src)} bytes")
EOF

# Scan with proxy as target, current-impl source override.
# Note: the proxy 0x770023d5... IS in the allowlist already.
SRCDIR="/workspace/drips-impl-sources/RepoDriverCurrent/src"
[ ! -d "$SRCDIR" ] && SRCDIR="/workspace/drips-impl-sources/RepoDriverCurrent"
run_one_scan "DripsRepoDriverCurrent" "0x770023d55d09a9c110694827f1a6b32d5c2b373e" "$SRCDIR" "RepoDriver" "2.1"
RC=$?
[ "$RC" -ne 0 ] && exit "$RC"

# ---------------------------------------------------------------------
# Stage 3: /codex-recommended fresh programs
# (Loaded from next-programs.json populated by /codex outside-voice.
# If file doesn't exist yet, log it and proceed to chain end.)
# ---------------------------------------------------------------------

if [ -f "$NEXT_PROGRAMS_JSON" ]; then
  log "Stage 3: /codex-recommended fresh programs"
  python3 -c "
import json
data = json.load(open('$NEXT_PROGRAMS_JSON'))
for prog in data.get('programs', []):
    name = prog.get('name','?')
    print(f'PROG|{name}')
    for tgt in prog.get('targets', []):
        print(f'  TGT|{tgt[\"name\"]}|{tgt[\"address\"]}')
" | while IFS='|' read -r kind a b; do
    case "$kind" in
      PROG) log "  --- ${a} ---" ;;
      "  TGT") run_one_scan "$a" "$b" "" "" "3.${a}" ;;
    esac
    RC=$?
    [ "$RC" -ne 0 ] && exit "$RC"
  done
else
  log "Stage 3 skipped — no next-programs.json found yet (codex may still be researching)"
fi

# ---------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------

CURRENT_STATUS=$(cat "${META_DIR}/STATUS" 2>/dev/null || echo "RUNNING")
[ "$CURRENT_STATUS" = "RUNNING" ] && write_status "NO_FIND"

log "autonomous chain finished — status: $(cat ${META_DIR}/STATUS)"
log "Total elapsed: $(($(date +%s) - TOTAL_START))s"
log "Findings bundles in /root/solhunt/findings/ (read README.md in any newly-created bundle)"

if [ -f "${META_DIR}/FOUND_AT" ]; then
  log "FINDING BUNDLE: $(cat ${META_DIR}/FOUND_AT)"
  log "DO NOT SUBMIT WITHOUT HUMAN REVIEW — every Drips/Twyne find tonight has been false-positive on review"
fi

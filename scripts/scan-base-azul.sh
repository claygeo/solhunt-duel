#!/bin/bash
# scan-base-azul.sh
#
# Base Azul Immunefi audit comp scan harness. Modeled on scan-codex-twyne.sh.
#
# !!! DOES NOT RUN BY DEFAULT !!!
# This script is BLOCKED until the Base Sepolia plumbing is patched. See
# findings/base-azul-scope.json fitAssessment.blockers for why. To intentionally
# bypass the block (after the patches land), set BASE_AZUL_BYPASS_BLOCK=1.
#
# Why blocked:
#   1. src/ingestion/etherscan.ts is invoked with chainId=1 (Ethereum mainnet)
#      from src/index.ts:272. Base Sepolia (84532) sources cannot be fetched
#      without a code change.
#   2. ETH_RPC_URL is hardcoded as the anvil fork target. Base Sepolia anvil
#      fork requires BASE_SEPOLIA_RPC_URL (or equivalent). The --chain flag is
#      just a label; it does not change the RPC.
#
# Strategy when unblocked: scan exactly ONE target — TEEProverRegistryImpl —
# the only clean access-control fit in scope. The remaining contracts are
# proof-verification, AWS Nitro CBOR, and dispute-game timing — outside
# solhunt's benchmark distribution.
#
# CRITICAL: this is Base Sepolia testnet, not mainnet. Sandbox forks must
# point at Base Sepolia RPC, not Ethereum mainnet, or the scan will produce
# fabricated findings.

set -u
set -o pipefail

cd "$(dirname "$0")/.."

if [ "${BASE_AZUL_BYPASS_BLOCK:-0}" != "1" ]; then
  cat <<'EOF' >&2
[scan-base-azul] BLOCKED — chainId/RPC plumbing not yet patched for Base Sepolia.

Required patches before running:
  1. src/ingestion/etherscan.ts: thread chainId from --chain CLI flag down to
     fetchContractSource(target, key, chainId). Map "base-sepolia" -> 84532.
  2. src/index.ts:272: pass options.chain through instead of hardcoded `1`.
  3. Add BASE_SEPOLIA_RPC_URL handling (e.g. via --rpc-url override or chain-
     specific env var). The sandbox manager forks ETH_RPC_URL — needs to switch
     based on options.chain.
  4. (Optional) Add a --chain-id override to scan command for cases where the
     chain name doesn't map cleanly.

After the patches land, run:
  BASE_AZUL_BYPASS_BLOCK=1 bash scripts/scan-base-azul.sh

To override this block without patches (NOT RECOMMENDED — sources will fail to
fetch and you will burn Max budget on errors), set BASE_AZUL_BYPASS_BLOCK=1.

See findings/base-azul-scope.json for full scope + fit assessment.
EOF
  exit 2
fi

PER_SCAN_TIMEOUT="${PER_SCAN_TIMEOUT:-1500}"   # 25 min per scan
TOTAL_TIMEOUT="${TOTAL_TIMEOUT:-3600}"          # 1h cap (1-2 scans)
START_TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
META_DIR="findings/base-azul-${START_TS}"
mkdir -p "${META_DIR}"
LOG="${META_DIR}/run.log"

log() {
  echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "${LOG}"
}

# Strategy: ONE target first (TEEProverRegistryImpl, the only access-control
# fit). If clean, optionally try DelayedWETHImpl (bond/withdrawal — possible
# reentrancy surface). Stop on first found=true. Skip everything else —
# AggregateVerifier (~850 LoC ZK+TEE), NitroEnclaveVerifier (CBOR/cert chain),
# OptimismPortal2 (scope-ambiguous OP Stack), AnchorStateRegistry (cross-
# protocol oracle) — all outside solhunt's benchmark distribution.
TARGETS=(
  "TEEProverRegistryImpl|0xF9Ab55c35cE7Fb183A50E611B63558499130D849"
  "DelayedWETHImpl|0xbbFDB04121B74D8ae7F53fD5238DDEf133AB977a"
)

# Default to single-target sweep. Override via SCAN_MODE=all to attempt both.
SCAN_MODE="${SCAN_MODE:-single}"
if [ "$SCAN_MODE" = "single" ]; then
  TARGETS=("${TARGETS[0]}")
fi

write_status() { echo "$1" > "${META_DIR}/STATUS"; }

cleanup_stale_containers() {
  local stale
  stale=$(docker ps --filter "name=solhunt-scan-" --filter "status=running" --format "{{.ID}}|{{.Status}}" | awk -F'|' '$2 ~ /(hour|day|week)/ {print $1}')
  if [ -n "$stale" ]; then
    log "reaping stale solhunt-scan containers: $(echo "$stale" | wc -l)"
    echo "$stale" | xargs -r docker rm -f >/dev/null 2>&1 || true
  fi
}

wipe_staging() {
  rm -rf /workspace/harness-red/scan/{src,test,out,cache} 2>/dev/null || true
}

write_status "RUNNING"
log "base-azul scan started — ${#TARGETS[@]} targets, per-scan ${PER_SCAN_TIMEOUT}s"
log "chain: base-sepolia (84532) — verify ETH_RPC_URL is Base Sepolia, not mainnet"
log "rationale: TEEProverRegistry first (access-control = solhunt's 75% zone)"
log "DO NOT submit any finding without /codex validation + human review"

TOTAL_START=$(date +%s)
FOUND_AT=""

for i in "${!TARGETS[@]}"; do
  ENTRY="${TARGETS[$i]}"
  NAME="${ENTRY%%|*}"
  ADDR="${ENTRY##*|}"
  IDX=$((i + 1))
  PER_LOG="${META_DIR}/${IDX}-${NAME}.log"
  EXIT_FILE="${META_DIR}/${IDX}-${NAME}.exit"

  ELAPSED=$(($(date +%s) - TOTAL_START))
  REMAINING=$((TOTAL_TIMEOUT - ELAPSED))
  if [ "$REMAINING" -le 60 ]; then
    log "TOTAL_TIMEOUT exhausted (elapsed ${ELAPSED}s) — stopping"
    write_status "TOTAL_TIMEOUT"
    break
  fi

  EFFECTIVE_TIMEOUT=$PER_SCAN_TIMEOUT
  [ "$REMAINING" -lt "$EFFECTIVE_TIMEOUT" ] && EFFECTIVE_TIMEOUT=$REMAINING

  log "[$IDX/${#TARGETS[@]}] scanning ${NAME} (${ADDR}) — budget ${EFFECTIVE_TIMEOUT}s"
  cleanup_stale_containers
  wipe_staging

  SCAN_START=$(date +%s)
  set +e
  timeout "$EFFECTIVE_TIMEOUT" npx tsx src/index.ts scan "$ADDR" \
    --chain base-sepolia \
    --via-claude-cli \
    --findings-dir "./findings" \
    > "$PER_LOG" 2>&1
  EXIT=$?
  set -e
  SCAN_DURATION=$(($(date +%s) - SCAN_START))

  echo "$EXIT" > "$EXIT_FILE"
  log "[$IDX/${#TARGETS[@]}] ${NAME} done — exit=${EXIT}, ${SCAN_DURATION}s"

  if grep -qi -E "(rate.?limit|5.?hour.?limit|weekly.?limit|usage.?limit|claude_ai_max)" "$PER_LOG" 2>/dev/null; then
    if grep -q '"is_error":true' "$PER_LOG" 2>/dev/null && grep -qi 'rate.*limit' "$PER_LOG" 2>/dev/null; then
      log "RATE_LIMITED (hard block) detected — stopping"
      write_status "RATE_LIMITED"
      break
    else
      log "rate_limit_event seen but soft (status=allowed) — continuing"
    fi
  fi

  RECENT=$(ls -dt findings/2*-* 2>/dev/null | head -1 || true)
  if [ -n "${RECENT:-}" ] && [ -f "${RECENT}/report.json" ]; then
    if grep -q '"found": true' "${RECENT}/report.json" 2>/dev/null; then
      log "FOUND TRUE in ${RECENT}/report.json — stopping for human review"
      FOUND_AT="${RECENT}"
      write_status "FOUND"
      break
    fi
  fi
done

CURRENT_STATUS=$(cat "${META_DIR}/STATUS" 2>/dev/null || echo "UNKNOWN")
[ "$CURRENT_STATUS" = "RUNNING" ] && write_status "NO_FIND"

log "base-azul scan finished — final status: $(cat ${META_DIR}/STATUS)"
log "summary:"
for f in "${META_DIR}"/*.exit; do
  [ -f "$f" ] || continue
  base=$(basename "$f" .exit)
  exit_code=$(cat "$f")
  log "  ${base}: exit ${exit_code}"
done

if [ -n "$FOUND_AT" ]; then
  log "FINDING BUNDLE: ${FOUND_AT}"
  log "DO NOT SUBMIT — read ${FOUND_AT}/README.md, run /codex challenge on the exploit, then human-verify on Base Sepolia testnet fork before any Immunefi submission."
elif [ "$CURRENT_STATUS" = "NO_FIND" ]; then
  log "Target(s) clean. Base Azul fit was low (TEE/ZK proof system, not solhunt's strong zone). Pivot to next program."
fi

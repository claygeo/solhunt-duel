#!/bin/bash
# scan-twyne-impls.sh
#
# Pass 2 on Twyne: previous sweep only saw proxy stubs from Etherscan
# because the in-scope addresses are ERC1967 proxies. Fetched the actual
# verified impl source via Etherscan and now scan with --source-file
# pointing at the impl, while keeping the PROXY as the scan target so
# Foundry tests run against the live proxy address.
#
# Why the proxy-as-target: the deliverable for Immunefi is a working PoC
# at the proxy (where users actually transact). The impl source only
# matters for the agent's reasoning.

set -u
set -o pipefail

cd "$(dirname "$0")/.."

PER_SCAN_TIMEOUT="${PER_SCAN_TIMEOUT:-1500}"
TOTAL_TIMEOUT="${TOTAL_TIMEOUT:-3600}"
START_TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
META_DIR="findings/twyne-impls-${START_TS}"
mkdir -p "${META_DIR}"
LOG="${META_DIR}/run.log"

log() { echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "${LOG}"; }

# Scan target = PROXY address, source override = impl directory.
# Format: Name|ProxyAddr|ImplSourceDir|MainContractName
TARGETS=(
  "CollateralVaultFactory|0xa1517cce0be75700a8838ea1cee0dc383cd3a332|/workspace/twyne-impl-sources/CollateralVaultFactory/src|CollateralVaultFactory"
  "AaveV3ATokenWrapper|0xfaba8f777996c0c28fe9e6554d84cb30ca3e1881|/workspace/twyne-impl-sources/AaveV3ATokenWrapper/src|AaveV3ATokenWrapper"
)

write_status() { echo "$1" > "${META_DIR}/STATUS"; }

cleanup_stale_containers() {
  local stale
  stale=$(docker ps --filter "name=solhunt-scan-" --filter "status=running" --format "{{.ID}}|{{.Status}}" | awk -F'|' '$2 ~ /(hour|day|week)/ {print $1}')
  [ -n "$stale" ] && echo "$stale" | xargs -r docker rm -f >/dev/null 2>&1 || true
}

wipe_staging() {
  rm -rf /workspace/harness-red/scan/{src,test,out,cache} 2>/dev/null || true
}

write_status "RUNNING"
log "twyne-impls scan started — ${#TARGETS[@]} targets, --source-file override"

TOTAL_START=$(date +%s)
FOUND_AT=""

for i in "${!TARGETS[@]}"; do
  IFS='|' read -r NAME PROXY SRCDIR CONTRACT <<< "${TARGETS[$i]}"
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

  log "[$IDX/${#TARGETS[@]}] scanning ${NAME} (proxy ${PROXY}, impl src=${SRCDIR}) — budget ${EFFECTIVE_TIMEOUT}s"
  cleanup_stale_containers
  wipe_staging

  SCAN_START=$(date +%s)
  set +e
  timeout "$EFFECTIVE_TIMEOUT" npx tsx src/index.ts scan "$PROXY" \
    --via-claude-cli \
    --source-file "$SRCDIR" \
    --contract-name "$CONTRACT" \
    --findings-dir "./findings" \
    > "$PER_LOG" 2>&1
  EXIT=$?
  set -e
  SCAN_DURATION=$(($(date +%s) - SCAN_START))

  echo "$EXIT" > "$EXIT_FILE"
  log "[$IDX/${#TARGETS[@]}] ${NAME} done — exit=${EXIT}, ${SCAN_DURATION}s"

  if grep -qi -E "(rate.?limit|usage.?limit)" "$PER_LOG" 2>/dev/null; then
    if grep -q '"is_error":true' "$PER_LOG" 2>/dev/null && grep -qi 'rate.*limit' "$PER_LOG" 2>/dev/null; then
      log "RATE_LIMITED (hard block) — stopping"
      write_status "RATE_LIMITED"
      break
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

log "twyne-impls scan finished — final status: $(cat ${META_DIR}/STATUS)"
log "summary:"
for f in "${META_DIR}"/*.exit; do
  [ -f "$f" ] || continue
  base=$(basename "$f" .exit)
  exit_code=$(cat "$f")
  log "  ${base}: exit ${exit_code}"
done

if [ -n "$FOUND_AT" ]; then
  log "FINDING BUNDLE: ${FOUND_AT}"
  log "DO NOT SUBMIT WITHOUT HUMAN REVIEW + /codex VALIDATION"
fi

#!/bin/bash
# scan-codex-twyne.sh
#
# Per /codex outside-voice verdict 2026-04-27 (confidence 5/10 single, 6/10 sweep):
#   Sweep 3 native-Twyne targets in priority order:
#     1. Collateral Vault Factory (top pick, factory access-control + logic)
#     2. Intermediate Vault Factory (factory runner-up)
#     3. awstETH Wrapper (math/share-accounting territory)
#   Stop on first found=true. Skip the stateful Euler/Aave operators —
#   solhunt's weakest zone, won't score.

set -u
set -o pipefail

cd "$(dirname "$0")/.."

PER_SCAN_TIMEOUT="${PER_SCAN_TIMEOUT:-1500}"   # 25 min per scan
TOTAL_TIMEOUT="${TOTAL_TIMEOUT:-5400}"          # 1.5h hard cap (3 scans + buffer)
START_TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
META_DIR="findings/codex-twyne-${START_TS}"
mkdir -p "${META_DIR}"
LOG="${META_DIR}/run.log"

log() {
  echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "${LOG}"
}

# /codex's three picks. Tier 1 = top pick + runner-up #1 (both factories,
# native access-control surface). Tier 2 = wrapper (math territory).
TARGETS=(
  "CollateralVaultFactory|0xa1517cce0be75700a8838ea1cee0dc383cd3a332"
  "IntermediateVaultFactory|0xb5eb1d005e389bef38161691e2083b4d86ff647a"
  "awstETHWrapper|0xfaba8f777996c0c28fe9e6554d84cb30ca3e1881"
)

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
log "codex-twyne scan started — ${#TARGETS[@]} targets, per-scan ${PER_SCAN_TIMEOUT}s"
log "rationale: factories + wrapper (native Twyne logic, codex top pick path)"

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
    --via-claude-cli \
    --findings-dir "./findings" \
    > "$PER_LOG" 2>&1
  EXIT=$?
  set -e
  SCAN_DURATION=$(($(date +%s) - SCAN_START))

  echo "$EXIT" > "$EXIT_FILE"
  log "[$IDX/${#TARGETS[@]}] ${NAME} done — exit=${EXIT}, ${SCAN_DURATION}s"

  if grep -qi -E "(rate.?limit|5.?hour.?limit|weekly.?limit|usage.?limit|claude_ai_max)" "$PER_LOG" 2>/dev/null; then
    # Distinguish informational rate_limit_event (status: allowed) from real
    # blocks. Real block = is_error=true in the result event.
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

log "codex-twyne scan finished — final status: $(cat ${META_DIR}/STATUS)"
log "summary:"
for f in "${META_DIR}"/*.exit; do
  [ -f "$f" ] || continue
  base=$(basename "$f" .exit)
  exit_code=$(cat "$f")
  log "  ${base}: exit ${exit_code}"
done

if [ -n "$FOUND_AT" ]; then
  log "FINDING BUNDLE: ${FOUND_AT}"
  log "DO NOT SUBMIT WITHOUT HUMAN REVIEW + /codex VALIDATION — read ${FOUND_AT}/README.md"
elif [ "$CURRENT_STATUS" = "NO_FIND" ]; then
  log "All 3 native-Twyne targets clean. Twyne held — pivot to next program (per codex's runner-up search)."
fi

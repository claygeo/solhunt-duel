#!/bin/bash
# scan-codex-tier-e.sh
#
# Per /codex outside-voice verdict 2026-04-27 (confidence 7/10):
#   Scan the LEAST-audited Drips contracts (Caller + RepoDriverAnyApiOperator)
#   instead of sweeping all 12. Caller is meta-tx batching (access control,
#   solhunt's 75% zone). AnyApiOperator is Chainlink integration (logic
#   errors, 60% zone). If both clean, pivot to Twyne.
#
# Why this and not meta-live-scan.sh full sweep: heavily-audited surfaces are
# a sunk-cost trap for an LLM scanner. Concentrate budget on the underbelly.

set -u
set -o pipefail

cd "$(dirname "$0")/.."

PER_SCAN_TIMEOUT="${PER_SCAN_TIMEOUT:-1500}"   # 25 min per scan
TOTAL_TIMEOUT="${TOTAL_TIMEOUT:-3600}"          # 1h hard cap (2 scans + buffer)
START_TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
META_DIR="findings/codex-tier-e-${START_TS}"
mkdir -p "${META_DIR}"
LOG="${META_DIR}/run.log"

log() {
  echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "${LOG}"
}

# /codex's two picks, in priority order. Caller first (highest expected hit
# rate per codex: meta-tx batching has classic auth-batching patterns).
TARGETS=(
  "Caller|0x60f25ac5f289dc7f640f948521d486c964a248e5"
  "RepoDriverAnyApiOperator|0xa928d4b087ad35c46ba83331d8eeddb83152319b"
)

write_status() {
  echo "$1" > "${META_DIR}/STATUS"
}

cleanup_stale_containers() {
  local stale
  stale=$(docker ps --filter "name=solhunt-scan-" --filter "status=running" --format "{{.ID}}|{{.Status}}" | awk -F'|' '$2 ~ /(hour|day|week)/ {print $1}')
  if [ -n "$stale" ]; then
    log "reaping stale solhunt-scan containers: $(echo "$stale" | wc -l)"
    echo "$stale" | xargs -r docker rm -f >/dev/null 2>&1 || true
  fi
}

# Wipe staging dir between targets — we caught one false positive last run
# from leftover Abracadabra source. Belt-and-suspenders even though
# loop-via-claude-cli now does this internally.
wipe_staging() {
  rm -rf /workspace/harness-red/scan/{src,test,out,cache} 2>/dev/null || true
}

write_status "RUNNING"
log "codex-tier-e scan started — ${#TARGETS[@]} targets, per-scan ${PER_SCAN_TIMEOUT}s"
log "rationale: target the LEAST-audited Drips contracts (codex verdict 7/10)"

TOTAL_START=$(date +%s)
FOUND_AT=""
RATE_LIMITED=0

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
    log "RATE_LIMITED detected — stopping"
    write_status "RATE_LIMITED"
    RATE_LIMITED=1
    break
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
if [ "$CURRENT_STATUS" = "RUNNING" ]; then
  write_status "NO_FIND"
fi

log "codex-tier-e scan finished — final status: $(cat ${META_DIR}/STATUS)"
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
  log "Both Drips underbelly targets clean. Per /codex verdict: pivot to Twyne next."
fi

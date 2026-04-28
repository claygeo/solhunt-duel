#!/bin/bash
# scan-codex-tier-n.sh
#
# Per outside-voice verdict 2026-04-27 evening (agentId a007685eaf80410ba,
# confidence 8/10):
#   Pivot off audit-saturated Drips/Twyne. Hit newer Immunefi listings
#   (Parallel V3, Oct 2025 listing) and a multi-market protocol with
#   past-exploit history (Inverse Finance FiRM). All eth mainnet
#   (no v1.2 multichain needed).
#
# Why this and not more Drips/Twyne: 0/2 FP rate so far is on heavily-
# audited mainstays. Continuing the same pattern is a sunk-cost trap.
# These 5 targets are real solhunt-strong-zone surfaces (access control,
# borrow/lend accounting, custom collateral logic) on protocols with
# fresher attack surfaces.
#
# IMPORTANT: All 5 addresses ARE in solhunt's allowlist (extended in
# this PR via src/safety/in-scope.ts). No --i-acknowledge-out-of-scope
# needed. Inverse FiRM and Parallel V3 are both Immunefi-listed bounties
# in our allowlist.
#
# Bounty programs:
#   - Inverse Finance: https://immunefi.com/bug-bounty/inversefinance/
#   - Parallel Protocol: https://immunefi.com/bug-bounty/parallel/

set -u
set -o pipefail

cd "$(dirname "$0")/.."

PER_SCAN_TIMEOUT="${PER_SCAN_TIMEOUT:-1500}"   # 25 min per scan
TOTAL_TIMEOUT="${TOTAL_TIMEOUT:-9000}"          # 2.5h hard cap (5 scans + buffer)
START_TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
META_DIR="findings/codex-tier-n-${START_TS}"
mkdir -p "${META_DIR}"
LOG="${META_DIR}/run.log"

log() {
  echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "${LOG}"
}

# Priority order: highest expected signal first. FiRM CRV Market is the
# bullseye (past-exploit team, standalone Market with full surface);
# Parallel Swapper is the freshest surface; FiRM-WETH/cvxCRV are
# cross-validation; Parallel Getters last (low depth).
TARGETS=(
  "FiRM-CRV-Market|0x63fAd99705a255fE2D500e498dbb3A9aE5AA1Ee8"
  "Parallel-V3-Swapper|0x506Ba37aa8e265bE445913B9c4080852277f3c5a"
  "FiRM-WETH-Market|0x63df5e23db45a2066508318f172ba45b9cd37035"
  "FiRM-cvxCRV-Market|0x3474ad0e3a9775c9F68B415A7a9880B0CAB9397a"
  "Parallel-V3-Getters|0xa9C21Cf291ad935e0C9B05a55A42254fB159181d"
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

wipe_staging() {
  rm -rf /workspace/harness-red/scan/{src,test,out,cache} 2>/dev/null || true
}

write_status "RUNNING"
log "codex-tier-n scan started — ${#TARGETS[@]} targets, per-scan ${PER_SCAN_TIMEOUT}s, total ${TOTAL_TIMEOUT}s"
log "rationale: pivot off audit-saturated Drips/Twyne, target newer Immunefi listings + past-exploit teams"

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

log "codex-tier-n scan finished — final status: $(cat ${META_DIR}/STATUS)"
log "summary:"
for f in "${META_DIR}"/*.exit; do
  [ -f "$f" ] || continue
  base=$(basename "$f" .exit)
  exit_code=$(cat "$f")
  log "  ${base}: exit ${exit_code}"
done

if [ -n "$FOUND_AT" ]; then
  log "FINDING BUNDLE: ${FOUND_AT}"
  log "DO NOT SUBMIT WITHOUT HUMAN REVIEW + adversarial validation — read ${FOUND_AT}/README.md"
  log "Apply false-positive checklist BEFORE any submission:"
  log "  1. cheatcode-bypass? 2. permanent pause? 3. impl-not-proxy?"
  log "  4. value-at-risk realistic? 5. is this the deposit primitive (skim/pull/etc)?"
  log "  6. EVK-style donation pattern (Twyne FP shape)?"
elif [ "$CURRENT_STATUS" = "NO_FIND" ]; then
  log "All 5 Tier-N targets clean. If 0 finds across this batch + Tier-E, the kill criterion's"
  log "Layer 2 (15 contiguous zero-hits) is at 8/15. Pivot consideration triggers at 15."
fi

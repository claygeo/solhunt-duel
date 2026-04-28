#!/bin/bash
# scan-dm-arb.sh
#
# Cold-DM scan sweep — Arbitrum targets. Requires v1.2 multichain
# (src/config/chains.ts shipped 2026-04-27 evening). REQUIRES the
# ARB_RPC_URL env var to be set.
#
# Targets pulled from findings/dm-targets.json (verified addresses):
#   - D2 Finance ETH++ vault   (0x27D22Eb71f00495Eccc89Bb02c2B68E6988C6A42)
#   - Kresko Diamond           (0x0000000000177abD99485DCaea3eFaa91db3fe72)
#   - Y2K Finance V2 Carousel  (0xC3179AC01b7D68aeD4f27a19510ffe2bfb78Ab3e)
#
# Usage:
#   export ARB_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/...
#   bash scripts/scan-dm-arb.sh
#
# Optional env:
#   PER_SCAN_TIMEOUT=1500    per-scan budget (sec, default 25min)
#   TOTAL_TIMEOUT=5400       total budget (sec, default 90min for 3 + buffer)

set -u
set -o pipefail

cd "$(dirname "$0")/.."

PER_SCAN_TIMEOUT="${PER_SCAN_TIMEOUT:-1500}"
TOTAL_TIMEOUT="${TOTAL_TIMEOUT:-5400}"
START_TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
META_DIR="findings/dm-arb-${START_TS}"
mkdir -p "${META_DIR}"
LOG="${META_DIR}/run.log"

log() {
  echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "${LOG}"
}

# Pre-flight: resolve ARB_RPC_URL with a public-RPC fallback.
# Cold-DM scans target "latest" state, no archive state needed, so a public
# Arbitrum RPC is acceptable. For grant-quality scans or contests, swap in
# a paid Alchemy / QuickNode / Tenderly key.
if [ -z "${ARB_RPC_URL:-}" ]; then
  export ARB_RPC_URL="https://arb1.arbitrum.io/rpc"
  log "WARN: ARB_RPC_URL not set, using public fallback ${ARB_RPC_URL}"
  log "      For better reliability, set ARB_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/<key>"
fi

TARGETS=(
  "D2-ETH++|0x27D22Eb71f00495Eccc89Bb02c2B68E6988C6A42|d2-finance"
  "Kresko-Diamond|0x0000000000177abD99485DCaea3eFaa91db3fe72|kresko"
  "Y2K-CarouselFactory|0xC3179AC01b7D68aeD4f27a19510ffe2bfb78Ab3e|y2k-finance"
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
log "scan-dm-arb started — ${#TARGETS[@]} Arbitrum targets, per-scan ${PER_SCAN_TIMEOUT}s"
log "rationale: cold-DM outreach scan, Arbitrum (chainId 42161) via v1.2 multichain"
log "ARB_RPC_URL: ${ARB_RPC_URL:0:40}... (truncated)"

cleanup_stale_containers

TOTAL_START=$(date +%s)

for i in "${!TARGETS[@]}"; do
  ENTRY="${TARGETS[$i]}"
  NAME="${ENTRY%%|*}"
  rest="${ENTRY#*|}"
  ADDR="${rest%%|*}"
  SLUG="${rest#*|}"
  IDX=$((i + 1))
  PER_LOG="${META_DIR}/${IDX}-${SLUG}.log"
  EXIT_FILE="${META_DIR}/${IDX}-${SLUG}.exit"

  ELAPSED=$(($(date +%s) - TOTAL_START))
  REMAINING=$((TOTAL_TIMEOUT - ELAPSED))
  if [ "$REMAINING" -le 60 ]; then
    log "TOTAL_TIMEOUT exhausted (elapsed ${ELAPSED}s) — stopping"
    write_status "TOTAL_TIMEOUT"
    break
  fi

  EFFECTIVE_TIMEOUT=$PER_SCAN_TIMEOUT
  [ "$REMAINING" -lt "$EFFECTIVE_TIMEOUT" ] && EFFECTIVE_TIMEOUT=$REMAINING

  log "[$IDX/${#TARGETS[@]}] scanning ${NAME} (${ADDR}) on Arbitrum — budget ${EFFECTIVE_TIMEOUT}s"
  wipe_staging

  SCAN_START=$(date +%s)
  set +e
  timeout "$EFFECTIVE_TIMEOUT" npx tsx src/index.ts scan "$ADDR" \
    --chain arbitrum \
    --via-claude-cli \
    --i-acknowledge-out-of-scope \
    > "$PER_LOG" 2>&1
  EXIT=$?
  set -e
  SCAN_DURATION=$(($(date +%s) - SCAN_START))

  echo "$EXIT" > "$EXIT_FILE"
  log "[$IDX/${#TARGETS[@]}] ${NAME} done — exit=${EXIT}, ${SCAN_DURATION}s"

  # Word-boundary regex (avoids the 0xd577*429*db653-style address false-match)
  if grep -qiE '\brate.?limit\b|\b429\b[^a-fA-F0-9]|\bmax.{0,5}usage\b|\bToo Many Requests\b' "$PER_LOG" 2>/dev/null; then
    log "rate-limit detected, halting sweep early"
    write_status "RATE_LIMITED"
    exit 5
  fi

  RECENT=$(ls -dt findings/2*-* 2>/dev/null | head -1 || true)
  if [ -n "${RECENT:-}" ] && [ -f "${RECENT}/report.json" ]; then
    if grep -q '"found": true' "${RECENT}/report.json" 2>/dev/null; then
      log "FOUND TRUE in ${RECENT}/report.json — stopping for human review"
      write_status "FOUND"
      log "DO NOT SUBMIT WITHOUT FORENSIC REVIEW + adversarial validation."
      log "False-positive checklist (per RepoDriver + Twyne lessons):"
      log "  1. cheatcode-bypass? 2. permanent pause? 3. impl-not-proxy?"
      log "  4. value-at-risk realistic? 5. is this the deposit primitive?"
      log "  6. EVK-style donation pattern?"
      break
    fi
  fi
done

CURRENT_STATUS=$(cat "${META_DIR}/STATUS" 2>/dev/null || echo "UNKNOWN")
if [ "$CURRENT_STATUS" = "RUNNING" ]; then
  write_status "NO_FIND"
fi

log "scan-dm-arb finished — final status: $(cat ${META_DIR}/STATUS)"
log "summary:"
for f in "${META_DIR}"/*.exit; do
  [ -f "$f" ] || continue
  base=$(basename "$f" .exit)
  exit_code=$(cat "$f")
  log "  ${base}: exit ${exit_code}"
done

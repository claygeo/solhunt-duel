#!/bin/bash
# scan-dm-eth.sh
#
# Cold-DM scan sweep — Ethereum mainnet targets only.
# Runs serially after Twyne completes (no concurrent staging-dir
# contention per TODOS.md P1 #7).
#
# Targets:
#   - Sturdy V2 SturdyPairRegistry (0xd577429db653Cd20EFFCD4977B2B41A6Fd794A3b)
#   - Resonate (Revest) main protocol contract (0x80ca847618030bc3e26ad2c444fd007279daf50a)
#
# Arbitrum targets (D2, Kresko, Y2K) are blocked behind v1.2
# multichain. Run via scripts/scan-dm-arb.sh after v1.2 lands.
#
# Usage: bash scripts/scan-dm-eth.sh
#   Optional env:
#     PER_SCAN_TIMEOUT=1500   per-scan budget (sec, default 25min)
#     TOTAL_TIMEOUT=4200      total budget (sec, default 70min)

set -u
set -o pipefail

cd "$(dirname "$0")/.."

PER_SCAN_TIMEOUT="${PER_SCAN_TIMEOUT:-1500}"
TOTAL_TIMEOUT="${TOTAL_TIMEOUT:-4200}"
START_TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
META_DIR="findings/dm-eth-${START_TS}"
mkdir -p "${META_DIR}"
LOG="${META_DIR}/run.log"

log() {
  echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "${LOG}"
}

# Eth mainnet targets — per findings/dm-targets.json
TARGETS=(
  "SturdyPairRegistry|0xd577429db653Cd20EFFCD4977B2B41A6Fd794A3b|sturdy-v2"
  "Resonate|0x80ca847618030bc3e26ad2c444fd007279daf50a|resonate"
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

check_total_budget() {
  local now elapsed
  now=$(date +%s)
  elapsed=$((now - SCRIPT_START))
  if [ "$elapsed" -ge "$TOTAL_TIMEOUT" ]; then
    log "total-budget timeout reached ($elapsed sec >= $TOTAL_TIMEOUT)"
    write_status "TOTAL_TIMEOUT"
    exit 4
  fi
}

main() {
  SCRIPT_START=$(date +%s)
  log "scan-dm-eth started — ${#TARGETS[@]} targets, per-scan ${PER_SCAN_TIMEOUT}s, total ${TOTAL_TIMEOUT}s"
  log "rationale: cold-DM outreach scan, Ethereum mainnet only"

  cleanup_stale_containers

  local idx=0
  for target_spec in "${TARGETS[@]}"; do
    idx=$((idx + 1))
    local name address slug
    name="${target_spec%%|*}"
    rest="${target_spec#*|}"
    address="${rest%%|*}"
    slug="${rest#*|}"

    check_total_budget

    log "[${idx}/${#TARGETS[@]}] scanning ${name} (${address}) — slug=${slug} budget ${PER_SCAN_TIMEOUT}s"

    wipe_staging

    local scan_log="${META_DIR}/${idx}-${slug}.log"
    local exit_path="${META_DIR}/${idx}-${slug}.exit"

    # --i-acknowledge-out-of-scope is correct here: cold-DM targets
    # are NOT in any bug-bounty allowlist, but reading public bytecode
    # + running static analysis on a public chain is legal. Output
    # is for cold-pitch use only, NOT for submission.
    timeout "${PER_SCAN_TIMEOUT}" \
      npx tsx src/index.ts scan "${address}" \
      --via-claude-cli \
      --i-acknowledge-out-of-scope \
      > "${scan_log}" 2>&1
    local rc=$?
    echo "$rc" > "$exit_path"

    log "[${idx}/${#TARGETS[@]}] ${name} exited rc=${rc}"

    # Quick verdict scan
    if grep -q '"found"[[:space:]]*:[[:space:]]*true' "$scan_log" 2>/dev/null; then
      log "[${idx}/${#TARGETS[@]}] ${name}: FOUND — review bundle in findings/<ts>-${name}/"
    elif grep -q '"found"[[:space:]]*:[[:space:]]*false' "$scan_log" 2>/dev/null; then
      log "[${idx}/${#TARGETS[@]}] ${name}: clean scan (found=false)"
    else
      log "[${idx}/${#TARGETS[@]}] ${name}: unclear verdict (check $scan_log)"
    fi

    # Rate-limit awareness — back off if Max says so
    if grep -qiE 'rate.?limit|429|max.{0,5}usage' "$scan_log" 2>/dev/null; then
      log "rate-limit detected, halting sweep early"
      write_status "RATE_LIMITED"
      exit 5
    fi
  done

  write_status "DONE"
  log "scan-dm-eth complete — ${idx} targets scanned"
}

main

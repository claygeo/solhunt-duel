#!/bin/bash
# meta-live-scan.sh
#
# Loops solhunt --via-claude-cli across prioritized in-scope Immunefi targets.
# Stops on: first found=true, Max rate-limit, or 3 consecutive errors.
#
# Designed to run inside a detached tmux session on the VPS while Clayton's
# laptop is closed. Hard rails: never auto-submit, always queue findings for
# human review, strict per-scan + total budget caps.
#
# Per-contract budget: 25 min wall clock (overridable via PER_SCAN_TIMEOUT).
# Total budget: 5 hours wall clock (overridable via TOTAL_TIMEOUT).
#
# Output:
#   findings/meta-run-<ts>/
#     run.log              full script log
#     <i>-<contract>.log   per-scan stdout/stderr
#     <i>-<contract>.exit  per-scan exit code
#     STATUS               final disposition (FOUND | NO_FIND | RATE_LIMITED | ERROR_BUDGET | TOTAL_TIMEOUT)
#   findings/<iso-ts>-<contract>/  — bundle from solhunt itself when --via-claude-cli used
#
# After laptop wakes: cat findings/meta-run-*/STATUS to see disposition.

set -u
set -o pipefail
# Note: deliberately NOT using `set -e` because we WANT to handle individual
# scan failures (timeout, exit!=0) without aborting the whole sweep. The
# explicit `set +e` / `set -e` block around the npx call is the only place
# we tolerate non-zero exits intentionally.

cd "$(dirname "$0")/.."

PER_SCAN_TIMEOUT="${PER_SCAN_TIMEOUT:-1500}"   # 25 min per scan
TOTAL_TIMEOUT="${TOTAL_TIMEOUT:-18000}"        # 5h total
ERROR_BUDGET="${ERROR_BUDGET:-3}"              # stop after N consecutive errors
# SCAN_MODE controls how many targets we sweep. Default "single" enforces the
# test-1-unit-before-scaling rule on the first attempt. Set SCAN_MODE=all to
# run the full prioritized list (use only after a single scan completes
# cleanly and you've confirmed plumbing).
SCAN_MODE="${SCAN_MODE:-single}"
START_TS="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
META_DIR="findings/meta-run-${START_TS}"
mkdir -p "${META_DIR}"
LOG="${META_DIR}/run.log"

log() {
  echo "[$(date -u +%H:%M:%SZ)] $*" | tee -a "${LOG}"
}

# Priority order — logic contracts first (they have the actual source on
# Etherscan; proxies just return the ManagedProxy stub). Within tier, prefer
# post-audit-cycle modules (RepoDriver / ImmutableSplitsDriver) per the
# /codex outside-voice review.
TARGETS=(
  # tier 1: post-audit-cycle logic contracts
  "RepoDriverLogic|0xfc446db5e1255e837e95db90c818c6feb8e93ab0"
  "ImmutableSplitsDriverLogic|0x2c338cdf00dfd5a9b3b6b0b78bb95352079aaf71"

  # tier 2: post-audit-cycle proxies (recon will dig into the impl)
  "RepoDriver|0x770023d55d09a9c110694827f1a6b32d5c2b373e"
  "ImmutableSplitsDriver|0x1212975c0642b07f696080ec1916998441c2b774"

  # tier 3: core driver logic contracts
  "NFTDriverLogic|0x3b11537d0d4276ba9e41ffe04e9034280bd7af50"
  "AddressDriverLogic|0x3ea1e774f98cc4c6359bbcb3238e3e60365fa5c9"

  # tier 4: core driver proxies
  "NFTDriver|0xcf9c49b0962edb01cdaa5326299ba85d72405258"
  "AddressDriver|0x1455d9bd6b98f95dd8feb2b3d60ed825fcef0610"

  # tier 5: core protocol
  "DripsLogic|0xb0c9b6d67608be300398d0e4fb0cca3891e1b33f"
  "Drips|0xd0dd053392db676d57317cd4fe96fc2ccf42d0b4"

  # tier 6: peripheral
  "Caller|0x60f25ac5f289dc7f640f948521d486c964a248e5"
  "RepoDriverAnyApiOperator|0xa928d4b087ad35c46ba83331d8eeddb83152319b"
)

if [ "$SCAN_MODE" = "single" ]; then
  TARGETS=("${TARGETS[0]}")
fi

TOTAL_START=$(date +%s)
ERRORS=0
FOUND_AT=""
RATE_LIMITED=0

write_status() {
  echo "$1" > "${META_DIR}/STATUS"
}

cleanup_stale_containers() {
  # Solhunt scans create solhunt-scan-* containers per run. Old ones from
  # crashed/timed-out runs accumulate. Reap anything older than 1h before
  # each scan to keep the host healthy.
  #
  # Match against the full Status string ("Up 8 days", "Up 2 hours"); the
  # earlier version awk'd column 3 which is just "Up" and never matched.
  local stale
  stale=$(docker ps --filter "name=solhunt-scan-" --filter "status=running" --format "{{.ID}}|{{.Status}}" | awk -F'|' '$2 ~ /(hour|day|week)/ {print $1}')
  if [ -n "$stale" ]; then
    log "reaping stale solhunt-scan containers: $(echo "$stale" | wc -l)"
    echo "$stale" | xargs -r docker rm -f >/dev/null 2>&1 || true
  fi
}

write_status "RUNNING"
log "meta-live-scan started — ${#TARGETS[@]} targets, per-scan ${PER_SCAN_TIMEOUT}s, total ${TOTAL_TIMEOUT}s"

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
  if [ "$REMAINING" -lt "$EFFECTIVE_TIMEOUT" ]; then
    EFFECTIVE_TIMEOUT=$REMAINING
  fi

  log "[$IDX/${#TARGETS[@]}] scanning ${NAME} (${ADDR}) — budget ${EFFECTIVE_TIMEOUT}s"
  cleanup_stale_containers

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
  log "[$IDX/${#TARGETS[@]}] ${NAME} done — exit=${EXIT}, ${SCAN_DURATION}s — log: ${PER_LOG}"

  # Detect Max rate-limit refusal. claude -p surfaces this in the JSON or
  # as exit 1 with "rate_limit" / "5_hour" / "weekly_limit" in stderr.
  if grep -qi -E "(rate.?limit|5.?hour.?limit|weekly.?limit|usage.?limit|claude_ai_max)" "$PER_LOG" 2>/dev/null; then
    log "RATE_LIMITED detected in ${NAME} log — stopping"
    write_status "RATE_LIMITED"
    RATE_LIMITED=1
    break
  fi

  # Detect found=true verdict. The harness writes report.json into a
  # findings/<ts>-<contract>/ directory. Check the most recent.
  RECENT=$(ls -dt findings/2*-* 2>/dev/null | head -1 || true)
  if [ -n "${RECENT:-}" ] && [ -f "${RECENT}/report.json" ]; then
    if grep -q '"found": true' "${RECENT}/report.json" 2>/dev/null; then
      log "FOUND TRUE in ${RECENT}/report.json — stopping for human review"
      FOUND_AT="${RECENT}"
      write_status "FOUND"
      break
    fi
  fi

  # Error-budget circuit breaker. Treat exit codes 124 (timeout) and !=0 as
  # errors, but a clean "no-find" still has exit 0 from the CLI (it just
  # writes found=false). So this only fires on infrastructure failures.
  if [ "$EXIT" -ne 0 ] && [ "$EXIT" -ne 124 ]; then
    ERRORS=$((ERRORS + 1))
    log "consecutive infra errors: ${ERRORS}/${ERROR_BUDGET}"
    if [ "$ERRORS" -ge "$ERROR_BUDGET" ]; then
      log "ERROR_BUDGET exhausted — stopping"
      write_status "ERROR_BUDGET"
      break
    fi
  else
    ERRORS=0
  fi
done

if [ -z "$FOUND_AT" ] && [ "$RATE_LIMITED" -eq 0 ] && [ ! -f "${META_DIR}/STATUS" ]; then
  write_status "NO_FIND"
fi

# Status was set explicitly above on early-exit paths; if we ran the full
# loop without hitting any of them, it stayed at RUNNING — fix to NO_FIND.
CURRENT_STATUS=$(cat "${META_DIR}/STATUS" 2>/dev/null || echo "UNKNOWN")
if [ "$CURRENT_STATUS" = "RUNNING" ]; then
  write_status "NO_FIND"
fi

log "meta-live-scan finished — final status: $(cat ${META_DIR}/STATUS)"
log "summary:"
for f in "${META_DIR}"/*.exit; do
  [ -f "$f" ] || continue
  base=$(basename "$f" .exit)
  exit_code=$(cat "$f")
  log "  ${base}: exit ${exit_code}"
done

if [ -n "$FOUND_AT" ]; then
  log "FINDING BUNDLE: ${FOUND_AT}"
  log "DO NOT SUBMIT WITHOUT HUMAN REVIEW — read ${FOUND_AT}/README.md and re-verify Exploit.t.sol"
fi

#!/bin/sh
# verify_patch: Claude Code CLI-visible shell wrapper around patch-harness-cli.ts.
#
# Claude runs this with its Bash tool after editing the patched Solidity source
# on disk. The wrapper shells into the solhunt repo on the host and invokes the
# harness via tsx. Exits 0 iff all four gates are green.
set -e

# SOLHUNT_REPO may be exported by the driver; default assumes the VPS layout.
REPO="${SOLHUNT_REPO:-/root/solhunt}"

cd "$REPO"
exec npx tsx src/sandbox/patch-harness-cli.ts "$@"

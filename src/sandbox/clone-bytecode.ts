/**
 * In-process bytecode cloning against an anvil fork.
 *
 * WHY this lives under src/sandbox/ and not scripts/: the scan flow needs to
 * clone a victim contract's runtime bytecode onto a fresh address BEFORE Red
 * starts its scan, and the target anvil lives inside the solhunt-sandbox
 * container. Doing the clone via `sandbox.exec(containerId, "cast rpc ...")`
 * routes the anvil_setCode / anvil_setStorageAt calls into the container's
 * private anvil — the same anvil that Claude's forge/cast wrappers and the
 * authoritative exploit-harness-cli hit. Without this module, the scan flow
 * would need to shell out to scripts/redeploy-defihacklabs.ts, which is
 * clunky and fragile.
 *
 * This file intentionally duplicates a small amount of logic from
 * scripts/redeploy-defihacklabs.ts (EIP-1967 slots, fresh-address derivation,
 * proxy detection). The script still owns the batch dataset-clone flow; this
 * module owns the single-contract in-scan-flow clone. Keeping them parallel
 * but separate means the script can remain a zero-dep standalone tool while
 * src/ stays inside the tsc project.
 */

import sha3 from "js-sha3";

import { SandboxManager } from "./manager.js";

// EIP-1967 proxy slots.
const EIP1967_IMPL_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

const NUM_STORAGE_SLOTS_TO_COPY = 16;

export interface CloneResult {
  originalAddress: string;
  freshAddress: string;
  codeBytes: number;
  slotsCopied: number;
  proxyDetected: boolean;
  originalImplAddress?: string;
  freshImplAddress?: string;
}

/**
 * Clone runtime bytecode + low-index storage slots from `originalAddress` to
 * `freshAddress` on the anvil running inside `containerId`. Detects EIP-1967
 * proxies and clones the implementation too.
 *
 * All RPC traffic goes through `docker exec <id> cast rpc`, so the writes
 * land in the same anvil that forge test (via the wrapper OR the
 * authoritative harness) observes.
 */
export async function cloneBytecodeInContainer(opts: {
  sandbox: SandboxManager;
  containerId: string;
  originalAddress: string;
  freshAddress: string;
  // Block tag for source reads. "latest" is safe when the fork was pinned at
  // scan start.
  sourceBlockTag?: string;
  // Derive a deterministic second fresh address for the implementation clone
  // when the original is an EIP-1967 proxy.
  freshImplSeed?: string;
}): Promise<CloneResult> {
  const blockTag = opts.sourceBlockTag ?? "latest";

  // 1. Proxy detection.
  const implSlotValue = await castRpc<string>(opts.sandbox, opts.containerId, "eth_getStorageAt", [
    opts.originalAddress,
    EIP1967_IMPL_SLOT,
    blockTag,
  ]);
  const proxyDetected = !!implSlotValue && !isZeroSlot(implSlotValue);
  const originalImpl = proxyDetected
    ? addressFromSlotValue(implSlotValue)
    : undefined;

  let totalBytes = 0;
  let totalSlots = 0;
  let freshImplAddress: string | undefined;

  // 2. If proxy, clone impl first.
  if (originalImpl && isNonZeroAddress(originalImpl)) {
    freshImplAddress = opts.freshImplSeed
      ? deriveFreshAddress(`${opts.freshImplSeed}__IMPL`)
      : deriveFreshAddress(`${opts.freshAddress}__IMPL`);
    const implStats = await cloneAccount(
      opts.sandbox,
      opts.containerId,
      originalImpl,
      freshImplAddress,
      blockTag,
    );
    totalBytes += implStats.codeBytes;
    totalSlots += implStats.slotsCopied;
  }

  // 3. Clone the primary account.
  const stats = await cloneAccount(
    opts.sandbox,
    opts.containerId,
    opts.originalAddress,
    opts.freshAddress,
    blockTag,
  );
  totalBytes += stats.codeBytes;
  totalSlots += stats.slotsCopied;

  // 4. Rewire the fresh proxy's impl slot at the fresh impl.
  if (originalImpl && freshImplAddress) {
    const padded = `0x${"0".repeat(24)}${freshImplAddress.replace(/^0x/, "")}`;
    await castRpc(opts.sandbox, opts.containerId, "anvil_setStorageAt", [
      opts.freshAddress,
      EIP1967_IMPL_SLOT,
      hexPad32(padded),
    ]);
  }

  // 5. Verify deployment landed.
  const finalCode = await castRpc<string>(opts.sandbox, opts.containerId, "eth_getCode", [
    opts.freshAddress,
    "latest",
  ]);
  if (!finalCode || finalCode === "0x") {
    throw new Error(
      `cloneBytecodeInContainer: post-setCode verification failed for ${opts.freshAddress} — anvil reports no code.`,
    );
  }
  console.error(
    `[clone] verified ${opts.freshAddress} has ${(finalCode.length - 2) / 2}B of code on container's anvil`,
  );

  return {
    originalAddress: opts.originalAddress,
    freshAddress: opts.freshAddress,
    codeBytes: totalBytes,
    slotsCopied: totalSlots,
    proxyDetected,
    originalImplAddress: originalImpl,
    freshImplAddress,
  };
}

async function cloneAccount(
  sandbox: SandboxManager,
  containerId: string,
  srcAddress: string,
  dstAddress: string,
  blockTag: string,
): Promise<{ codeBytes: number; slotsCopied: number }> {
  const code = await castRpc<string>(sandbox, containerId, "eth_getCode", [
    srcAddress,
    blockTag,
  ]);
  if (!code || code === "0x" || code.length < 4) {
    throw new Error(
      `Source ${srcAddress} has no code at ${blockTag} — not a contract or fork not synced.`,
    );
  }

  await castRpc(sandbox, containerId, "anvil_setCode", [dstAddress, code]);

  let slotsCopied = 0;
  for (let i = 0; i < NUM_STORAGE_SLOTS_TO_COPY; i++) {
    const slot = slotHex(i);
    const value = await castRpc<string>(sandbox, containerId, "eth_getStorageAt", [
      srcAddress,
      slot,
      blockTag,
    ]);
    if (value && !isZeroSlot(value)) {
      await castRpc(sandbox, containerId, "anvil_setStorageAt", [
        dstAddress,
        slot,
        hexPad32(value),
      ]);
      slotsCopied++;
    }
  }

  for (const ps of [EIP1967_IMPL_SLOT, EIP1967_ADMIN_SLOT]) {
    const value = await castRpc<string>(sandbox, containerId, "eth_getStorageAt", [
      srcAddress,
      ps,
      blockTag,
    ]);
    if (value && !isZeroSlot(value)) {
      await castRpc(sandbox, containerId, "anvil_setStorageAt", [
        dstAddress,
        ps,
        hexPad32(value),
      ]);
      slotsCopied++;
    }
  }

  const codeBytes = Math.max(0, (code.length - 2) / 2);
  return { codeBytes, slotsCopied };
}

// ─────────────────────────────────────────────────────────────────────────
// RPC transport — routed through `docker exec <id> cast rpc ...` via
// sandbox.exec. cast prints the raw JSON result to stdout; hex strings come
// out unquoted, JSON values come out as JSON text.
// ─────────────────────────────────────────────────────────────────────────

async function castRpc<T = unknown>(
  sandbox: SandboxManager,
  containerId: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const paramArgs = params
    .map((p) => {
      const jsonForm = typeof p === "string" ? p : JSON.stringify(p);
      return shellQuote(jsonForm);
    })
    .join(" ");
  const cmd = `cast rpc ${method} ${paramArgs} --rpc-url http://localhost:8545`;
  const res = await sandbox.exec(containerId, cmd, 60_000);
  if (res.exitCode !== 0) {
    throw new Error(
      `cast rpc ${method} failed (exit ${res.exitCode}): ${(res.stderr || res.stdout).slice(0, 500)}`,
    );
  }
  const raw = (res.stdout ?? "").trim();
  if (raw === "" || raw === "null") return null as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

function shellQuote(s: string): string {
  // cast rpc accepts JSON-shaped argv tokens. We single-quote and escape any
  // embedded single quote. Hex strings need no escaping but we quote anyway
  // for safety.
  return `'${s.replace(/'/g, "'\\''")}'`;
}

// ─────────────────────────────────────────────────────────────────────────
// Hex / slot helpers (mirror scripts/redeploy-defihacklabs.ts)
// ─────────────────────────────────────────────────────────────────────────

function hexPad32(hex: string): string {
  const raw = hex.replace(/^0x/, "");
  if (raw.length === 64) return `0x${raw}`;
  if (raw.length < 64) return `0x${raw.padStart(64, "0")}`;
  return `0x${raw}`;
}

function slotHex(n: number): string {
  return `0x${n.toString(16).padStart(64, "0")}`;
}

function isZeroSlot(value: string): boolean {
  return /^0x0+$/.test(value);
}

function addressFromSlotValue(slotValue: string): string {
  const raw = slotValue.replace(/^0x/, "").padStart(64, "0");
  return `0x${raw.slice(24)}`;
}

function isNonZeroAddress(addr: string): boolean {
  return !/^0x0+$/.test(addr);
}

function deriveFreshAddress(seed: string): string {
  const h = `0x${sha3.keccak_256(new TextEncoder().encode(`solhunt-fresh:v1:${seed}`))}`;
  return `0x${h.slice(2, 42)}`;
}

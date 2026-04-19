#!/usr/bin/env node
/**
 * Thin CLI wrapper around verifyPatch(). Used by the Claude Code CLI Blue
 * branch so Claude can call `verify_patch` as a plain Bash tool invocation
 * and get the structured JSON verdict back on stdout.
 *
 * Contract:
 *   - Reads a config JSON at $SOLHUNT_VERIFY_ARGS (default:
 *     /workspace/harness/verify-args.json). Keys match the runtime inputs to
 *     verifyPatch() + whatever the CLI branch needs to identify the live
 *     sandbox container.
 *   - Before invoking verifyPatch(), sync the host-side patched source tree
 *     into the container (claude edits host files; verifyPatch runs inside
 *     the container). Today that means copying /workspace/harness/patched/src/
 *     into the container at patchedProjectRoot/src/.
 *   - Prints the PatchVerification JSON to stdout.
 *   - Exits 0 when all four gates are green AND there's no error; nonzero
 *     otherwise so Claude's Bash tool surfaces a non-success status.
 *
 * Reuses verifyPatch() verbatim — this file adds no verification logic, only
 * plumbing between the claude filesystem (host staging dir) and the dockerode
 * sandbox.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { SandboxManager } from "./manager.js";
import { verifyPatch, type PatchVerification } from "./patch-harness.js";

interface VerifyArgsFile {
  /** Container id of the live solhunt-sandbox (created by the Phase 1 driver). */
  containerId: string;
  targetAddress: string;
  forkBlockNumber: number;
  contractName: string;
  sourceFilename: string;
  rpcUrl: string;
  exploitTestPath: string;
  benignTestPath: string;
  /** Project roots INSIDE the container. */
  originalProjectRoot: string;
  patchedProjectRoot: string;
  /** Directory on the HOST that Claude is editing. We sync src/ from here
   *  into the container before verifying. */
  hostPatchedRoot: string;
  /** Duel/fresh-address mode. When set, verify_patch swaps runtime bytecode
   *  at freshAddress between sanity / exploit / fresh-attacker / benign
   *  stages so Red's localhost:8545-targeted exploit observes the correct
   *  variant at each step. */
  freshAddress?: string;
  anvilRpcUrl?: string;
}

function isAllGreen(v: PatchVerification): boolean {
  return (
    v.exploitNeutralized &&
    v.benignPassed &&
    v.freshAttackerNeutralized &&
    !v.storageLayoutChanged &&
    !v.error
  );
}

async function syncHostSrcIntoContainer(
  sandbox: SandboxManager,
  containerId: string,
  hostPatchedRoot: string,
  containerPatchedRoot: string
): Promise<void> {
  // Only the src/ tree is owned by Claude. test/ and foundry.toml come from
  // the driver's seeding step and must NOT be rewritten by this sync — we'd
  // clobber the auto-generated benign suite and Red's exploit test.
  const hostSrc = join(hostPatchedRoot, "src");
  if (!existsSync(hostSrc)) return;

  // Walk hostSrc; copy every regular file into the container at
  // containerPatchedRoot/src/<relative>.
  const queue: string[] = [hostSrc];
  while (queue.length > 0) {
    const current = queue.pop()!;
    const entries = readdirSync(current);
    for (const entry of entries) {
      const full = join(current, entry);
      const s = statSync(full);
      if (s.isDirectory()) {
        queue.push(full);
        continue;
      }
      if (!s.isFile()) continue;
      const rel = relative(hostSrc, full).split("\\").join("/");
      const containerPath = `${containerPatchedRoot}/src/${rel}`;
      const content = readFileSync(full, "utf-8");
      await sandbox.writeFile(containerId, containerPath, content);
    }
  }
}

async function main(): Promise<number> {
  const argsPath =
    process.env.SOLHUNT_VERIFY_ARGS ?? "/workspace/harness/verify-args.json";
  if (!existsSync(argsPath)) {
    console.error(
      `verify_patch: config not found at ${argsPath}. Set SOLHUNT_VERIFY_ARGS or restore the file.`
    );
    return 2;
  }

  let cfg: VerifyArgsFile;
  try {
    cfg = JSON.parse(readFileSync(argsPath, "utf-8")) as VerifyArgsFile;
  } catch (err) {
    console.error(
      `verify_patch: failed to parse ${argsPath}: ${(err as Error).message}`
    );
    return 2;
  }

  const sandbox = new SandboxManager();

  try {
    await syncHostSrcIntoContainer(
      sandbox,
      cfg.containerId,
      cfg.hostPatchedRoot,
      cfg.patchedProjectRoot
    );
  } catch (err) {
    console.error(
      `verify_patch: failed to sync host src into container: ${(err as Error).message}`
    );
    return 3;
  }

  const verdict = await verifyPatch(sandbox, {
    sandboxId: cfg.containerId,
    targetAddress: cfg.targetAddress,
    forkBlockNumber: cfg.forkBlockNumber,
    contractName: cfg.contractName,
    originalSourcePath: cfg.originalProjectRoot,
    patchedSourcePath: cfg.patchedProjectRoot,
    exploitTestPath: cfg.exploitTestPath,
    benignTestPath: cfg.benignTestPath,
    rpcUrl: cfg.rpcUrl,
    freshAddress: cfg.freshAddress,
    anvilRpcUrl: cfg.anvilRpcUrl,
  });

  // Stdout: the JSON verdict, pretty-printed so Claude can read it easily.
  process.stdout.write(JSON.stringify(verdict, null, 2) + "\n");
  return isAllGreen(verdict) ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`verify_patch: fatal: ${(err as Error).message}`);
    process.exit(4);
  });

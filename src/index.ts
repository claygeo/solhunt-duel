#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve as pathResolve, relative as pathRelative, join as pathJoin } from "node:path";

import { SandboxManager } from "./sandbox/manager.js";
import { ForkManager } from "./sandbox/fork.js";
import { FoundryProject } from "./sandbox/foundry.js";
import { runPreScanRecon, formatReconForPrompt } from "./sandbox/recon.js";
import { cloneBytecodeInContainer } from "./sandbox/clone-bytecode.js";
import { fetchContractSource } from "./ingestion/etherscan.js";
import { runAgent } from "./agent/loop.js";
import { runRedTeamViaClaudeCli } from "./agent/loop-via-claude-cli.js";
import { resolveProvider, type ProviderConfig } from "./agent/provider.js";
import { assertInScopeOrAcknowledged, type InScopeTarget } from "./safety/in-scope.js";
import { resolveChain, getRpcUrl, explorerAddressUrl } from "./config/chains.js";
import { calculateCost } from "./reporter/format.js";
import { renderReport, renderBenchmarkTable } from "./reporter/markdown.js";
import type { ScanResult } from "./reporter/format.js";
import { runBenchmark } from "./benchmark/runner.js";
import { isEnabled as isStorageEnabled, DataCollector, upsertContract, insertScanRun } from "./storage/index.js";
import { hostname } from "node:os";

dotenv.config();

const program = new Command();

program
  .name("solhunt")
  .description("Autonomous AI agent for smart contract vulnerability detection")
  .version("0.1.0");

function renderFindingReadme(args: {
  target: string;
  contractName: string;
  inScope: InScopeTarget | null;
  report: any;
  error?: string;
  outDir: string;
  chain?: { name: string; explorerUrl: string; explorerLabel: string };
}): string {
  const lines: string[] = [];
  lines.push(`# Solhunt finding bundle\n`);
  if (args.chain) {
    const explorer = `${args.chain.explorerUrl}/address/${args.target}`;
    lines.push(`- **Target address:** \`${args.target}\` ([${args.chain.explorerLabel}](${explorer}))`);
    lines.push(`- **Chain:** ${args.chain.name}`);
  } else {
    lines.push(`- **Target address:** \`${args.target}\``);
  }
  lines.push(`- **Contract name:** ${args.contractName}`);
  if (args.inScope) {
    lines.push(`- **Program:** [${args.inScope.program}](${args.inScope.programUrl})`);
    lines.push(`- **In-scope as of:** ${args.inScope.scrapedAt}`);
  } else {
    lines.push(`- **Program:** OUT-OF-SCOPE OVERRIDE (no Immunefi listing)`);
  }
  lines.push(`- **Generated:** ${new Date().toISOString()}`);
  lines.push(``);
  lines.push(`## DO NOT SUBMIT WITHOUT HUMAN REVIEW.`);
  lines.push(``);
  lines.push(`Solhunt is an autonomous agent. Every claim below MUST be re-verified by a human before any Immunefi submission. Common failure modes:`);
  lines.push(`- Exploit test passes only because of an artifact of the fork (e.g. a flash-loan callback that wouldn't work on mainnet).`);
  lines.push(`- "Vulnerability" is actually expected protocol behavior under intended access control.`);
  lines.push(`- Severity inflated. Check the program's severity classification before trusting the agent's label.`);
  lines.push(``);
  if (args.error) {
    lines.push(`## Error`);
    lines.push(``);
    lines.push("```");
    lines.push(args.error);
    lines.push("```");
    lines.push(``);
  }
  if (args.report) {
    const r = args.report;
    lines.push(`## Agent verdict`);
    lines.push(``);
    lines.push(`- **Found:** ${r.found ? "YES" : "NO"}`);
    if (r.vulnerability) {
      lines.push(`- **Class:** ${r.vulnerability.class ?? "?"}`);
      lines.push(`- **Severity (agent claim):** ${r.vulnerability.severity ?? "?"}`);
      lines.push(`- **Functions:** ${(r.vulnerability.functions ?? []).join(", ") || "?"}`);
      lines.push(`- **Description:** ${r.vulnerability.description ?? "(none)"}`);
    }
    if (r.exploit) {
      lines.push(`- **Test passed (authoritative):** ${r.exploit.testPassed ? "YES" : "NO"}`);
      lines.push(`- **Value at risk (agent claim):** ${r.exploit.valueAtRisk ?? "?"}`);
    }
    lines.push(``);
  }
  lines.push(`## Files in this bundle`);
  lines.push(``);
  lines.push(`- \`report.json\` — full structured agent output`);
  lines.push(`- \`Exploit.t.sol\` — Foundry test the agent wrote (if any)`);
  lines.push(`- \`README.md\` — this file`);
  lines.push(``);
  lines.push(`## Next steps for the reviewer`);
  lines.push(``);
  lines.push(`1. Read \`Exploit.t.sol\` end-to-end. Convince yourself the asserted "exploit" is a real loss-of-funds path on mainnet, not a fork artifact.`);
  lines.push(`2. Re-run \`forge test\` against a fresh mainnet fork (not the cached one solhunt used) to confirm reproducibility.`);
  lines.push(`3. Cross-reference the program's severity rubric. \`severity\` from the agent is best-effort, not authoritative.`);
  lines.push(`4. If still confident, prepare an Immunefi submission per the program's PoC requirements.`);
  return lines.join("\n");
}

// Resolve provider config from CLI flags + env vars
function buildProviderConfig(options: { provider?: string; model?: string }): ProviderConfig {
  const providerName = options.provider ?? process.env.SOLHUNT_PROVIDER ?? "ollama";
  const config = resolveProvider(providerName);

  // Override model if specified
  if (options.model) {
    config.model = options.model;
  }

  // Inject API keys from env
  if (config.provider === "anthropic") {
    config.apiKey = process.env.ANTHROPIC_API_KEY;
  } else if (config.provider === "openai") {
    config.apiKey = process.env.OPENAI_API_KEY;
  } else if (config.provider === "openrouter") {
    config.apiKey = process.env.OPENROUTER_API_KEY;
  }

  // Validate API key for providers that need one
  if (config.provider !== "ollama" && !config.apiKey) {
    const envVar = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
      custom: "API_KEY",
    }[config.provider];
    throw new Error(`${envVar} not set. Required for ${providerName} provider.`);
  }

  return config;
}

program
  .command("scan")
  .description("Scan a smart contract for vulnerabilities")
  .argument("<target>", "Contract address (0x...) or path to .sol file")
  .option("--chain <chain>", "Blockchain network (ethereum, arbitrum, optimism, base, polygon, base-sepolia)", "ethereum")
  .option("--rpc-url <url>", "RPC endpoint override. Wins over --chain's default env var. Required if the per-chain env var (e.g. ARB_RPC_URL) is unset.")
  .option("--block <number>", "Block number for fork")
  .option("--provider <name>", "Model provider (ollama, openai, openrouter, anthropic)", process.env.SOLHUNT_PROVIDER ?? "ollama")
  .option("--model <model>", "Model to use (overrides provider default)")
  .option("--max-iterations <n>", "Max agent iterations", "30")
  .option("--source-file <path>", "Override Etherscan source fetch with a local .sol file or directory of .sol files. Target address stays as passed (enables scanning fresh-address redeployments).")
  .option("--contract-name <name>", "Contract name to use when --source-file is supplied (defaults to file basename)")
  .option("--redeploy-from <address>", "After anvil starts, clone the runtime bytecode + storage from <address> onto the <target> (fresh) address inside the sandbox's private anvil. Enables fresh-address duels where Claude never sees the original verified mainnet address. Requires --block for a pinned fork.")
  .option("--via-claude-cli", "Route the agent through `claude -p` (Claude Max subscription) instead of the configured paid provider. Bypasses --provider/--model and the API-key check. Uses the same Red-team plumbing as the duel system.", false)
  .option("--i-acknowledge-out-of-scope", "Bypass the Immunefi in-scope allowlist (src/safety/in-scope.ts). Only set when you have authorization outside Immunefi. Logged loudly.", false)
  .option("--findings-dir <path>", "Where to save findings when --via-claude-cli runs. Default: ./findings/<iso-timestamp>-<contract>/", "./findings")
  .option("--dry-run", "Show what would happen without calling the model", false)
  .option("--json", "Output as JSON", false)
  .action(async (target, options) => {
    const etherscanKey = process.env.ETHERSCAN_API_KEY;
    const useLocalSource = !!options.sourceFile;
    if (!etherscanKey && target.startsWith("0x") && !useLocalSource) {
      console.error(chalk.red("ETHERSCAN_API_KEY not set. Needed to fetch contract source."));
      process.exit(1);
    }

    let chainConfig: ReturnType<typeof resolveChain>;
    let rpcUrl: string;
    try {
      chainConfig = resolveChain(options.chain);
      rpcUrl = getRpcUrl(chainConfig, options.rpcUrl);
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }

    // Hard rail: in-scope allowlist gates execution for ANY 0x address scan,
    // regardless of which model provider is used. The rule is "only scan
    // contracts in an active bug-bounty scope," not "only when paying via
    // claude-cli." Local .sol files bypass the check (researcher may be
    // auditing their own code or a CTF). Override with
    // --i-acknowledge-out-of-scope; that flag is logged loudly to stderr.
    let inScopeMatch: InScopeTarget | null = null;
    if (target.startsWith("0x")) {
      try {
        inScopeMatch = assertInScopeOrAcknowledged(
          target,
          options.iAcknowledgeOutOfScope,
        );
        if (inScopeMatch) {
          console.error(
            chalk.green(
              `[in-scope] ${target} matches ${inScopeMatch.program} (${inScopeMatch.contract}) — ${inScopeMatch.programUrl}`,
            ),
          );
        } else {
          console.error(
            chalk.yellow(
              `[OUT-OF-SCOPE OVERRIDE] --i-acknowledge-out-of-scope set for ${target}. ` +
                `Caller asserts authorization outside Immunefi. This is logged.`,
            ),
          );
        }
      } catch (err: any) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    }

    // Only validate paid-provider config when we're actually going to use it.
    // --via-claude-cli routes through `claude -p` (Max subscription) and
    // does not need ANTHROPIC_API_KEY / OPENROUTER_API_KEY.
    let providerConfig: ProviderConfig;
    if (options.viaClaudeCli) {
      providerConfig = {
        provider: "claude-cli" as any,
        model: "claude-opus-4-7",
      } as ProviderConfig;
    } else {
      try {
        providerConfig = buildProviderConfig(options);
      } catch (err: any) {
        console.error(chalk.red(err.message));
        process.exit(1);
      }
    }

    const spinner = ora("Initializing...").start();
    const sandbox = new SandboxManager();
    const scanId = randomUUID().slice(0, 8);
    let containerId: string | undefined;

    try {
      // Check Docker
      spinner.text = "Checking Docker...";
      const healthy = await sandbox.healthCheck();
      if (!healthy) {
        spinner.fail("Docker is not running. Start Docker and try again.");
        process.exit(1);
      }

      // Fetch contract source
      let sources: { filename: string; content: string }[];
      let contractName: string;

      if (useLocalSource) {
        // --source-file overrides Etherscan. Target is still the (fresh) address.
        const srcPath = pathResolve(options.sourceFile);
        spinner.text = `Loading local source from ${srcPath}...`;
        const st = statSync(srcPath);
        if (st.isDirectory()) {
          const walked: { filename: string; content: string }[] = [];
          const walk = (dir: string) => {
            for (const entry of readdirSync(dir)) {
              const full = pathJoin(dir, entry);
              const s = statSync(full);
              if (s.isDirectory()) walk(full);
              else if (entry.endsWith(".sol")) {
                walked.push({
                  filename: pathRelative(srcPath, full).replace(/\\/g, "/"),
                  content: readFileSync(full, "utf-8"),
                });
              }
            }
          };
          walk(srcPath);
          if (walked.length === 0) {
            throw new Error(`No .sol files found under ${srcPath}`);
          }
          sources = walked;
        } else {
          const content = readFileSync(srcPath, "utf-8");
          const filename = srcPath.split(/[/\\]/).pop() ?? "Contract.sol";
          sources = [{ filename, content }];
        }
        contractName =
          options.contractName ??
          (sources[0].filename.replace(/\.sol$/, "").split("/").pop() || "Contract");
      } else if (target.startsWith("0x")) {
        spinner.text = `Fetching contract source from Etherscan (chain=${chainConfig.name}, chainId=${chainConfig.chainId})...`;
        const info = await fetchContractSource(target, etherscanKey!, chainConfig.chainId);
        sources = info.sources;
        contractName = info.name;
      } else {
        // Local file
        spinner.text = `Reading ${target}...`;
        const content = readFileSync(target, "utf-8");
        const filename = target.split("/").pop() ?? "Contract.sol";
        contractName = filename.replace(".sol", "");
        sources = [{ filename, content }];
      }

      spinner.text = `Found ${sources.length} source file(s) for ${contractName}`;

      if (options.dryRun) {
        spinner.succeed("Dry run complete");
        console.log(`\nWould scan: ${contractName} (${target})`);
        console.log(`Chain: ${options.chain}`);
        console.log(`Block: ${options.block ?? "latest"}`);
        console.log(`Provider: ${providerConfig.provider}`);
        console.log(`Model: ${providerConfig.model}`);
        console.log(`Source files: ${sources.map((s) => s.filename).join(", ")}`);
        return;
      }

      // Create sandbox
      spinner.text = "Creating Docker sandbox...";
      containerId = await sandbox.createContainer(scanId, { rpcUrl });

      // Scaffold Foundry project
      spinner.text = "Scaffolding Foundry project...";
      const foundry = new FoundryProject(sandbox);
      await foundry.scaffold(containerId, rpcUrl, options.block ? parseInt(options.block) : undefined);

      // Add contract sources
      spinner.text = "Adding contract source to sandbox...";
      await foundry.addContractSource(containerId, sources);

      // Start anvil fork (skip for local files without --block)
      const needsFork = target.startsWith("0x") || options.block;
      if (needsFork) {
        spinner.text = "Starting blockchain fork...";
        const fork = new ForkManager(sandbox);
        await fork.startAnvilFork(containerId, {
          chain: options.chain,
          rpcUrl,
          blockNumber: options.block ? parseInt(options.block) : undefined,
        });
      } else {
        // Start anvil without forking (local analysis only)
        spinner.text = "Starting local anvil...";
        const fork = new ForkManager(sandbox);
        await fork.startAnvilFork(containerId, {
          chain: options.chain,
          rpcUrl: "", // empty = no fork
        });
      }

      // Fresh-address redeploy (for duel flows where Claude must not see the
      // real mainnet address). Clones bytecode + storage slots from the
      // original address onto `target` inside the container's private anvil —
      // the same anvil Claude's forge wrapper + the authoritative
      // exploit-harness-cli both hit. Without this, fresh-mode scans fail
      // because the redeploy lives in a different anvil than the harness.
      if (options.redeployFrom && target.startsWith("0x")) {
        spinner.text = `Cloning bytecode from ${options.redeployFrom} onto ${target}...`;
        console.error(`[redeploy] cloning ${options.redeployFrom} -> ${target} via container ${containerId.slice(0, 12)}`);
        try {
          const cloneResult = await cloneBytecodeInContainer({
            sandbox,
            containerId,
            originalAddress: options.redeployFrom,
            freshAddress: target,
            sourceBlockTag: options.block ? `0x${parseInt(options.block).toString(16)}` : "latest",
            freshImplSeed: contractName,
          });
          const summary =
            `Cloned ${cloneResult.codeBytes}B of code + ${cloneResult.slotsCopied} storage slot(s)` +
            (cloneResult.proxyDetected
              ? ` (proxy impl ${cloneResult.originalImplAddress} → ${cloneResult.freshImplAddress})`
              : "");
          console.error(`[redeploy] ${summary}`);
          spinner.text = summary;
        } catch (err: any) {
          spinner.fail(`Redeploy clone failed: ${err.message}`);
          throw err;
        }
      }

      // Build to verify sources compile
      spinner.text = "Verifying contract compiles...";
      const buildResult = await foundry.build(containerId);
      if (!buildResult.success) {
        spinner.warn("Contract has compilation warnings (proceeding anyway)");
      }

      // Pre-scan recon: gather contract state to seed the agent prompt
      let reconData: string | undefined;
      if (target.startsWith("0x")) {
        spinner.text = "Running pre-scan reconnaissance...";
        try {
          const recon = await runPreScanRecon(sandbox, containerId, target);
          reconData = formatReconForPrompt(recon);
          if (recon.rawResults.length > 0) {
            spinner.text = `Recon found ${recon.rawResults.length} data points`;
          }
        } catch (err: any) {
          // Non-fatal: agent can still discover state manually
          console.error(`Recon failed (non-fatal): ${err.message}`);
        }
      }

      // Run agent
      const collector = isStorageEnabled() ? new DataCollector() : undefined;
      collector?.setContractSource(sources);
      if (reconData) collector?.setReconData(reconData);

      const scanTarget = {
        address: target,
        name: contractName,
        chain: options.chain,
        blockNumber: options.block ? parseInt(options.block) : undefined,
        sources,
        reconData,
      };
      const agentConfig = {
        provider: providerConfig,
        maxIterations: parseInt(options.maxIterations),
        toolTimeout: parseInt(process.env.SOLHUNT_TOOL_TIMEOUT ?? "60000"),
        scanTimeout: parseInt(process.env.SOLHUNT_SCAN_TIMEOUT ?? "3600000"),
      };

      let agentResult;
      if (options.viaClaudeCli) {
        spinner.text = `Agent analyzing via claude -p (Max subscription, opus 4.7)...`;
        agentResult = await runRedTeamViaClaudeCli(
          scanTarget,
          containerId,
          sandbox,
          agentConfig,
          (iter, tool) => {
            spinner.text = `Agent iteration ${iter}: ${tool}`;
          },
          collector,
        );
      } else {
        spinner.text = `Agent analyzing contract (${providerConfig.provider}/${providerConfig.model})...`;
        agentResult = await runAgent(
          scanTarget,
          containerId,
          sandbox,
          agentConfig,
          (iter, tool) => {
            spinner.text = `Agent iteration ${iter}: ${tool}`;
          },
          collector
        );
      }

      // Extract exploit code before container is destroyed
      if (containerId && collector) {
        const exploitCode = await sandbox.tryReadFile(
          containerId,
          "/workspace/scan/test/Exploit.t.sol"
        );
        collector.setExploitCode(exploitCode);
      }

      spinner.succeed("Scan complete");

      // Format result
      const scanResult: ScanResult = {
        report: agentResult.report,
        iterations: agentResult.iterations,
        cost: {
          inputTokens: agentResult.cost.inputTokens,
          outputTokens: agentResult.cost.outputTokens,
          totalUSD: calculateCost(
            providerConfig.model,
            agentResult.cost.inputTokens,
            agentResult.cost.outputTokens
          ),
        },
        durationMs: agentResult.durationMs,
        error: agentResult.error,
      };

      // Save findings to disk for ANY 0x address scan. Hard rail: never
      // auto-submit. The bundle on disk is what a human reviews before any
      // Immunefi submission. Applies regardless of provider — the rule is
      // "every scan that produces a report needs a human-review bundle,"
      // not "only the claude-cli path." Local-source scans (no 0x address)
      // still get console output but skip the bundle.
      if (target.startsWith("0x")) {
        try {
          const ts = new Date().toISOString().replace(/[:.]/g, "-");
          const safeName = contractName.replace(/[^a-zA-Z0-9_-]/g, "_");
          const outDir = pathResolve(options.findingsDir, `${ts}-${safeName}`);
          mkdirSync(outDir, { recursive: true });
          writeFileSync(
            pathJoin(outDir, "report.json"),
            JSON.stringify(
              {
                target,
                contractName,
                chain: options.chain,
                blockNumber: options.block ? parseInt(options.block) : null,
                inScope: inScopeMatch,
                outOfScopeOverride: !!options.iAcknowledgeOutOfScope,
                via: options.viaClaudeCli ? "claude-cli" : providerConfig.provider,
                model: options.viaClaudeCli ? "claude-opus-4-7" : providerConfig.model,
                durationMs: scanResult.durationMs,
                iterations: scanResult.iterations,
                report: scanResult.report,
                error: scanResult.error,
              },
              null,
              2,
            ),
            "utf-8",
          );
          // Persist exploit test if Claude wrote one. Look first in the
          // host staging dir (preferred), then fall back to the container.
          const stagingExploit = pathResolve(
            process.env.SOLHUNT_HOST_STAGING_RED ??
              process.env.SOLHUNT_HOST_STAGING ??
              "/workspace/harness-red",
            "scan/test/Exploit.t.sol",
          );
          let exploitSrc: string | null = null;
          try {
            exploitSrc = readFileSync(stagingExploit, "utf-8");
          } catch {
            // ignore — fall back to container read below
          }
          if (!exploitSrc && containerId) {
            exploitSrc = await sandbox.tryReadFile(
              containerId,
              "/workspace/scan/test/Exploit.t.sol",
            );
          }
          if (exploitSrc) {
            writeFileSync(
              pathJoin(outDir, "Exploit.t.sol"),
              exploitSrc,
              "utf-8",
            );
          }
          // README so a future reviewer (or Clayton on laptop wake-up)
          // doesn't have to dig into the JSON to understand what they're
          // looking at.
          const readme = renderFindingReadme({
            target,
            contractName,
            inScope: inScopeMatch,
            report: scanResult.report,
            error: scanResult.error,
            outDir,
            chain: {
              name: chainConfig.name,
              explorerUrl: chainConfig.explorerUrl,
              explorerLabel: chainConfig.explorerLabel,
            },
          });
          writeFileSync(pathJoin(outDir, "README.md"), readme, "utf-8");
          console.error(chalk.cyan(`[findings] saved to ${outDir}`));
        } catch (err: any) {
          // Log full stack to make disk-full / permissions / missing-staging
          // diagnoses tractable without re-running the scan.
          console.error(chalk.red(`[findings] save failed: ${err.stack ?? err.message}`));
        }
      }

      // Persist to Supabase (fire-and-forget)
      if (collector && target.startsWith("0x")) {
        (async () => {
          try {
            const contractId = await upsertContract({
              address: target,
              chain: options.chain,
              name: contractName,
              block_number: options.block ? parseInt(options.block) : undefined,
            });
            if (!contractId) return;
            const scanRunId = await insertScanRun({
              contract_id: contractId,
              provider: providerConfig.provider,
              model: providerConfig.model,
              found: scanResult.report?.found ?? null,
              vuln_class: scanResult.report?.vulnerability?.class,
              severity: scanResult.report?.vulnerability?.severity,
              functions: scanResult.report?.vulnerability?.functions,
              description: scanResult.report?.vulnerability?.description,
              test_passed: scanResult.report?.exploit?.executed,
              value_at_risk: scanResult.report?.exploit?.valueAtRisk,
              input_tokens: scanResult.cost.inputTokens,
              output_tokens: scanResult.cost.outputTokens,
              cost_usd: scanResult.cost.totalUSD,
              duration_ms: scanResult.durationMs,
              iterations: scanResult.iterations,
              max_iterations: parseInt(options.maxIterations),
              error: scanResult.error,
              hostname: hostname(),
            });
            if (scanRunId) await collector.flush(scanRunId);
          } catch (err: any) {
            console.error(`[storage] ${err.message}`);
          }
        })();
      }

      if (options.json) {
        console.log(JSON.stringify(scanResult, null, 2));
      } else {
        console.log(renderReport(scanResult));
      }
    } catch (err: any) {
      spinner.fail(err.message);
      process.exit(1);
    } finally {
      if (containerId) {
        if (process.env.SOLHUNT_KEEP_CONTAINER === "1") {
          console.error(`[scan] SOLHUNT_KEEP_CONTAINER=1 — leaving container ${containerId.slice(0, 12)} running for inspection. Remove manually with: docker rm -f ${containerId}`);
        } else {
          await sandbox.destroyContainer(containerId).catch(() => {});
        }
      }
    }
  });

program
  .command("benchmark")
  .description("Run agent against a dataset of known-vulnerable contracts")
  .option("--dataset <path>", "Path to benchmark dataset JSON", "./benchmark/dataset.json")
  .option("--limit <n>", "Max contracts to test")
  .option("--concurrency <n>", "Parallel scans", "3")
  .option("--provider <name>", "Model provider", process.env.SOLHUNT_PROVIDER ?? "ollama")
  .option("--model <model>", "Model to use (overrides provider default)")
  .option("--output <path>", "Output results JSON path")
  .option("--json", "Output as JSON", false)
  .option("--max-budget <usd>", "Global budget cap in USD - stops benchmark if exceeded (recommended for large runs)")
  .option("--per-contract-warn <usd>", "Warn if any contract exceeds this cost", "2.50")
  .action(async (options) => {
    const etherscanKey = process.env.ETHERSCAN_API_KEY;
    const rpcUrl = process.env.ETH_RPC_URL;

    if (!etherscanKey || !rpcUrl) {
      console.error(chalk.red("Missing ETHERSCAN_API_KEY or ETH_RPC_URL. Check .env file."));
      process.exit(1);
    }

    let providerConfig: ProviderConfig;
    try {
      providerConfig = buildProviderConfig(options);
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }

    try {
      const results = await runBenchmark({
        datasetPath: options.dataset,
        limit: options.limit ? parseInt(options.limit) : undefined,
        concurrency: parseInt(options.concurrency),
        provider: providerConfig,
        etherscanKey,
        rpcUrl,
        outputPath: options.output,
        maxBudgetUsd: options.maxBudget ? parseFloat(options.maxBudget) : undefined,
        perContractBudgetWarnUsd: parseFloat(options.perContractWarn),
      });

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(renderBenchmarkTable(results));
      }
    } catch (err: any) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

program
  .command("health")
  .description("Check if Docker and dependencies are ready")
  .action(async () => {
    const sandbox = new SandboxManager();
    const providerName = process.env.SOLHUNT_PROVIDER ?? "ollama";

    const checks = [
      { name: "Docker", check: () => sandbox.healthCheck() },
      { name: `Provider (${providerName})`, check: async () => {
        try {
          buildProviderConfig({ provider: providerName });
          return true;
        } catch {
          return false;
        }
      }},
      { name: "ETHERSCAN_API_KEY", check: async () => !!process.env.ETHERSCAN_API_KEY },
      { name: "ETH_RPC_URL", check: async () => !!process.env.ETH_RPC_URL },
      { name: "Supabase (optional)", check: async () => isStorageEnabled() },
    ];

    console.log(chalk.bold("\nsolhunt health check\n"));

    for (const { name, check } of checks) {
      try {
        const ok = await check();
        console.log(ok ? chalk.green(`  [ok] ${name}`) : chalk.red(`  [!!] ${name}`));
      } catch {
        console.log(chalk.red(`  [!!] ${name}`));
      }
    }
    console.log("");
  });

program.parse();

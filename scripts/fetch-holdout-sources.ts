/**
 * Pre-fetch Etherscan source for the 10-contract Phase 4 holdout roster and
 * write each to `benchmark/sources/<Name>/` as flat .sol files. The duel
 * runner feeds these via --source-dir, so Red never sees the mainnet address.
 *
 * Also emits `benchmark/holdout-roster.json` with per-entry metadata the
 * Phase 4 runner consumes (originalAddress, forkBlockNumber, sourceDir,
 * vulnerabilityClass, expectedBehaviorOnFreshAddress).
 *
 * Usage (on VPS where ETHERSCAN_API_KEY is in .env):
 *   cd /root/solhunt && npx tsx scripts/fetch-holdout-sources.ts
 *
 * Idempotent: skips contracts whose source directory already has >= 1 .sol file.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, join, dirname, relative } from "node:path";
import { config as loadDotenv } from "dotenv";

import { fetchContractSource } from "../src/ingestion/etherscan.js";

loadDotenv();

// Roster: 10 contracts diversified across vuln classes.
// contractName is the top-level Solidity contract we want Red to scan.
interface RosterEntry {
  name: string;
  datasetMatch: string; // how to find the entry in benchmark/dataset.json by `name`
  contractName: string;
  vulnerabilityClass: string;
  expectedBehaviorOnFreshAddress: string;
}

const ROSTER: RosterEntry[] = [
  {
    name: "Dexible",
    datasetMatch: "Dexible",
    contractName: "DexibleProxy",
    vulnerabilityClass: "access-control",
    expectedBehaviorOnFreshAddress:
      "Arbitrary-call vuln in selfSwap() reachable on zero'd storage; Red previously found it cold. Fresh-address deploy keeps the vuln live (no victim-approval required to demo the class).",
  },
  {
    name: "Audius Governance",
    datasetMatch: "Audius Governance",
    contractName: "AudiusAdminUpgradeabilityProxy",
    vulnerabilityClass: "access-control",
    expectedBehaviorOnFreshAddress:
      "Storage-collision re-initialization vuln. Fresh deploy copies top 16 slots + EIP-1967 impl. RISK: proxy/impl layout is complex, re-init path may depend on state we didn't snapshot. If Red reports 'contract uninitialized', that's still a defensible access-control finding.",
  },
  {
    name: "Hedgey Finance",
    datasetMatch: "Hedgey Finance",
    contractName: "ClaimCampaigns",
    vulnerabilityClass: "access-control",
    expectedBehaviorOnFreshAddress:
      "Missing input validation on createLockedCampaign. Vuln is in the function body itself, independent of storage state — fresh deploy preserves the class.",
  },
  {
    name: "OlympusDAO BondFixedExpiry",
    datasetMatch: "OlympusDAO BondFixedExpiry",
    contractName: "BondFixedExpiryTeller",
    vulnerabilityClass: "logic-error",
    expectedBehaviorOnFreshAddress:
      "redeemFixed() missing ownership check. Fresh deploy preserves the bug; Red can demo by calling redeemFixed with any amount.",
  },
  {
    name: "TempleDAO STAX",
    datasetMatch: "TempleDAO STAX",
    contractName: "StaxLPStaking",
    vulnerabilityClass: "access-control",
    expectedBehaviorOnFreshAddress:
      "migrateStake access-control flaw. Static code pattern — fresh deploy keeps it.",
  },
  {
    name: "DFX Finance",
    datasetMatch: "DFX Finance",
    contractName: "Curve",
    vulnerabilityClass: "reentrancy",
    expectedBehaviorOnFreshAddress:
      "Flash-loan reentrancy in viewDeposit/deposit. RISK: reentrancy-exploit demo may need victim liquidity — Red may need to seed state via anvil_setStorageAt or pivot to showing the code-level reentrancy pattern.",
  },
  {
    name: "FloorDAO",
    datasetMatch: "FloorDAO",
    contractName: "FloorStaking",
    vulnerabilityClass: "flash-loan",
    expectedBehaviorOnFreshAddress:
      "Flash-loan + price oracle manipulation. RISK: exploit needs live pool state + attacker capital — fresh deploy may not be demonstrable end-to-end. Red should fall back to showing the code-level pattern.",
  },
  {
    name: "Floor Protocol",
    datasetMatch: "Floor Protocol",
    contractName: "FlooringPeriphery",
    vulnerabilityClass: "access-control",
    expectedBehaviorOnFreshAddress:
      "Missing role check on mint/burn. Static pattern, fresh deploy preserves.",
  },
  {
    name: "Seneca Protocol",
    datasetMatch: "Seneca Protocol",
    contractName: "Seneca",
    vulnerabilityClass: "access-control",
    expectedBehaviorOnFreshAddress:
      "Arbitrary-call in performOperations. Static pattern, fresh deploy preserves (same class as Dexible — good sanity check).",
  },
  {
    name: "Abracadabra",
    datasetMatch: "Abracadabra / Spell (MIM)",
    contractName: "CauldronV4",
    vulnerabilityClass: "reentrancy",
    expectedBehaviorOnFreshAddress:
      "Reentrancy in accrue(). Like DFX, demonstration may require live market state — Red may pivot to code-level finding.",
  },
];

interface DatasetEntry {
  name: string;
  contractAddress: string;
  blockNumber: number;
  chain: string;
  vulnerabilityClass: string;
}

interface HoldoutRosterEntry {
  name: string;
  contractName: string;
  originalAddress: string;
  forkBlockNumber: number;
  sourceDir: string;
  vulnerabilityClass: string;
  expectedBehaviorOnFreshAddress: string;
  sourceFetchStatus: "ok" | "skipped-cached" | "failed";
  sourceFetchError?: string;
  solFileCount?: number;
}

async function main(): Promise<void> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    console.error("ETHERSCAN_API_KEY not set. Cannot pre-fetch.");
    process.exit(1);
  }

  const datasetPath = resolve("benchmark/dataset.json");
  const dataset: DatasetEntry[] = JSON.parse(readFileSync(datasetPath, "utf-8"));
  const sourcesRoot = resolve("benchmark/sources");
  const rosterOutPath = resolve("benchmark/holdout-roster.json");

  if (!existsSync(sourcesRoot)) mkdirSync(sourcesRoot, { recursive: true });

  const outRoster: HoldoutRosterEntry[] = [];

  for (const r of ROSTER) {
    const entry = dataset.find((e) => e.name === r.datasetMatch);
    if (!entry) {
      console.error(`[${r.name}] MISSING from dataset.json (looked for '${r.datasetMatch}')`);
      outRoster.push({
        name: r.name,
        contractName: r.contractName,
        originalAddress: "",
        forkBlockNumber: 0,
        sourceDir: "",
        vulnerabilityClass: r.vulnerabilityClass,
        expectedBehaviorOnFreshAddress: r.expectedBehaviorOnFreshAddress,
        sourceFetchStatus: "failed",
        sourceFetchError: `not in dataset.json as '${r.datasetMatch}'`,
      });
      continue;
    }

    const safeName = r.name.replace(/[^A-Za-z0-9]+/g, "");
    const sourceDir = join(sourcesRoot, safeName);

    // Idempotent skip
    if (existsSync(sourceDir)) {
      const solFiles = walkSol(sourceDir);
      if (solFiles.length > 0) {
        console.log(`[${r.name}] cached (${solFiles.length} .sol files)`);
        outRoster.push({
          name: r.name,
          contractName: r.contractName,
          originalAddress: entry.contractAddress,
          forkBlockNumber: entry.blockNumber,
          sourceDir: relative(process.cwd(), sourceDir).replace(/\\/g, "/"),
          vulnerabilityClass: r.vulnerabilityClass,
          expectedBehaviorOnFreshAddress: r.expectedBehaviorOnFreshAddress,
          sourceFetchStatus: "skipped-cached",
          solFileCount: solFiles.length,
        });
        continue;
      }
    }

    mkdirSync(sourceDir, { recursive: true });

    try {
      console.log(`[${r.name}] fetching ${entry.contractAddress}…`);
      const info = await fetchContractSource(entry.contractAddress, apiKey, 1);
      for (const src of info.sources) {
        const outPath = join(sourceDir, src.filename);
        mkdirSync(dirname(outPath), { recursive: true });
        writeFileSync(outPath, src.content);
      }
      const solCount = info.sources.length;
      console.log(`[${r.name}] ok — ${solCount} .sol files (top-level ${info.name})`);
      outRoster.push({
        name: r.name,
        contractName: r.contractName,
        originalAddress: entry.contractAddress,
        forkBlockNumber: entry.blockNumber,
        sourceDir: relative(process.cwd(), sourceDir).replace(/\\/g, "/"),
        vulnerabilityClass: r.vulnerabilityClass,
        expectedBehaviorOnFreshAddress: r.expectedBehaviorOnFreshAddress,
        sourceFetchStatus: "ok",
        solFileCount: solCount,
      });
    } catch (err: any) {
      console.error(`[${r.name}] FAIL: ${err.message}`);
      outRoster.push({
        name: r.name,
        contractName: r.contractName,
        originalAddress: entry.contractAddress,
        forkBlockNumber: entry.blockNumber,
        sourceDir: relative(process.cwd(), sourceDir).replace(/\\/g, "/"),
        vulnerabilityClass: r.vulnerabilityClass,
        expectedBehaviorOnFreshAddress: r.expectedBehaviorOnFreshAddress,
        sourceFetchStatus: "failed",
        sourceFetchError: err.message,
      });
    }
  }

  writeFileSync(rosterOutPath, JSON.stringify(outRoster, null, 2));

  const ok = outRoster.filter((r) => r.sourceFetchStatus === "ok" || r.sourceFetchStatus === "skipped-cached").length;
  const failed = outRoster.filter((r) => r.sourceFetchStatus === "failed").length;
  console.log(`\nWrote roster: ${rosterOutPath}`);
  console.log(`  ok:     ${ok}/${outRoster.length}`);
  console.log(`  failed: ${failed}`);
  if (failed > 0) {
    console.log(`\nFailures:`);
    for (const r of outRoster.filter((r) => r.sourceFetchStatus === "failed")) {
      console.log(`  - ${r.name}: ${r.sourceFetchError}`);
    }
    process.exit(6);
  }
}

function walkSol(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".sol")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});

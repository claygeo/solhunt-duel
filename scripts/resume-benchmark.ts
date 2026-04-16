/**
 * Resume a partially-completed benchmark run.
 *
 * If a benchmark is interrupted (crash, kill, timeout), this script identifies
 * which contracts were already scanned and creates a subset dataset of the
 * remaining contracts. Re-runs those only, preserving the original's progress.
 *
 * Usage:
 *   npx tsx scripts/resume-benchmark.ts \
 *     --dataset benchmark/dataset-100.json \
 *     --benchmark-id <previous benchmark_run_id> \
 *     --out benchmark/resume-subset.json
 *
 * Then:
 *   nohup npx tsx src/index.ts benchmark \
 *     --dataset benchmark/resume-subset.json \
 *     --provider openrouter --model <same-model> \
 *     --max-budget <remaining budget> ...
 */

import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
config();
import { createClient } from "@supabase/supabase-js";

async function main() {
  const args = process.argv.slice(2);
  let datasetPath = "benchmark/dataset-100.json";
  let outPath = "benchmark/resume-subset.json";
  let benchmarkId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dataset" && args[i + 1]) datasetPath = args[++i];
    else if (args[i] === "--out" && args[i + 1]) outPath = args[++i];
    else if (args[i] === "--benchmark-id" && args[i + 1]) benchmarkId = args[++i];
  }

  if (!benchmarkId) {
    console.error("Usage: resume-benchmark.ts --benchmark-id <id> [--dataset X] [--out Y]");
    console.error("\nTo find recent benchmark IDs:");
    console.error("  npx tsx scripts/check-supabase.ts");
    process.exit(1);
  }

  const c = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

  // Get all scans already completed for this benchmark
  const { data: completed, error } = await c
    .from("scan_runs")
    .select("contract_id, contracts(address)")
    .eq("benchmark_run_id", benchmarkId);

  if (error) {
    console.error("Supabase error:", error.message);
    process.exit(1);
  }

  const completedAddrs = new Set(
    (completed ?? []).map((r: any) => r.contracts?.address?.toLowerCase()).filter(Boolean)
  );

  // Load original dataset
  const dataset: any[] = JSON.parse(readFileSync(datasetPath, "utf-8"));
  const remaining = dataset.filter(
    c => !completedAddrs.has(c.contractAddress.toLowerCase())
  );

  writeFileSync(outPath, JSON.stringify(remaining, null, 2));

  console.log(`\nBenchmark ${benchmarkId}:`);
  console.log(`  Completed: ${completedAddrs.size} / ${dataset.length}`);
  console.log(`  Remaining: ${remaining.length}`);
  console.log(`\nWrote ${remaining.length} remaining contracts to ${outPath}`);

  // Get total cost so far
  const { data: costSum } = await c
    .from("scan_runs")
    .select("cost_usd")
    .eq("benchmark_run_id", benchmarkId);
  const totalCost = (costSum ?? []).reduce((s: number, r: any) => s + (r.cost_usd ?? 0), 0);
  console.log(`  Cost so far: $${totalCost.toFixed(2)}`);

  if (remaining.length === 0) {
    console.log(`\nAll contracts already scanned. No resume needed.`);
    return;
  }

  console.log(`\nTo resume (same model/provider):`);
  console.log(`  cd /root/solhunt && nohup npx tsx src/index.ts benchmark \\`);
  console.log(`    --dataset ${outPath} \\`);
  console.log(`    --provider openrouter --model <same-as-before> \\`);
  console.log(`    --concurrency 3 --max-budget <remaining>  \\`);
  console.log(`    --output benchmark/results/resume.json \\`);
  console.log(`    > /root/solhunt/resume.log 2>&1 </dev/null & disown`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

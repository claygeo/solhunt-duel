/**
 * Curate a balanced 100-contract dataset from existing + imported entries.
 *
 * Strategy:
 * 1. Keep all existing 32 contracts (already curated).
 * 2. Dedupe imports by address.
 * 3. Fill to 100 with class balance targets (caps per class).
 * 4. Within each class, prefer newer exploits (closer to present) since they
 *    reflect more modern attack patterns.
 *
 * Usage:
 *   npx tsx scripts/curate-dataset.ts --target 100 --out benchmark/dataset-100.json
 */

import { readFileSync, writeFileSync } from "node:fs";

interface Entry {
  id: string;
  name: string;
  chain: string;
  blockNumber: number;
  contractAddress: string;
  vulnerabilityClass: string;
  description: string;
  referenceExploit: string;
  date: string;
  valueImpacted: string;
}

// Realistic caps based on available supply in dedupped set.
// Target total = sum of caps = 100.
const CLASS_CAPS: Record<string, number> = {
  "logic-error": 25,
  "access-control": 20,
  "price-manipulation": 20,
  "reentrancy": 18,
  "integer-overflow": 6,
  "flash-loan": 6,
  "delegatecall": 2,
  "unchecked-return": 1,
  "read-only-reentrancy": 1,
  "oracle-manipulation": 1,
};

interface Options {
  existingPath: string;
  importedPath: string;
  outPath: string;
  target: number;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const opts: Options = {
    existingPath: "benchmark/dataset.json",
    importedPath: "benchmark/imported.json",
    outPath: "benchmark/dataset-100.json",
    target: 100,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--existing" && args[i + 1]) opts.existingPath = args[++i];
    else if (args[i] === "--imported" && args[i + 1]) opts.importedPath = args[++i];
    else if (args[i] === "--out" && args[i + 1]) opts.outPath = args[++i];
    else if (args[i] === "--target" && args[i + 1]) opts.target = parseInt(args[++i], 10);
  }
  return opts;
}

function main() {
  const opts = parseArgs();

  const existing: Entry[] = JSON.parse(readFileSync(opts.existingPath, "utf-8"));
  const imported: Entry[] = JSON.parse(readFileSync(opts.importedPath, "utf-8"));

  console.log(`Existing: ${existing.length}`);
  console.log(`Imported: ${imported.length}`);

  // Dedupe imported against existing (by lowercase address)
  const existingAddrs = new Set(existing.map(e => e.contractAddress.toLowerCase()));
  const newImports = imported.filter(i => !existingAddrs.has(i.contractAddress.toLowerCase()));
  console.log(`After dedup: ${newImports.length} new candidates`);

  // Start with existing - they're pre-curated and trusted
  const selected: Entry[] = [...existing];
  const classCounts: Record<string, number> = {};
  for (const e of selected) {
    classCounts[e.vulnerabilityClass] = (classCounts[e.vulnerabilityClass] ?? 0) + 1;
  }

  // Sort imports by date descending (newer first) so we prefer modern patterns
  newImports.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  // Fill to target, respecting class caps
  for (const candidate of newImports) {
    if (selected.length >= opts.target) break;
    const cls = candidate.vulnerabilityClass;
    const cap = CLASS_CAPS[cls] ?? 0;
    const current = classCounts[cls] ?? 0;
    if (current < cap) {
      selected.push(candidate);
      classCounts[cls] = current + 1;
    }
  }

  // Renumber IDs for consistency
  const classIndices: Record<string, number> = {};
  for (const e of selected) {
    classIndices[e.vulnerabilityClass] = (classIndices[e.vulnerabilityClass] ?? 0) + 1;
    const idx = String(classIndices[e.vulnerabilityClass]).padStart(3, "0");
    // Only renumber imported entries (they have "-imported" suffix); keep originals untouched
    if (e.id.endsWith("-imported")) {
      e.id = `${e.vulnerabilityClass}-${idx}-imported`;
    }
  }

  writeFileSync(opts.outPath, JSON.stringify(selected, null, 2));

  console.log(`\nCurated ${selected.length} contracts to ${opts.outPath}`);
  console.log(`\nFinal distribution:`);
  for (const [cls, count] of Object.entries(classCounts).sort((a, b) => b[1] - a[1])) {
    const cap = CLASS_CAPS[cls] ?? 0;
    console.log(`  ${cls}: ${count}${cap ? ` (cap ${cap})` : ""}`);
  }

  // Report unfilled class caps
  const shortfalls: string[] = [];
  for (const [cls, cap] of Object.entries(CLASS_CAPS)) {
    const actual = classCounts[cls] ?? 0;
    if (actual < cap) shortfalls.push(`${cls}: ${actual}/${cap}`);
  }
  if (shortfalls.length > 0) {
    console.log(`\nShortfalls (not enough supply):`);
    shortfalls.forEach(s => console.log(`  ${s}`));
  }
}

main();

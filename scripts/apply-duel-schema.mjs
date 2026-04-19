#!/usr/bin/env node
/**
 * Applies src/storage/schema-duel.sql to the Supabase project.
 *
 * Two paths:
 *   1. If DATABASE_URL is set, uses node-postgres directly (preferred).
 *   2. Otherwise, prints the SQL + manual steps for the Supabase SQL editor.
 *
 * Idempotent: the migration uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
 * throughout, so re-running is safe.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = resolve(__dirname, "../src/storage/schema-duel.sql");

async function main() {
  const sql = readFileSync(SQL_PATH, "utf-8");

  const dbUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL / POSTGRES_URL not set.");
    console.error("");
    console.error("Manual apply steps:");
    console.error(
      "  1. Open https://supabase.com/dashboard/project/xogipstirlipvoaabbid/sql/new"
    );
    console.error("  2. Paste the contents of src/storage/schema-duel.sql");
    console.error("  3. Click Run.");
    console.error("");
    console.error("Or set DATABASE_URL (Supabase → Settings → Database → Connection string)");
    console.error("and re-run: node scripts/apply-duel-schema.mjs");
    process.exit(2);
  }

  let pg;
  try {
    pg = await import("pg");
  } catch {
    console.error(
      "pg module not found. Install it first: npm install --save-dev pg"
    );
    process.exit(3);
  }
  const { Client } = pg.default ?? pg;
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    console.log("Applying schema-duel.sql ...");
    await client.query(sql);
    console.log("OK. schema-duel.sql applied.");
    // Sanity check — list new tables/cols.
    const { rows } = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN ('duel_runs','duel_rounds')
      ORDER BY table_name;
    `);
    console.log("Tables present:", rows.map((r) => r.table_name).join(", "));
    const { rows: colRows } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='scan_runs' AND column_name='agent_role';
    `);
    console.log(
      `scan_runs.agent_role: ${colRows.length ? "present" : "MISSING"}`
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Apply failed:", err?.message ?? err);
  process.exit(1);
});

-- solhunt-duel — Phase 2 schema additions
-- Apply after schema.sql. Idempotent — safe to re-run.

-- Red/blue distinction on existing scan_runs (Blue reuses the same table)
ALTER TABLE scan_runs
  ADD COLUMN IF NOT EXISTS agent_role TEXT
    CHECK (agent_role IS NULL OR agent_role IN ('red', 'blue'))
    DEFAULT 'red';

CREATE INDEX IF NOT EXISTS idx_scan_runs_agent_role ON scan_runs(agent_role);

-- duel_runs: one row per contract under duel, summary stats + convergence verdict
CREATE TABLE IF NOT EXISTS duel_runs (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id         UUID REFERENCES contracts(id),
  dataset_split       TEXT CHECK (dataset_split IN ('train', 'holdout', 'adversarial')),
  max_rounds          INTEGER NOT NULL DEFAULT 3,
  rounds_executed     INTEGER NOT NULL DEFAULT 0,
  convergence         TEXT CHECK (convergence IN ('hardened', 'blue_failed', 'budget_exhausted', 'same_class_escaped', 'running')),
  total_cost_usd      NUMERIC(10,4) DEFAULT 0,
  duration_ms         INTEGER DEFAULT 0,
  final_source_path   TEXT,
  audit_trail_path    TEXT,
  -- Held-out red validation: did a different-model red still find exploits on the final hardened contract?
  holdout_red_model   TEXT,
  holdout_red_found_new BOOLEAN,
  holdout_red_scan_run_id UUID REFERENCES scan_runs(id),
  hostname            TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duel_runs_contract ON duel_runs(contract_id);
CREATE INDEX IF NOT EXISTS idx_duel_runs_convergence ON duel_runs(convergence);
CREATE INDEX IF NOT EXISTS idx_duel_runs_split ON duel_runs(dataset_split);

-- duel_rounds: per-round audit. One red scan + one blue patch per round.
CREATE TABLE IF NOT EXISTS duel_rounds (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  duel_run_id         UUID REFERENCES duel_runs(id) ON DELETE CASCADE,
  round_index         INTEGER NOT NULL,
  -- Red phase
  red_scan_run_id     UUID REFERENCES scan_runs(id),
  red_found           BOOLEAN,
  red_vuln_class      TEXT,
  -- Blue phase
  blue_scan_run_id    UUID REFERENCES scan_runs(id),
  blue_success        BOOLEAN,
  -- Defensibility gates (mirrors PatchVerification)
  exploit_neutralized   BOOLEAN,
  benign_passed         BOOLEAN,
  fresh_attacker_neutralized BOOLEAN,
  storage_layout_changed BOOLEAN,
  -- Patch artifacts
  patch_diff_path     TEXT,
  patch_rationale     TEXT,
  patch_loc_added     INTEGER,
  patch_loc_removed   INTEGER,
  -- Audit trail entry (grounded retrospective)
  audit_entry         JSONB,
  round_cost_usd      NUMERIC(10,4) DEFAULT 0,
  round_duration_ms   INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(duel_run_id, round_index)
);

CREATE INDEX IF NOT EXISTS idx_duel_rounds_duel ON duel_rounds(duel_run_id);
CREATE INDEX IF NOT EXISTS idx_duel_rounds_ordered ON duel_rounds(duel_run_id, round_index);

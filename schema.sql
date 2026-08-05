-- Snapshot + misc key/value storage. The Claude Routine overwrites the
-- "snapshot" row on every push; boards render from it.
CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Live policy events received from Onyx webhooks (milestone 3). One row per
-- policy (POLICY_UPDATED replaces the row). Boards add events newer than the
-- current snapshot's generated_at, so every Routine snapshot self-heals any
-- missed or duplicated webhook.
CREATE TABLE IF NOT EXISTS policy_events (
  policy_id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,
  product TEXT NOT NULL,          -- core | sthhc | hi | ancillary
  agent TEXT,
  payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_policy_events_ts ON policy_events (ts);

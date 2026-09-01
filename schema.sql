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

-- Contest-scoring policy events from the Onyx webhook (The Paper Chase).
-- Separate from policy_events because the contest needs the premium, the
-- lead (to spot an STHHC written on the same call as a Core, which scores
-- zero) and the agent's display name. Rows older than the last standings
-- push are pruned: that push is authoritative and already contains them.
CREATE TABLE IF NOT EXISTS contest_events (
  policy_id INTEGER PRIMARY KEY,
  ts TEXT NOT NULL,               -- when the delivery was received
  bucket TEXT NOT NULL,           -- CORE | STHHC | HI
  agent TEXT,                     -- resolved display name, else NULL
  agent_key TEXT,                 -- user id / email exactly as delivered
  premium REAL DEFAULT 0,
  lead_id TEXT,
  scorable INTEGER DEFAULT 0      -- 0 when a field was missing; the next push corrects it
);

CREATE INDEX IF NOT EXISTS idx_contest_events_ts ON contest_events (ts);

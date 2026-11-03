-- Map metadata; full campaign JSON lives in R2 at r2_key.
CREATE TABLE IF NOT EXISTS maps (
  id TEXT PRIMARY KEY NOT NULL,
  owner_email TEXT NOT NULL,
  name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS maps_owner_updated
  ON maps (owner_email, updated_at DESC);

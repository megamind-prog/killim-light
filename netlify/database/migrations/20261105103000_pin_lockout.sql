-- Wrong-PIN counter per phone number, for the "5 wrong PINs = locked for 15 minutes" rule.
-- Kept in Postgres (not Blobs) so concurrent attempts are counted exactly, in one atomic statement.
CREATE TABLE IF NOT EXISTS pin_lockout (
  phone        TEXT PRIMARY KEY,
  fails        INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

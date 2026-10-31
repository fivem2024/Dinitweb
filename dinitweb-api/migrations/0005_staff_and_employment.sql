CREATE TABLE IF NOT EXISTS staff_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS employment_contracts (
  id TEXT PRIMARY KEY,
  employee_name TEXT NOT NULL,
  employee_email TEXT NOT NULL DEFAULT '',
  employee_phone TEXT NOT NULL DEFAULT '',
  job_title TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  start_date TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS employment_contracts_created_at_idx
  ON employment_contracts(created_at DESC);


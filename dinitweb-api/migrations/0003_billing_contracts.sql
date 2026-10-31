PRAGMA foreign_keys = ON;

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount_dkk INTEGER NOT NULL CHECK (amount_dkk > 0),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Kladde' CHECK (status IN ('Kladde', 'Sendt', 'Betalt', 'Forfalden')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE contracts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  start_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Kladde' CHECK (status IN ('Kladde', 'Sendt', 'Underskrevet', 'Afsluttet')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX invoices_customer_idx ON invoices(customer_id, created_at DESC);
CREATE INDEX contracts_customer_idx ON contracts(customer_id, created_at DESC);


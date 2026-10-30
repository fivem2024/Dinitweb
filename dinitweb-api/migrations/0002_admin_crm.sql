PRAGMA foreign_keys = ON;

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Lead' CHECK (status IN ('Lead', 'Aktiv', 'Afventer', 'Afsluttet')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE customer_notes (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT NOT NULL DEFAULT 'DinitWeb',
  contact_email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO business_settings (id) VALUES (1);
CREATE INDEX customer_notes_customer_idx ON customer_notes(customer_id, created_at DESC);


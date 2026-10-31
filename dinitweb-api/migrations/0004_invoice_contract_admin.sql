ALTER TABLE business_settings ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE business_settings ADD COLUMN cvr TEXT NOT NULL DEFAULT '';
ALTER TABLE business_settings ADD COLUMN vat_registered INTEGER NOT NULL DEFAULT 0;


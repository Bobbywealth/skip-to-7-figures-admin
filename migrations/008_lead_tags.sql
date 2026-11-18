-- 008 - lead tags (comma-separated, e.g. "vip,booked")
--
-- One ALTER per migration file on purpose: a D1 ALTER inside a multi-statement
-- `wrangler d1 execute --file` is SILENTLY SKIPPED. Apply and verify with
-- `pragma_table_info('applications')`, then update schema.sql to match.
ALTER TABLE applications ADD COLUMN tags TEXT;

-- 007 - follow-up reminders
--
-- A lead can carry a follow-up date, so the dashboard can surface "remind me
-- tomorrow" work instead of leaving it in someone's head.
--
-- NOTE: a D1 ALTER inside a multi-statement `wrangler d1 execute --file` is
-- SILENTLY SKIPPED. One ALTER per migration file on purpose. Apply and verify
-- with `pragma_table_info('applications')`, then keep schema.sql in step.
ALTER TABLE applications ADD COLUMN next_action_at TEXT;

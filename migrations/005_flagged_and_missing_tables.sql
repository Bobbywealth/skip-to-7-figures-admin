-- 005: a separate "unverified" flag, plus the tables the migrations never created.
--
-- The Turnstile "this applicant skipped the bot check" state used to be written
-- into the `spam` column, so a real applicant whose ad-blocker killed the
-- Turnstile script was shown in the dashboard as SPAM. `flagged` now carries
-- that state and `spam` is reserved for a human marking a lead as spam.
ALTER TABLE applications ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_applications_flagged ON applications(flagged);

-- These three tables were in schema.sql but in NO migration, so a database
-- built from the migrations folder was missing them: /api/track threw (no
-- page views were ever recorded) and notifyLead threw (the Telegram alert
-- for every lead was swallowed). Both failures were silent.
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  path TEXT,
  count INTEGER NOT NULL DEFAULT 0,
  visitor_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_visits_day ON visits(day);

CREATE TABLE IF NOT EXISTS notify_guard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  last_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip);

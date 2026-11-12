-- Skip to 7 Figures admin — migration 002 (applied once)
-- Adds: lead scoring, pipeline stage, activity log, notes metadata, dedupe/spam flags,
--        UTM capture, funnel events, error log, settings, API keys, admin session tracking,
--        outbound webhooks, and the daily digest log.

ALTER TABLE applications ADD COLUMN stage       TEXT NOT NULL DEFAULT 'new';
ALTER TABLE applications ADD COLUMN score       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN owner       TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN spam        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE applications ADD COLUMN duplicate_of INTEGER;
ALTER TABLE applications ADD COLUMN last_contacted_at TEXT;
ALTER TABLE applications ADD COLUMN notes_updated_at  TEXT;
ALTER TABLE applications ADD COLUMN notes_author      TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN utm_source   TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN utm_medium   TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN utm_campaign TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN utm_content  TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN utm_term     TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN gclid       TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN fbclid      TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN device      TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN country     TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN visitor_id  TEXT NOT NULL DEFAULT '';

-- carry any pre-existing status into the new stage column
UPDATE applications SET stage = status WHERE stage = 'new' AND status <> 'new';

-- audit trail: every state change is recorded
CREATE TABLE IF NOT EXISTS activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  actor      TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL DEFAULT '',
  entity     TEXT NOT NULL DEFAULT 'application',
  entity_id  INTEGER,
  detail     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity(entity, entity_id);

-- funnel events from the public site (view / start / complete / CTA click)
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name       TEXT NOT NULL DEFAULT '',
  path       TEXT NOT NULL DEFAULT '/',
  visitor_id TEXT NOT NULL DEFAULT '',
  data       TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_events_name ON events(name, created_at);

-- application errors, surfaced in the dashboard
CREATE TABLE IF NOT EXISTS errors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  message    TEXT NOT NULL DEFAULT '',
  path       TEXT NOT NULL DEFAULT ''
);

-- key/value settings (retention days, digest time, support details...)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- API keys for external integrations (only the hash is stored)
CREATE TABLE IF NOT EXISTS api_keys (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL DEFAULT '',
  prefix     TEXT NOT NULL DEFAULT '',
  key_hash   TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

-- admin sessions, so they can be listed and revoked
CREATE TABLE IF NOT EXISTS admin_sessions (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen  TEXT,
  user_agent TEXT NOT NULL DEFAULT '',
  revoked    INTEGER NOT NULL DEFAULT 0
);

-- outbound webhook deliveries
CREATE TABLE IF NOT EXISTS webhook_out (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  url        TEXT NOT NULL DEFAULT '',
  event      TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT '',
  response   TEXT NOT NULL DEFAULT ''
);

-- digest / notification log
CREATE TABLE IF NOT EXISTS notify_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  kind       TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT ''
);

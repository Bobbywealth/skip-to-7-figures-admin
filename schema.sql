-- Skip to 7 Figures admin - FULL schema for a fresh database.
-- This file is the complete current schema. On a new database it creates
-- everything; on an existing one every statement is IF NOT EXISTS, so it is a
-- no-op. The migrations/ folder carries the same statements for databases that
-- were created before this file was made complete.
--
--   wrangler d1 execute skip7figures --remote --file=schema.sql

CREATE TABLE _cf_KV (
        key TEXT PRIMARY KEY,
        value BLOB
      ) WITHOUT ROWID

CREATE TABLE activity (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  actor      TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL DEFAULT '',
  entity     TEXT NOT NULL DEFAULT 'application',
  entity_id  INTEGER,
  detail     TEXT NOT NULL DEFAULT ''
)

CREATE TABLE admin_sessions (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen  TEXT,
  user_agent TEXT NOT NULL DEFAULT '',
  revoked    INTEGER NOT NULL DEFAULT 0
)

CREATE TABLE admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  iterations    INTEGER NOT NULL DEFAULT 210000,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
)

CREATE TABLE api_keys (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL DEFAULT '',
  prefix     TEXT NOT NULL DEFAULT '',
  key_hash   TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
)

CREATE TABLE applications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  name        TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  capital     TEXT NOT NULL DEFAULT '',
  timeline    TEXT NOT NULL DEFAULT '',
  experience  TEXT NOT NULL DEFAULT '',
  interest    TEXT NOT NULL DEFAULT '',
  decision    TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'new',
  notes       TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'funnel',
  page_url    TEXT NOT NULL DEFAULT '',
  referrer    TEXT NOT NULL DEFAULT '',
  user_agent  TEXT NOT NULL DEFAULT '',
  ip_hash     TEXT NOT NULL DEFAULT ''
, stage       TEXT NOT NULL DEFAULT 'new', score       INTEGER NOT NULL DEFAULT 0, owner       TEXT NOT NULL DEFAULT '', spam        INTEGER NOT NULL DEFAULT 0, duplicate_of INTEGER, last_contacted_at TEXT, notes_updated_at  TEXT, notes_author      TEXT NOT NULL DEFAULT '', utm_source   TEXT NOT NULL DEFAULT '', utm_medium   TEXT NOT NULL DEFAULT '', utm_campaign TEXT NOT NULL DEFAULT '', utm_content  TEXT NOT NULL DEFAULT '', utm_term     TEXT NOT NULL DEFAULT '', gclid       TEXT NOT NULL DEFAULT '', fbclid      TEXT NOT NULL DEFAULT '', device      TEXT NOT NULL DEFAULT '', country     TEXT NOT NULL DEFAULT '', visitor_id  TEXT NOT NULL DEFAULT '', delete_token TEXT NOT NULL DEFAULT '')

CREATE TABLE content (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
)

CREATE TABLE errors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  message    TEXT NOT NULL DEFAULT '',
  path       TEXT NOT NULL DEFAULT ''
)

CREATE TABLE events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  name       TEXT NOT NULL DEFAULT '',
  path       TEXT NOT NULL DEFAULT '/',
  visitor_id TEXT NOT NULL DEFAULT '',
  data       TEXT NOT NULL DEFAULT ''
)

CREATE TABLE login_attempts (
  ip       TEXT PRIMARY KEY,
  count    INTEGER NOT NULL DEFAULT 0,
  last_at  INTEGER NOT NULL
)

CREATE TABLE migrations (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)

CREATE TABLE notify_guard (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
)

CREATE TABLE notify_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  kind       TEXT NOT NULL DEFAULT '',
  detail     TEXT NOT NULL DEFAULT ''
)

CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
)

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
)

CREATE TABLE visits (
  day   TEXT NOT NULL,
  path  TEXT NOT NULL DEFAULT '/',
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
)

CREATE TABLE webhook_out (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  url        TEXT NOT NULL DEFAULT '',
  event      TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT '',
  response   TEXT NOT NULL DEFAULT ''
)

CREATE INDEX idx_activity_entity ON activity(entity, entity_id)

CREATE INDEX idx_app_created ON applications(created_at DESC)

CREATE INDEX idx_app_delete_token ON applications(delete_token)

CREATE INDEX idx_app_email   ON applications(email)

CREATE INDEX idx_app_status  ON applications(status)

CREATE INDEX idx_events_name ON events(name, created_at)

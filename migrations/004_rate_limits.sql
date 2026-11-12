-- Migration 004: generic rate limiting table + deployment bookkeeping
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS migrations (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO migrations(name) VALUES ('001_core');
INSERT OR IGNORE INTO migrations(name) VALUES ('002_core');
INSERT OR IGNORE INTO migrations(name) VALUES ('003_delete_token');
INSERT OR IGNORE INTO migrations(name) VALUES ('004_rate_limits');

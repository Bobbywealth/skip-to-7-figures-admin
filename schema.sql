-- Skip to 7 Figures — admin + leads database (Cloudflare D1)
-- Applied with:  wrangler d1 execute skip7figures --file=schema.sql --remote

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  iterations    INTEGER NOT NULL DEFAULT 100000,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS applications (
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
);
CREATE INDEX IF NOT EXISTS idx_app_created ON applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_status  ON applications(status);
CREATE INDEX IF NOT EXISTS idx_app_email   ON applications(email);

-- Daily page-view counts, keyed by date + path
CREATE TABLE IF NOT EXISTS visits (
  day   TEXT NOT NULL,
  path  TEXT NOT NULL DEFAULT '/',
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path)
);

-- Per-IP login attempt counters (brute-force throttle)
CREATE TABLE IF NOT EXISTS login_attempts (
  ip       TEXT PRIMARY KEY,
  count    INTEGER NOT NULL DEFAULT 0,
  last_at  INTEGER NOT NULL
);

-- Editable site copy (the funnel reads this over the static defaults)
CREATE TABLE IF NOT EXISTS content (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
INSERT OR IGNORE INTO content(key,value) VALUES ('headline','');
INSERT OR IGNORE INTO content(key,value) VALUES ('subheadline','');
INSERT OR IGNORE INTO content(key,value) VALUES ('cta_label','');
INSERT OR IGNORE INTO content(key,value) VALUES ('specialties','');

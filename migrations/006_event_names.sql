-- 006: every event carries a name in the column Meta expects, plus the id
-- that links the browser event to the server-side conversion event.
--
-- Meta's Conversions API REQUIRES 'event_name' on every server event and
-- rejects an event that carries none ("Missing event name"). The funnel site
-- already sent 'name'; both spellings are stored now, together with the id
-- the browser pixel used, so the server-side event can be de-duplicated by
-- Meta instead of being counted a second time.
ALTER TABLE events ADD COLUMN event_name TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN event_id TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN fbp TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN fbc TEXT NOT NULL DEFAULT '';

-- the same values on the lead row, so a conversion can be traced end to end
ALTER TABLE applications ADD COLUMN event_id TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN fbp TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN fbc TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_events_event_name ON events(event_name, created_at);

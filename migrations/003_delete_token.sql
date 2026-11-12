-- Migration 003: per-application self-service delete token
-- A per-lead random token so a visitor can delete their OWN application without
-- exposing the ability to delete anyone else's record by guessing an email.
ALTER TABLE applications ADD COLUMN delete_token TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_app_delete_token ON applications(delete_token);

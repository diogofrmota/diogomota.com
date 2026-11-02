-- When a library entry was added or last changed (status, progress, rating or
-- favourite). Home lists each section's titles with the latest change first.
ALTER TABLE user_shows ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX user_shows_user_id_updated_at_idx ON user_shows (user_id, updated_at DESC);

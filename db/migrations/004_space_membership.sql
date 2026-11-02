ALTER TABLE users ADD COLUMN space_joined_at timestamptz;
UPDATE users SET space_joined_at = created_at WHERE space_id IS NOT NULL;
CREATE UNIQUE INDEX users_space_color_key ON users (space_id, space_color);
CREATE INDEX users_space_joined_idx ON users (space_id, space_joined_at, id);

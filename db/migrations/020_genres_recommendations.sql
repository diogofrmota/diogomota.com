-- 020_genres_recommendations: a title's genres, and titles recommended to a friend.

-- TMDB's genre names, e.g. {Drama,Comedy}. Null until the title is fetched again
-- (lib/shows.ts refreshes titles older than 7 days, and those without genres).
ALTER TABLE shows ADD COLUMN genres text[];

-- "Recommend to a friend" from a title's panel; it shows in their Discover.
CREATE TABLE recommendations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  to_user    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  show_id    uuid NOT NULL REFERENCES shows (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_user, to_user, show_id),
  CHECK (from_user <> to_user)
);
CREATE INDEX recommendations_to_user_idx ON recommendations (to_user, created_at DESC);

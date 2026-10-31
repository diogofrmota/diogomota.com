-- 001_initial: the full schema from plan.md "Database Schema".
-- Applied by app/scripts/migrate.mjs inside a transaction, so no BEGIN/COMMIT here.
-- Never edit a migration that has been applied; add 002_..., 003_... instead.

-- Case-insensitive text, so "Diogo" and "diogo" are the same username/email.
CREATE EXTENSION IF NOT EXISTS citext;

-- Accounts (one table for every app) -----------------------------------------

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username         citext NOT NULL UNIQUE,
  email            citext NOT NULL UNIQUE,
  password_hash    text NOT NULL,
  -- Shared app: the one space the user is in (NULL = none) and their color in it.
  space_id         uuid,
  space_color      text CHECK (space_color ~ '^#[0-9a-fA-F]{6}$'),
  theme_preference text NOT NULL DEFAULT 'dark' CHECK (theme_preference IN ('light', 'dark')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_resets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, -- SHA-256 of the emailed token; the token itself is never stored
  expires_at timestamptz NOT NULL,
  used       boolean NOT NULL DEFAULT false
);
CREATE INDEX password_resets_user_id_idx ON password_resets (user_id);

-- Shared app -----------------------------------------------------------------

CREATE TABLE spaces (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL, -- the owner; other members have role "member"
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX spaces_created_by_idx ON spaces (created_by);

-- Added after spaces exists (users and spaces reference each other).
ALTER TABLE users
  ADD CONSTRAINT users_space_id_fkey FOREIGN KEY (space_id) REFERENCES spaces (id) ON DELETE SET NULL;
CREATE INDEX users_space_id_idx ON users (space_id);

CREATE TABLE invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id   uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
  code       text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used       boolean NOT NULL DEFAULT false
);
CREATE INDEX invites_space_id_idx ON invites (space_id);

CREATE TABLE events (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id  uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
  title     text NOT NULL,
  notes     text,
  -- "start"/"end" in plan.md; END is a reserved word. Stored in UTC.
  starts_at timestamptz NOT NULL,
  ends_at   timestamptz NOT NULL,
  is_group  boolean NOT NULL DEFAULT false, -- applies to every member of the space
  CHECK (ends_at >= starts_at)
);
CREATE INDEX events_space_id_starts_at_idx ON events (space_id, starts_at);

CREATE TABLE event_assignees (
  event_id uuid NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_assignees_user_id_idx ON event_assignees (user_id);

CREATE TABLE task_lists (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces (id) ON DELETE CASCADE,
  name     text NOT NULL,
  position integer NOT NULL
);
CREATE INDEX task_lists_space_id_position_idx ON task_lists (space_id, position);

CREATE TABLE tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id     uuid NOT NULL REFERENCES task_lists (id) ON DELETE CASCADE,
  title       text NOT NULL,
  notes       text,
  due_date    date,
  assignee_id uuid REFERENCES users (id) ON DELETE SET NULL, -- NULL = unassigned
  is_complete boolean NOT NULL DEFAULT false,
  position    integer NOT NULL
);
CREATE INDEX tasks_list_id_position_idx ON tasks (list_id, position);
CREATE INDEX tasks_assignee_id_idx ON tasks (assignee_id);

-- Shows Tracker --------------------------------------------------------------

-- Local cache of TMDB data, refreshed when last_updated is older than 7 days.
CREATE TABLE shows (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id             integer NOT NULL,
  type                text NOT NULL CHECK (type IN ('tv', 'movie')),
  title               text NOT NULL,
  poster_url          text,
  year                integer,
  overview            text,
  runtime             integer, -- movie: minutes
  episode_runtime     integer, -- tv: typical episode length in minutes
  -- tv: episode count of each regular season (no specials). Arrays are 1-based, so
  -- episodes_per_season[2] is season 2; cardinality() is the season count.
  episodes_per_season integer[],
  last_updated        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tmdb_id, type) -- TMDB ids are only unique per media type
);

CREATE TABLE user_shows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- RESTRICT: a cached show can't be purged while it is in someone's library.
  show_id         uuid NOT NULL REFERENCES shows (id) ON DELETE RESTRICT,
  status          text NOT NULL CHECK (status IN ('watching', 'planned', 'completed')),
  rating          smallint CHECK (rating BETWEEN 1 AND 5),
  current_season  integer, -- tv progress, shown as e.g. S2 E5
  current_episode integer,
  is_favourite    boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, show_id)
);
CREATE INDEX user_shows_show_id_idx ON user_shows (show_id);

CREATE TABLE friendships (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE, -- sent the request
  friend_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE, -- received it
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id <> friend_id)
);
-- One row per pair of users, whichever of them sent the request.
CREATE UNIQUE INDEX friendships_pair_key
  ON friendships (LEAST(user_id, friend_id), GREATEST(user_id, friend_id));
CREATE INDEX friendships_user_id_idx ON friendships (user_id);
CREATE INDEX friendships_friend_id_idx ON friendships (friend_id);

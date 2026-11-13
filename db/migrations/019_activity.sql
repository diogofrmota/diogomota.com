-- 019_activity: what people did, for the activity feeds (lib/activity.ts): a
-- space's members see its activity in Shared, and friends see each other's in
-- Shows. Kept 60 days.
CREATE TABLE activity (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Who did it.
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Shared: the space it happened in; its members see it. Null for Shows.
  space_id   uuid REFERENCES spaces (id) ON DELETE CASCADE,
  -- Shows: the title it is about; the user's friends see it. Null for Shared.
  show_id    uuid REFERENCES shows (id) ON DELETE CASCADE,
  -- What happened, e.g. 'event-added' or 'completed' (lib/activity.ts).
  kind       text NOT NULL,
  -- What to show with it, e.g. the event's title and date.
  data       jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_space_id_idx ON activity (space_id, created_at DESC) WHERE space_id IS NOT NULL;
CREATE INDEX activity_user_id_idx ON activity (user_id, created_at DESC);

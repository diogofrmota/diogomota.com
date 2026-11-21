-- 029_couples_groups: For Couples (docs/decisions/0023). Recipes and the
-- shopping list belong to the user's group of two, as its calendar and tasks
-- do. Only added and loosened: the previous release keeps reading and writing
-- by user_id, and the rows it writes have no space_id until their user's next
-- Recipes request in a group adopts them (lib/recipe-groups.ts).

-- The group a recipe or a line of the list is in. Without one ("parked"), it
-- is its user's, and comes along when they create or join a group. SET NULL,
-- not CASCADE: the new code deletes a group's recipes itself, with their photos'
-- files (lib/spaces.ts, leave); a release before it, rolled back to, deletes
-- spaces without knowing of them, and then they go back to whoever added them.
ALTER TABLE recipes ADD COLUMN space_id uuid REFERENCES spaces (id) ON DELETE SET NULL;
ALTER TABLE shopping_items ADD COLUMN space_id uuid REFERENCES spaces (id) ON DELETE SET NULL;
CREATE INDEX recipes_space_idx ON recipes (space_id, created_at DESC);
CREATE INDEX shopping_items_space_idx ON shopping_items (space_id, position);

-- user_id is now who added it, and outlives them: a partner deleting their
-- account leaves the group's recipes where they are. A user's parked ones are
-- deleted with their account by lib/account-deletion.ts.
ALTER TABLE recipes ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE recipes
  DROP CONSTRAINT recipes_user_id_fkey,
  ADD CONSTRAINT recipes_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE shopping_items ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE shopping_items
  DROP CONSTRAINT shopping_items_user_id_fkey,
  ADD CONSTRAINT shopping_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;

-- Everyone's recipes into their group, if they have one.
UPDATE recipes r SET space_id = u.space_id FROM users u WHERE u.id = r.user_id AND u.space_id IS NOT NULL;

-- One list per group: its members' lines, members in the order they joined,
-- each one's lines in their own order. Each user's lines keep their order among
-- themselves, so the previous release still adds to the end of its user's.
WITH merged AS (
  SELECT s.id, u.space_id,
    row_number() OVER (PARTITION BY u.space_id ORDER BY u.space_joined_at, u.id, s.position, s.id) - 1 AS position
  FROM shopping_items s JOIN users u ON u.id = s.user_id
  WHERE u.space_id IS NOT NULL
)
UPDATE shopping_items s SET space_id = merged.space_id, position = merged.position FROM merged WHERE s.id = merged.id;

-- A job without a user: a deleted group's recipe photos, with no profile
-- picture to remove (scripts/media-cleanup.mjs).
ALTER TABLE media_cleanup_jobs ALTER COLUMN user_id DROP NOT NULL;

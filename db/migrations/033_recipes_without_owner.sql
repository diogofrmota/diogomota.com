-- 033_recipes_without_owner: deletes the recipes and lines of the shopping list
-- that have neither a group nor a user, which nobody can see.
-- contract: recipes and shopping_items rows with neither space_id nor user_id, unread since v2.0.2
-- An image from before 029 (older than v2.0.2) left them behind, deleting an
-- account or a group's last member: 029 made both foreign keys SET NULL, and
-- only the code since deletes a user's parked rows and a group's rows itself
-- (lib/account-deletion.ts, lib/spaces.ts). Since 032 a rollback can't go back
-- that far.

-- Their photos' rows go with the recipes (recipe_photos ON DELETE CASCADE);
-- their files are queued first, as lib/recipe-groups.ts removeGroupRecipes does,
-- for scripts/cleanup-media.mjs (docs/operations.md, Remediation rollout and
-- media cleanup).
INSERT INTO media_cleanup_jobs (user_id, photo_ids)
SELECT NULL, array_agg(p.id)
FROM recipe_photos p JOIN recipes r ON r.id = p.recipe_id
WHERE r.space_id IS NULL AND r.user_id IS NULL
HAVING count(*) > 0;

DELETE FROM shopping_items WHERE space_id IS NULL AND user_id IS NULL;
DELETE FROM recipes WHERE space_id IS NULL AND user_id IS NULL;

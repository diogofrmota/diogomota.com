-- 012_unnamed_spaces_profile_pictures: Shared's spaces no longer have a name.
-- A space is just its members, its calendar and its task lists: it is created
-- without one, and Settings has no Space name.
--
-- And profile pictures, set in /account. The picture itself is a file on the
-- server (app/lib/avatars.ts: AVATAR_DIR/<user id>.webp, in the app's data
-- volume in production); this is when it was last set, NULL without one. It
-- is in the picture's URL, so a new picture is a new URL and browsers can keep
-- each one for good.

ALTER TABLE spaces DROP COLUMN name;

ALTER TABLE users ADD COLUMN avatar_updated_at timestamptz;

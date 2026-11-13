-- 015_two_themes: two themes, Light (minimal-neutrals, until now Neutral) and Dark
-- (graphite, until now Graphite). Accounts on a removed one move to the closest:
-- the light ones to Light, the dark ones to Dark.
--
-- No more CHECK on the theme: the app checks it (lib/themes.ts) and shows Light
-- for an id it doesn't know, so themes come and go without a migration. The
-- previous release knows both ids, so a rollback to it still works.

ALTER TABLE users DROP CONSTRAINT users_theme_preference_check;

UPDATE users SET theme_preference = 'minimal-neutrals'
  WHERE theme_preference IN ('light-2', 'warm-neutrals');
UPDATE users SET theme_preference = 'graphite'
  WHERE theme_preference NOT IN ('minimal-neutrals', 'graphite');

ALTER TABLE users ALTER COLUMN theme_preference SET DEFAULT 'minimal-neutrals';

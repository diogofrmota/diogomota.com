-- 030_contract: takes away what no release reads any more (docs/decisions/0004).
-- contract: events.notes, users.password_hash and users.password_changed_at (with
-- the accounts_sync_password trigger and function), password_resets and
-- user_shows.rating, unread since v1.2.0; benfica_fixtures, unread since v1.2.17.

-- Better Auth's credential accounts (016_better_auth.sql) have every password;
-- this kept the old users columns in step for a rollback to an Auth.js image.
DROP TRIGGER accounts_sync_password ON accounts;
DROP FUNCTION accounts_sync_password();
ALTER TABLE users DROP COLUMN password_hash, DROP COLUMN password_changed_at;
DROP TABLE password_resets;

-- Events lost their notes in v1.2.0, and titles their own ratings (docs/decisions/0011).
ALTER TABLE events DROP COLUMN notes;
ALTER TABLE user_shows DROP COLUMN rating;

-- The first Benfica app's own fixtures (026_benfica.sql); its games are imported
-- into the calendar now (lib/events.ts, importBenficaGames).
DROP TABLE benfica_fixtures;

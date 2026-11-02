-- 002_username_format: the database enforces the username rule the app checks
-- (app/lib/account-rules.ts): 3-20 characters from a-z, 0-9 and _.
-- Cast to text: a regex match on citext ignores case, which would let "Diogo" through.

ALTER TABLE users
  ADD CONSTRAINT users_username_format CHECK (username::text ~ '^[a-z0-9_]{3,20}$');

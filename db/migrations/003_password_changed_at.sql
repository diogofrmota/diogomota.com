-- 003_password_changed_at: a password change ends the account's other sessions.
-- Sessions are JWTs with nothing stored server-side, so each one carries the
-- password_changed_at it started under, and app/auth.ts refuses any session
-- whose value no longer matches this column.
-- NULL until the password is first changed, so sessions from before this
-- migration stay valid.

ALTER TABLE users ADD COLUMN password_changed_at timestamptz;

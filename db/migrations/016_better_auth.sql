-- 016_better_auth: accounts move from Auth.js to Better Auth (app/auth.ts).
--
-- Better Auth keeps the user in users (its "user" model, mapped in auth.ts), the
-- password in accounts (one 'credential' row per user), sessions in sessions,
-- and password reset tokens in verifications. Every column Better Auth doesn't
-- write is nullable or has a default (it checks this when it starts).
--
-- Expand only: the previous release still logs in with users.password_hash and
-- ends sessions with users.password_changed_at, so both stay, and the trigger at
-- the end keeps them in step with accounts.password. A rollback then works with
-- every password, new ones included. They go (with password_resets) in a later
-- migration, once no deployed image reads them.

-- Users: the fields Better Auth writes.
ALTER TABLE users
  ADD COLUMN email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN image text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
-- New accounts get their password in accounts (and here through the trigger).
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Accounts made before email verification keep working as they did: their
-- emails count as verified (they are friends' real addresses).
UPDATE users SET email_verified = true, updated_at = created_at;

CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE accounts (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id               text NOT NULL,
  provider_id              text NOT NULL,
  access_token             text,
  refresh_token            text,
  id_token                 text,
  access_token_expires_at  timestamptz,
  refresh_token_expires_at timestamptz,
  scope                    text,
  -- The bcrypt hash of a 'credential' account (lib/password.ts).
  password                 text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, account_id)
);
CREATE INDEX accounts_user_id_idx ON accounts (user_id);

CREATE TABLE verifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  value      text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verifications_identifier_idx ON verifications (identifier);

-- Every existing password, as a credential account (bcrypt hashes, which
-- lib/password.ts still checks).
INSERT INTO accounts (user_id, account_id, provider_id, password, created_at, updated_at)
SELECT id, id::text, 'credential', password_hash, created_at, now() FROM users WHERE password_hash IS NOT NULL;

-- Keeps users.password_hash and password_changed_at in step with the credential
-- account, for the previous release (see the top). Dropped with them later.
CREATE FUNCTION accounts_sync_password() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.provider_id = 'credential' AND NEW.password IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.password IS DISTINCT FROM OLD.password) THEN
    UPDATE users SET password_hash = NEW.password, password_changed_at = clock_timestamp()
      WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER accounts_sync_password AFTER INSERT OR UPDATE OF password ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_sync_password();

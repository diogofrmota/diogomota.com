import { DatabaseError } from "pg";
import { query } from "./db";
import { defaultTheme, type Theme } from "./themes";

export type User = {
  id: string;
  username: string;
  email: string;
  themePreference: Theme;
  /** Their profile picture (avatarUrlSql), or null without one. */
  avatarUrl: string | null;
  /** Null until they set one (013_names.sql); the last name is optional. */
  firstName: string | null;
  lastName: string | null;
};

/**
 * SQL for a user's profile picture URL, or NULL without one, from the users
 * row `alias` (or the only one): /api/avatars/<id>?v=<when it was set, in ms>.
 * A new picture is a new URL, so browsers can keep each one for good
 * (app/api/avatars/[id]/route.ts). The picture itself is in lib/avatars.ts.
 */
export function avatarUrlSql(alias?: string): string {
  const column = (name: string) => (alias ? `${alias}.${name}` : name);
  return `CASE WHEN ${column("avatar_updated_at")} IS NOT NULL THEN '/api/avatars/' || ${column("id")} || '?v='
    || (extract(epoch FROM ${column("avatar_updated_at")}) * 1000)::bigint END`;
}

/** SQL for a user's names, from the users row `alias` (or the only one), as firstName and lastName. */
export function nameSql(alias?: string): string {
  const column = (name: string) => (alias ? `${alias}.${name}` : name);
  return `${column("first_name")} AS "firstName", ${column("last_name")} AS "lastName"`;
}

const userColumns = `id, username, email, theme_preference AS "themePreference", ${avatarUrlSql()} AS "avatarUrl", ${nameSql()}`;

type LoginUser = {
  id: string;
  username: string;
  passwordHash: string;
  passwordChangedAt: Date | null;
};

// username and email are citext, so lookups ignore case. Usernames can't contain
// "@", so one value never matches a username and a different account's email.
export async function findUserForLogin(login: string): Promise<LoginUser | null> {
  const { rows } = await query<LoginUser>(
    `SELECT id, username, password_hash AS "passwordHash", password_changed_at AS "passwordChangedAt"
     FROM users WHERE username = $1 OR email = $1`,
    [login],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const { rows } = await query<User>(`SELECT ${userColumns} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * The theme of a page that is open logged out too (the password reset pages):
 * the user's saved one, or the default without a user.
 */
export async function themeOf(userId: string | undefined): Promise<Theme> {
  return (userId && (await findUserById(userId))?.themePreference) || defaultTheme;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const { rows } = await query<User>(`SELECT ${userColumns} FROM users WHERE email = $1`, [email]);
  return rows[0] ?? null;
}

// What every read of a session is checked against (app/auth.ts).
// passwordChangedAt is null until the password is first changed.
export async function findSessionUser(
  id: string,
): Promise<{ username: string; passwordChangedAt: Date | null } | null> {
  const { rows } = await query<{ username: string; passwordChangedAt: Date | null }>(
    `SELECT username, password_changed_at AS "passwordChangedAt" FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function getPasswordHash(id: string): Promise<string | null> {
  const { rows } = await query<{ passwordHash: string }>(
    `SELECT password_hash AS "passwordHash" FROM users WHERE id = $1`,
    [id],
  );
  return rows[0]?.passwordHash ?? null;
}

// Returns null when the username or the email is already taken, without saying which.
// New accounts start in the default theme (lib/themes.ts), set here rather than
// left to the column's default, so the code says which one it is.
export async function createUser(account: {
  username: string;
  email: string;
  passwordHash: string;
  firstName: string;
  /** "" without one. */
  lastName: string;
}): Promise<User | null> {
  const { rows } = await query<User>(
    `INSERT INTO users (username, email, password_hash, theme_preference, first_name, last_name)
     VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''))
     ON CONFLICT DO NOTHING
     RETURNING ${userColumns}`,
    [account.username, account.email, account.passwordHash, defaultTheme, account.firstName, account.lastName],
  );
  return rows[0] ?? null;
}

/** Sets the user's names; an empty last name is none. */
export async function updateName(id: string, firstName: string, lastName: string): Promise<void> {
  await query(`UPDATE users SET first_name = $2, last_name = NULLIF($3, '') WHERE id = $1`, [id, firstName, lastName]);
}

export async function usernameAvailable(id: string, username: string): Promise<boolean> {
  const { rows } = await query<{ available: boolean }>(
    `SELECT NOT EXISTS (SELECT 1 FROM users WHERE username = $1 AND id <> $2) AS available`,
    [username, id],
  );
  return rows[0].available;
}

// Returns false when another account has that username.
export async function updateUsername(id: string, username: string): Promise<boolean> {
  try {
    await query(`UPDATE users SET username = $2 WHERE id = $1`, [id, username]);
    return true;
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") return false; // unique_violation
    throw error;
  }
}

// Also ends the user's sessions (see findSessionUser).
export async function updatePasswordHash(id: string, passwordHash: string): Promise<void> {
  await query(`UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1`, [
    id,
    passwordHash,
  ]);
}

export async function updateThemePreference(id: string, theme: Theme): Promise<void> {
  await query(`UPDATE users SET theme_preference = $2 WHERE id = $1`, [id, theme]);
}

/**
 * Records that the user's profile picture was just set (lib/avatars.ts has
 * the file), and returns its new URL; null when there is no such user.
 */
export async function setAvatarUpdated(id: string): Promise<string | null> {
  const { rows } = await query<{ avatarUrl: string }>(
    `UPDATE users SET avatar_updated_at = clock_timestamp() WHERE id = $1 RETURNING ${avatarUrlSql()} AS "avatarUrl"`,
    [id],
  );
  return rows[0]?.avatarUrl ?? null;
}

/** Records that the user has no profile picture. */
export async function clearAvatarUpdated(id: string): Promise<void> {
  await query(`UPDATE users SET avatar_updated_at = NULL WHERE id = $1`, [id]);
}

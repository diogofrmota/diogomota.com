import { DatabaseError } from "pg";
import { query } from "./db";

export type Theme = "light" | "dark";

export type User = {
  id: string;
  username: string;
  email: string;
  themePreference: Theme;
};

const userColumns = `id, username, email, theme_preference AS "themePreference"`;

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
 * The theme of a page that is open logged out too (/apps, the password reset
 * pages): the user's saved one, or dark without a user.
 */
export async function themeOf(userId: string | undefined): Promise<Theme> {
  return (userId && (await findUserById(userId))?.themePreference) || "dark";
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
export async function createUser(
  username: string,
  email: string,
  passwordHash: string,
): Promise<User | null> {
  const { rows } = await query<User>(
    `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING ${userColumns}`,
    [username, email, passwordHash],
  );
  return rows[0] ?? null;
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

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

// username and email are citext, so lookups ignore case. Usernames can't contain
// "@", so one value never matches a username and a different account's email.
export async function findUserForLogin(
  login: string,
): Promise<{ id: string; username: string; passwordHash: string } | null> {
  const { rows } = await query<{ id: string; username: string; passwordHash: string }>(
    `SELECT id, username, password_hash AS "passwordHash" FROM users WHERE username = $1 OR email = $1`,
    [login],
  );
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const { rows } = await query<User>(`SELECT ${userColumns} FROM users WHERE id = $1`, [id]);
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

export async function updatePasswordHash(id: string, passwordHash: string): Promise<void> {
  await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [id, passwordHash]);
}

export async function updateThemePreference(id: string, theme: Theme): Promise<void> {
  await query(`UPDATE users SET theme_preference = $2 WHERE id = $1`, [id, theme]);
}

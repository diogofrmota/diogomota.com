import { DatabaseError } from "pg";
import { query } from "./db";
import { defaultTheme, isTheme, type Theme } from "./themes";

export type User = {
  id: string;
  username: string;
  email: string;
  themePreference: Theme;
  /** Their profile picture (avatarUrlSql), or null without one. */
  avatarUrl: string | null;
  /** "Diogo" or "Diogo Mota", as they want it; null until they set one (014_one_name.sql). */
  name: string | null;
  /** Whether they opened the link that confirms their email (auth.ts): password resets only go to a confirmed one. */
  emailVerified: boolean;
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

const userColumns = `id, username, email, theme_preference AS "themePreference", ${avatarUrlSql()} AS "avatarUrl", name,
  email_verified AS "emailVerified"`;

export async function findUserById(id: string): Promise<User | null> {
  const { rows } = await query<User>(`SELECT ${userColumns} FROM users WHERE id = $1`, [id]);
  const user = rows[0];
  if (!user) return null;
  // The database takes any theme id (015_two_themes.sql): one that is no longer a theme shows the default.
  return { ...user, themePreference: isTheme(user.themePreference) ? user.themePreference : defaultTheme };
}

/**
 * The theme of a page that is open logged out too (the password reset pages):
 * the user's saved one, or the default without a user.
 */
export async function themeOf(userId: string | undefined): Promise<Theme> {
  return (userId && (await findUserById(userId))?.themePreference) || defaultTheme;
}

/** Sets the user's name. */
export async function updateName(id: string, name: string): Promise<void> {
  await query(`UPDATE users SET name = $2 WHERE id = $1`, [id, name]);
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

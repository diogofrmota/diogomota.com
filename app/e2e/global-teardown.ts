import { rm } from "node:fs/promises";
import path from "node:path";
import { withDatabase } from "./db";

// Deletes the accounts the tests created (usernames starting with "e2e_"), so the
// local database doesn't fill up with them, and their profile pictures. Their
// password resets, library entries and friendships go with them. Then the titles the fake TMDB put in the
// shows table (ids above 2,100,000,000, see lib/tmdb-mock.ts) that are in no
// library anymore.
export default async function globalTeardown() {
  // Their profile pictures first, while their ids are known: files in the
  // test server's AVATAR_DIR (lib/avatars.ts; data/avatars, as it has none set).
  const { rows } = await withDatabase((client) => client.query<{ id: string }>(
    String.raw`SELECT id FROM users WHERE username LIKE 'e2e\_%' AND avatar_updated_at IS NOT NULL`));
  await Promise.all(rows.map(({ id }) => rm(path.join("data", "avatars", `${id}.webp`), { force: true })));
  await withDatabase((client) => client.query(String.raw`DELETE FROM spaces WHERE created_by IN (SELECT id FROM users WHERE username LIKE 'e2e\_%')`));
  await withDatabase((client) => client.query(String.raw`DELETE FROM users WHERE username LIKE 'e2e\_%'`));
  await withDatabase((client) => client.query(`DELETE FROM shows WHERE tmdb_id > 2100000000
    AND NOT EXISTS (SELECT 1 FROM user_shows WHERE show_id = shows.id)`));
}

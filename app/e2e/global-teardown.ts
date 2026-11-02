import { withDatabase } from "./db";

// Deletes the accounts the tests created (usernames starting with "e2e_"), so the
// local database doesn't fill up with them. Their password resets, library
// entries and friendships go with them. Then the titles the fake TMDB put in the
// shows table (ids above 2,100,000,000, see lib/tmdb-mock.ts) that are in no
// library anymore.
export default async function globalTeardown() {
  await withDatabase((client) => client.query(String.raw`DELETE FROM spaces WHERE created_by IN (SELECT id FROM users WHERE username LIKE 'e2e\_%')`));
  await withDatabase((client) => client.query(String.raw`DELETE FROM users WHERE username LIKE 'e2e\_%'`));
  await withDatabase((client) => client.query(`DELETE FROM shows WHERE tmdb_id > 2100000000
    AND NOT EXISTS (SELECT 1 FROM user_shows WHERE show_id = shows.id)`));
}

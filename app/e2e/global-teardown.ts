import { withDatabase } from "./db";

// Deletes the accounts the tests created (usernames starting with "e2e_"), so the
// local database doesn't fill up with them. Their password resets go with them.
export default async function globalTeardown() {
  await withDatabase((client) => client.query(String.raw`DELETE FROM users WHERE username LIKE 'e2e\_%'`));
}

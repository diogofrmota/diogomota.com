import "server-only";
import { DatabaseError } from "pg";
import { USERNAME_MAX, usernameError, usernameHint } from "./account-rules";
import { query } from "./db";
import { friendRequestLimit, userSearchLimit } from "./rate-limit";
import type { FriendProfile, FriendsState, PeopleSearch, Person, PersonMatch } from "./show-types";
import { sharedLibrary, ShowsError } from "./shows";
import { avatarUrlSql } from "./users";

// Friendships of the Shows app: one row per pair of users (001_initial.sql),
// user_id sent the request and friend_id received it. Pending until the
// receiver accepts; declining, cancelling and removing delete the row, so either
// can ask again later. Only accepted friends see each other's libraries.

// Both directions of the pair $1, $2.
const pair = "((f.user_id = $1 AND f.friend_id = $2) OR (f.user_id = $2 AND f.friend_id = $1))";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A user id from the path; anything else is answered like a stranger's.
function personId(value: string, notFound: string): string {
  if (!uuidPattern.test(value)) throw new ShowsError(notFound, 404);
  return value.toLowerCase();
}

/** The user's friends, the requests they received and the ones they sent, each by username. */
export async function readFriends(userId: string): Promise<FriendsState> {
  const { rows } = await query<Person & { status: "pending" | "accepted"; sent: boolean }>(
    `SELECT u.id, u.username, ${avatarUrlSql("u")} AS "avatarUrl", f.status, f.user_id = $1 AS sent
     FROM friendships f JOIN users u ON u.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
     WHERE $1 IN (f.user_id, f.friend_id) ORDER BY u.username`,
    [userId],
  );
  const state: FriendsState = { friends: [], incoming: [], outgoing: [] };
  for (const { id, username, avatarUrl, status, sent } of rows) {
    (status === "accepted" ? state.friends : sent ? state.outgoing : state.incoming).push({ id, username, avatarUrl });
  }
  return state;
}

/**
 * Sends a friend request to the account with `body.username`. If that person
 * had already sent the user one, it is accepted instead.
 */
export async function sendFriendRequest(userId: string, body: Record<string, unknown>): Promise<FriendsState> {
  // Usernames are lowercase; "@bob" works too.
  const username = typeof body.username === "string" ? body.username.trim().replace(/^@/, "").toLowerCase() : "";
  if (!username) throw new ShowsError("Enter a username.");
  if (usernameError(username)) throw new ShowsError(`Usernames have ${usernameHint}`);
  if (!friendRequestLimit(userId)) throw new ShowsError("Too many friend requests. Try again later.", 429);

  const { rows: [other] } = await query<Pick<Person, "id" | "username">>("SELECT id, username FROM users WHERE username = $1", [username]);
  if (!other) throw new ShowsError(`No account has the username ${username}.`, 404);
  if (other.id === userId) throw new ShowsError("That's your own username.");
  try {
    // One statement, so two people asking each other at once become friends.
    const { rows } = await query(
      `INSERT INTO friendships (user_id, friend_id) VALUES ($1, $2)
       ON CONFLICT ((LEAST(user_id, friend_id)), (GREATEST(user_id, friend_id))) DO UPDATE SET status = 'accepted'
         WHERE friendships.status = 'pending' AND friendships.user_id = $2
       RETURNING id`,
      [userId, other.id],
    );
    if (!rows[0]) {
      // Neither inserted nor accepted: they are friends already, or the user asked before.
      const { rows: [existing] } = await query<{ status: string }>(`SELECT status FROM friendships f WHERE ${pair}`, [userId, other.id]);
      throw new ShowsError(existing?.status === "accepted" ? `You're already friends with ${other.username}.`
        : `You've already sent ${other.username} a friend request.`, 409);
    }
  } catch (error) {
    // One of the accounts was deleted since it was read.
    if (error instanceof DatabaseError && error.code === "23503") {
      throw error.constraint === "friendships_friend_id_fkey"
        ? new ShowsError(`No account has the username ${username}.`, 404) : new ShowsError("Please log in again.", 401);
    }
    throw error;
  }
  return readFriends(userId);
}

// Suggestions start at this many characters: enough to narrow them down, so
// listing every account takes many searches (and userSearchLimit caps those).
const searchMin = 2;
const suggestionCount = 6;

/**
 * Usernames that start with `value` (typed in Add a friend; "@" and case don't
 * matter), the exact match first, then the shortest, each with how they and the
 * user are connected; whether one is exactly it (`exact`), or it's the user's
 * own (`self`, left out of the suggestions). Nothing under 2 characters, or for
 * what no username could start with.
 */
export async function searchPeople(userId: string, value: unknown): Promise<PeopleSearch> {
  const text = typeof value === "string" ? value.trim().replace(/^@/, "").toLowerCase() : "";
  const none: PeopleSearch = { matches: [], exact: false, self: false };
  if (text.length < searchMin || text.length > USERNAME_MAX || !/^[a-z0-9_]+$/.test(text)) return none;
  if (!userSearchLimit(userId)) throw new ShowsError("Too many searches. Wait a minute and try again.", 429);

  // Usernames are stored in lowercase: a plain prefix LIKE, which
  // users_username_prefix_idx serves. "_" matches any character in LIKE.
  const { rows } = await query<PersonMatch>(
    `SELECT u.id, u.username::text AS username, ${avatarUrlSql("u")} AS "avatarUrl",
       CASE WHEN f.status = 'accepted' THEN 'friend' WHEN f.user_id = $1 THEN 'outgoing'
         WHEN f.friend_id = $1 THEN 'incoming' ELSE 'none' END AS relation
     FROM users u
     LEFT JOIN friendships f ON (f.user_id = $1 AND f.friend_id = u.id) OR (f.user_id = u.id AND f.friend_id = $1)
     WHERE u.username::text LIKE $2
     ORDER BY u.username::text = $3 DESC, length(u.username::text), u.username::text
     LIMIT ${suggestionCount + 1}`,
    [userId, `${text.replace(/_/g, "\\_")}%`, text],
  );
  const others = rows.filter((row) => row.id !== userId);
  return {
    matches: others.slice(0, suggestionCount),
    exact: others.some((row) => row.username === text),
    self: rows.some((row) => row.id === userId && row.username === text),
  };
}

const requestGone = "This friend request isn't there anymore.";

/** Accepts the friend request `otherId` sent the user. */
export async function acceptFriendRequest(userId: string, otherId: string): Promise<FriendsState> {
  const { rowCount } = await query(
    "UPDATE friendships SET status = 'accepted' WHERE user_id = $2 AND friend_id = $1 AND status = 'pending'",
    [userId, personId(otherId, requestGone)],
  );
  if (!rowCount) throw new ShowsError(requestGone, 404);
  return readFriends(userId);
}

/** Declines the friend request `otherId` sent the user. */
export async function declineFriendRequest(userId: string, otherId: string): Promise<FriendsState> {
  const { rowCount } = await query(
    "DELETE FROM friendships WHERE user_id = $2 AND friend_id = $1 AND status = 'pending'",
    [userId, personId(otherId, requestGone)],
  );
  if (!rowCount) throw new ShowsError(requestGone, 404);
  return readFriends(userId);
}

/** Withdraws the friend request the user sent `otherId`. */
export async function cancelFriendRequest(userId: string, otherId: string): Promise<FriendsState> {
  const { rowCount } = await query(
    "DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'",
    [userId, personId(otherId, requestGone)],
  );
  if (!rowCount) throw new ShowsError(requestGone, 404);
  return readFriends(userId);
}

const notFriends = "You aren't friends with this person.";

/** Ends the friendship of the user and `friendId`, for both of them. */
export async function removeFriend(userId: string, friendId: string): Promise<FriendsState> {
  const { rowCount } = await query(
    `DELETE FROM friendships f WHERE f.status = 'accepted' AND ${pair}`,
    [userId, personId(friendId, notFriends)],
  );
  if (!rowCount) throw new ShowsError(notFriends, 404);
  return readFriends(userId);
}

const onlyFriends = "Only friends can see each other's libraries.";

/**
 * A friend's profile: what they're watching, what they've completed, their
 * favourites and their stats. Anyone else, or an id nobody has, is a 404.
 */
export async function readFriend(userId: string, friendId: string): Promise<FriendProfile> {
  const { rows: [friend] } = await query<Person>(
    `SELECT u.id, u.username, ${avatarUrlSql("u")} AS "avatarUrl"
     FROM friendships f JOIN users u ON u.id = $2 WHERE f.status = 'accepted' AND ${pair}`,
    [userId, personId(friendId, onlyFriends)],
  );
  if (!friend) throw new ShowsError(onlyFriends, 404);
  return { ...friend, ...(await sharedLibrary(friend.id)) };
}

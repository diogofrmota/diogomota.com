import "server-only";
import { after } from "next/server";
import { DatabaseError } from "pg";
import { auth } from "@/auth";
import { query } from "./db";
import { showsRequestLimit } from "./rate-limit";
import {
  addStatuses,
  discoverSections,
  hasEpisode,
  libraryStats,
  libraryStatuses,
  mediaTypes,
  titleKey,
  type DiscoverSection,
  type FriendItem,
  type LibraryEntry,
  type LibraryItem,
  type LibraryStats,
  type LibraryStatus,
  type MediaType,
  type TitleDetail,
  type TitleSummary,
} from "./show-types";
import {
  collectTitles, fetchTitle, listTtlMs, minVotes, recommendedFor, remember, searchTitles, TmdbError, topRatedVotes,
  type TmdbSource, type TmdbTitle,
} from "./tmdb";

export class ShowsError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// The shows table is the local copy of TMDB's details of every title that was
// opened or added to a library. A copy older than this is fetched again when it
// is next opened or added.
const refreshAfter = "7 days";

const showColumns = `id, type, tmdb_id AS "tmdbId", title, year, poster_url AS "posterPath",
  vote_average::float8 AS rating, coalesce(overview, '') AS overview, runtime,
  episode_runtime AS "episodeRuntime", episodes_per_season AS "episodesPerSeason",
  last_updated < now() - interval '${refreshAfter}' AS stale`;
const entryColumns = `id, status, rating, current_season AS "currentSeason",
  current_episode AS "currentEpisode", is_favourite AS "isFavourite"`;
// The same, of user_shows as "us", in a statement that has shows too.
const usEntryColumns = `us.id, us.status, us.rating, us.current_season AS "currentSeason",
  us.current_episode AS "currentEpisode", us.is_favourite AS "isFavourite"`;

type ShowRow = TmdbTitle & { id: string; stale: boolean };

export function mediaType(value: unknown): MediaType {
  if (!mediaTypes.includes(value as MediaType)) throw new ShowsError("Choose TV shows or movies.", 404);
  return value as MediaType;
}

export function tmdbId(value: unknown): number {
  const id = typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : value;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0 || id >= 2 ** 31) throw new ShowsError("Title not found.", 404);
  return id;
}

async function saveTitle(title: TmdbTitle): Promise<ShowRow> {
  // poster_url holds TMDB's image path (e.g. "/abc.jpg"); tmdbImageUrl builds the URLs.
  const { rows } = await query<ShowRow>(
    `INSERT INTO shows (tmdb_id, type, title, poster_url, year, overview, runtime, episode_runtime,
       episodes_per_season, vote_average, last_updated)
     VALUES ($1, $2, $3, $4, $5, nullif($6, ''), $7, $8, $9, $10, now())
     ON CONFLICT (tmdb_id, type) DO UPDATE SET title = EXCLUDED.title, poster_url = EXCLUDED.poster_url,
       year = EXCLUDED.year, overview = EXCLUDED.overview, runtime = EXCLUDED.runtime,
       episode_runtime = EXCLUDED.episode_runtime, episodes_per_season = EXCLUDED.episodes_per_season,
       vote_average = EXCLUDED.vote_average, last_updated = now()
     RETURNING ${showColumns}`,
    [title.tmdbId, title.type, title.title, title.posterPath, title.year, title.overview, title.runtime,
      title.episodeRuntime, title.episodesPerSeason, title.rating],
  );
  return rows[0];
}

// The cached copy of a title, fetched from TMDB first if there is none yet or
// it is older than `refreshAfter`. If TMDB can't be reached, an old copy is
// better than none.
async function cachedTitle(type: MediaType, id: number): Promise<ShowRow> {
  const { rows } = await query<ShowRow>(`SELECT ${showColumns} FROM shows WHERE type = $1 AND tmdb_id = $2`, [type, id]);
  return rows[0] && !rows[0].stale ? rows[0] : refreshedTitle(type, id, rows[0]);
}

// `cached` (missing or stale) fetched from TMDB again and saved.
async function refreshedTitle(type: MediaType, id: number, cached: ShowRow | undefined): Promise<ShowRow> {
  try {
    return await saveTitle(await fetchTitle(type, id));
  } catch (error) {
    if (!cached) throw error;
    console.warn(`Kept the old copy of ${type} ${id}: refreshing it from TMDB failed`, error);
    return cached;
  }
}

function detail(show: ShowRow, library: LibraryEntry | null): TitleDetail {
  return {
    type: show.type, tmdbId: show.tmdbId, title: show.title, year: show.year, posterPath: show.posterPath,
    rating: show.rating, overview: show.overview, runtime: show.runtime, episodeRuntime: show.episodeRuntime,
    episodesPerSeason: show.episodesPerSeason, library,
  };
}

/**
 * A title's details (from the cache) with the user's library entry for it: one
 * query when the cached copy is fresh, which it mostly is.
 */
export async function readTitle(userId: string, type: MediaType, id: number): Promise<TitleDetail> {
  const { rows: [cached] } = await query<ShowRow & { library: LibraryEntry | null }>(
    `SELECT ${showColumns}, (SELECT row_to_json(entry) FROM (SELECT ${usEntryColumns} FROM user_shows us
       WHERE us.user_id = $3 AND us.show_id = shows.id) entry) AS library
     FROM shows WHERE type = $1 AND tmdb_id = $2`,
    [type, id, userId],
  );
  if (cached && !cached.stale) return detail(cached, cached.library);
  const show = await refreshedTitle(type, id, cached);
  const { rows } = await query<LibraryEntry>(`SELECT ${entryColumns} FROM user_shows WHERE user_id = $1 AND show_id = $2`,
    [userId, show.id]);
  return detail(show, rows[0] ?? null);
}

/** Adds a title to the user's library as watching, planned or completed. */
export async function addToLibrary(userId: string, body: Record<string, unknown>): Promise<TitleDetail> {
  const type = mediaType(body.type);
  const id = tmdbId(body.tmdbId);
  if (!addStatuses.includes(body.status as (typeof addStatuses)[number])) throw new ShowsError("Add it as Watching, Planned or Completed.");
  // Fetched from TMDB outside any transaction, so no lock waits on the network.
  const show = await cachedTitle(type, id);
  try {
    const { rows } = await query<LibraryEntry>(
      `INSERT INTO user_shows (user_id, show_id, status) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, show_id) DO NOTHING RETURNING ${entryColumns}`,
      [userId, show.id, body.status],
    );
    if (!rows[0]) throw new ShowsError("This title is already in your library.", 409);
    return detail(show, rows[0]);
  } catch (error) {
    // The account was deleted after the session was checked.
    if (error instanceof DatabaseError && error.code === "23503") throw new ShowsError("Please log in again.", 401);
    throw error;
  }
}

// Library titles whose copy is being fetched from TMDB again, so two loads at
// once don't fetch the same title twice.
const refreshing = new Set<string>();

// Fetches stale library titles from TMDB again, one at a time, after the
// library was answered with the old copies. TMDB allows keeping its data for
// at most 6 months, and titles in a library may never be opened again. Stops at
// the first failure: the next load tries again.
async function refreshTitles(titles: Pick<TitleSummary, "type" | "tmdbId">[]) {
  for (const title of titles) {
    const key = titleKey(title);
    if (refreshing.has(key)) continue;
    refreshing.add(key);
    try {
      await saveTitle(await fetchTitle(title.type, title.tmdbId));
    } catch (error) {
      console.warn(`Kept the old copy of ${key}: refreshing it from TMDB failed`, error);
      return;
    } finally {
      refreshing.delete(key);
    }
  }
}

// A user's library titles that match `where` (a fixed SQL condition on us,
// never anything from a request), the latest added or changed first. Stale
// titles are fetched from TMDB again after the response.
async function libraryItems(userId: string, where = "true"): Promise<LibraryItem[]> {
  const { rows } = await query<LibraryItem & { stale: boolean }>(
    `SELECT s.type, s.tmdb_id AS "tmdbId", s.title, s.year, s.poster_url AS "posterPath",
       s.vote_average::float8 AS rating, s.runtime, s.episode_runtime AS "episodeRuntime",
       s.episodes_per_season AS "episodesPerSeason",
       json_build_object('id', us.id, 'status', us.status, 'rating', us.rating, 'currentSeason', us.current_season,
         'currentEpisode', us.current_episode, 'isFavourite', us.is_favourite) AS library,
       s.last_updated < now() - interval '${refreshAfter}' AS stale
     FROM user_shows us JOIN shows s ON s.id = us.show_id
     WHERE us.user_id = $1 AND (${where}) ORDER BY us.updated_at DESC, us.id`,
    [userId],
  );
  const stale = rows.filter((row) => row.stale);
  if (stale.length) after(() => refreshTitles(stale));
  return rows.map((row) => ({ type: row.type, tmdbId: row.tmdbId, title: row.title, year: row.year,
    posterPath: row.posterPath, rating: row.rating, runtime: row.runtime, episodeRuntime: row.episodeRuntime,
    episodesPerSeason: row.episodesPerSeason, library: row.library }));
}

/** The user's library, the latest added or changed first. */
export function readLibrary(userId: string): Promise<LibraryItem[]> {
  return libraryItems(userId);
}

/**
 * What a friend sees of a user's library: the titles they're watching or have
 * completed and their favourites (planned titles stay out unless they are
 * favourites), with the stats of the whole library. Planned titles add nothing
 * to the stats, so these titles are enough to work them out.
 */
export async function sharedLibrary(userId: string): Promise<{ stats: LibraryStats; items: FriendItem[] }> {
  const items = await libraryItems(userId, "us.status IN ('watching', 'completed') OR us.is_favourite");
  return {
    stats: libraryStats(items),
    // Only these fields: the entry's id stays private.
    items: items.map((item) => {
      const { status, rating, currentSeason, currentEpisode, isFavourite } = item.library;
      return { type: item.type, tmdbId: item.tmdbId, title: item.title, year: item.year, posterPath: item.posterPath,
        rating: item.rating, library: { status, rating, currentSeason, currentEpisode, isFavourite } };
    }),
  };
}

// The user's entry for a title, with what is needed to check a change of it.
async function libraryRow(userId: string, type: MediaType, id: number) {
  const { rows } = await query<{ id: string; episodesPerSeason: number[] | null }>(
    `SELECT us.id, s.episodes_per_season AS "episodesPerSeason"
     FROM user_shows us JOIN shows s ON s.id = us.show_id
     WHERE us.user_id = $1 AND s.type = $2 AND s.tmdb_id = $3`,
    [userId, type, id],
  );
  if (!rows[0]) throw new ShowsError("This title isn't in your library.", 404);
  return rows[0];
}

/**
 * Changes the user's entry for a title: any of status, rating (1-5 or null),
 * isFavourite, and the progress of a TV show (currentSeason and currentEpisode
 * together: an episode it has, or both null). One statement, except for a
 * change of progress, which is checked against the show's episodes first.
 */
export async function updateLibraryEntry(userId: string, type: MediaType, id: number, body: Record<string, unknown>): Promise<LibraryEntry> {
  const values: unknown[] = [userId, type, id];
  const columns: string[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    columns.push(`${column} = $${values.length}`);
  };

  if ("status" in body) {
    if (!libraryStatuses.includes(body.status as LibraryStatus)) throw new ShowsError("Choose Watching, Planned or Completed.");
    set("status", body.status);
  }
  if ("rating" in body) {
    const { rating } = body;
    if (rating !== null && !(Number.isInteger(rating) && (rating as number) >= 1 && (rating as number) <= 5)) {
      throw new ShowsError("Rate it from 1 to 5 stars.");
    }
    set("rating", rating);
  }
  if ("isFavourite" in body) {
    if (typeof body.isFavourite !== "boolean") throw new ShowsError("Mark it as a favourite or not.");
    set("is_favourite", body.isFavourite);
  }
  if ("currentSeason" in body || "currentEpisode" in body) {
    const { currentSeason: season, currentEpisode: episode } = body;
    if (type === "movie") throw new ShowsError("Movies have no episodes.");
    if ((season !== null || episode !== null) &&
      !hasEpisode((await libraryRow(userId, type, id)).episodesPerSeason ?? [], { season: season as number, episode: episode as number })) {
      throw new ShowsError("This show has no such episode.");
    }
    set("current_season", season);
    set("current_episode", episode);
  }
  if (!columns.length) throw new ShowsError("Nothing to change.");

  const { rows } = await query<LibraryEntry>(
    `UPDATE user_shows us SET ${columns.join(", ")}, updated_at = now() FROM shows s
     WHERE s.id = us.show_id AND us.user_id = $1 AND s.type = $2 AND s.tmdb_id = $3
     RETURNING ${usEntryColumns}`,
    values,
  );
  // Not in the library, or removed meanwhile.
  if (!rows[0]) throw new ShowsError("This title isn't in your library.", 404);
  return rows[0];
}

/** Removes a title from the user's library, with its progress and rating. */
export async function removeFromLibrary(userId: string, type: MediaType, id: number): Promise<null> {
  const { rowCount } = await query(
    `DELETE FROM user_shows us USING shows s
     WHERE s.id = us.show_id AND us.user_id = $1 AND s.type = $2 AND s.tmdb_id = $3`,
    [userId, type, id],
  );
  if (!rowCount) throw new ShowsError("This title isn't in your library.", 404);
  return null;
}

// Titles of this type in the libraries of the user's accepted friends, the ones
// most of them have first. The friends are found from each side of the pair
// separately, so each half uses its index (friendships_user_id_idx,
// friendships_friend_id_idx), and their libraries user_shows' (user_id, ...) one.
async function friendsTitles(userId: string, type: MediaType): Promise<TitleSummary[]> {
  const { rows } = await query<TitleSummary>(
    `WITH friends AS (
       SELECT friend_id AS id FROM friendships WHERE user_id = $1 AND status = 'accepted'
       UNION ALL
       SELECT user_id FROM friendships WHERE friend_id = $1 AND status = 'accepted'
     )
     SELECT s.type, s.tmdb_id AS "tmdbId", s.title, s.year, s.poster_url AS "posterPath",
       s.vote_average::float8 AS rating
     FROM friends f JOIN user_shows us ON us.user_id = f.id JOIN shows s ON s.id = us.show_id
     WHERE s.type = $2
     GROUP BY s.id ORDER BY count(*) DESC, s.title, s.id LIMIT 20`,
    [userId, type],
  );
  return rows;
}

// Each Discover section from TMDB has this many titles (or fewer, when TMDB runs out).
const sectionSize = 20;

// Where each section's titles come from (TMDB's genre ids: Comedy 35 and Crime
// 80 for both, Sci-Fi & Fantasy 10765 for TV, Action 28 and Science Fiction 878
// for movies).
const sources: Record<MediaType, Partial<Record<DiscoverSection, TmdbSource>>> = {
  tv: {
    trending: { list: "trending" }, popular: { list: "popular" }, "top-rated": { list: "top-rated" },
    comedy: { list: "genre", genre: 35 }, crime: { list: "genre", genre: 80 }, "sci-fi": { list: "genre", genre: 10765 },
  },
  movie: {
    trending: { list: "trending" }, popular: { list: "popular" }, upcoming: { list: "upcoming" }, "top-rated": { list: "top-rated" },
    action: { list: "genre", genre: 28 }, comedy: { list: "genre", genre: 35 }, "sci-fi": { list: "genre", genre: 878 },
  },
};

// The sections that don't repeat each other, in this order: a title is only in
// the first it would be in, and the next pages fill the gaps. Top Rated is left
// out, and repeats what it likes: the best rated are the best rated.
const distinctSections: Record<MediaType, readonly DiscoverSection[]> = {
  tv: ["trending", "popular", "comedy", "crime", "sci-fi"],
  movie: ["trending", "popular", "upcoming", "action", "comedy", "sci-fi"],
};

// Coming Soon's titles aren't out yet, so they can't have votes.
const sectionVotes = (type: MediaType, section: DiscoverSection) =>
  section === "upcoming" ? 0 : section === "top-rated" ? topRatedVotes[type] : minVotes[type];

/**
 * A section made from TMDB's lists, the same for everyone: up to 20 titles
 * with enough votes, none of them in an earlier distinct section (a failed one
 * leaves nothing out). Kept for as long as TMDB's lists.
 */
function tmdbSection(type: MediaType, section: DiscoverSection): Promise<TitleSummary[]> {
  return remember(`${type}/section/${section}`, listTtlMs, async () => {
    const order = distinctSections[type];
    const earlier = order.includes(section) ? order.slice(0, order.indexOf(section)) : [];
    const shown = await Promise.all(earlier.map((other) => tmdbSection(type, other).catch(() => [])));
    return collectTitles(type, sources[type][section]!, {
      count: sectionSize, votes: sectionVotes(type, section), exclude: new Set(shown.flat().map((title) => title.tmdbId)),
    });
  });
}

// For You is made from at most this many of the user's titles.
const forYouSeeds = 5;

/**
 * For You: TMDB's recommendations for the titles of this type the user likes
 * best (favourites, then the best rated, then completed and watching ones, the
 * latest first), merged: a title recommended for several of them, or near the
 * top of a list, comes first. Left out: titles already in the library, with
 * too few votes, or in Trending and Popular, which are just under it.
 * Nothing without titles of this type in the library.
 */
async function forYou(userId: string, type: MediaType): Promise<TitleSummary[]> {
  const { rows } = await query<{ tmdbId: number; seed: boolean }>(
    `SELECT s.tmdb_id AS "tmdbId", row_number() OVER (
         ORDER BY us.is_favourite DESC, us.rating DESC NULLS LAST,
           CASE us.status WHEN 'completed' THEN 0 WHEN 'watching' THEN 1 ELSE 2 END, us.updated_at DESC, us.id
       ) <= ${forYouSeeds} AS seed
     FROM user_shows us JOIN shows s ON s.id = us.show_id
     WHERE us.user_id = $1 AND s.type = $2`,
    [userId, type],
  );
  const seeds = rows.filter((row) => row.seed);
  if (!seeds.length) return [];
  const [lists, ...shown] = await Promise.all([
    Promise.allSettled(seeds.map((seed) => recommendedFor(type, seed.tmdbId))),
    ...(["trending", "popular"] as const).map((section) => tmdbSection(type, section).catch(() => [])),
  ]);
  // Every list failed: say so. Some did: the others are enough.
  const failed = lists.find((list) => list.status === "rejected");
  if (failed && lists.every((list) => list.status === "rejected")) throw failed.reason;

  const leftOut = new Set([...rows.map((row) => row.tmdbId), ...shown.flat().map((title) => title.tmdbId)]);
  const scores = new Map<number, { title: TitleSummary; score: number }>();
  for (const list of lists) {
    if (list.status === "rejected") continue;
    list.value.forEach(({ title, votes }, rank) => {
      if (leftOut.has(title.tmdbId) || votes < minVotes[type]) return;
      const entry = scores.get(title.tmdbId) ?? { title, score: 0 };
      entry.score += 1 - rank / (list.value.length + 1);
      scores.set(title.tmdbId, entry);
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score || (b.title.rating ?? 0) - (a.title.rating ?? 0) || a.title.tmdbId - b.title.tmdbId)
    .slice(0, sectionSize).map(({ title }) => title);
}

/** A Discover section of TV shows or movies (lib/show-types.ts, discoverSections). */
export function discoverSection(userId: string, type: MediaType, section: string): Promise<TitleSummary[]> {
  if (!discoverSections[type].some((known) => known.id === section)) throw new ShowsError("Section not found.", 404);
  if (section === "friends") return friendsTitles(userId, type);
  if (section === "for-you") return forYou(userId, type);
  return tmdbSection(type, section as DiscoverSection);
}

export async function search(value: unknown): Promise<TitleSummary[]> {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!text) return [];
  if (text.length > 100) throw new ShowsError("Search for at most 100 characters.");
  return searchTitles(text);
}

/**
 * Answers a /api/shows request with `{ data }`, or `{ error }` and a status:
 * checks the session, the origin of changes, the rate limit and the JSON body,
 * then runs `handler` with the user's id and the body ({} for GET).
 */
export async function showsResponse(
  request: Request,
  handler: (userId: string, body: Record<string, unknown>) => Promise<unknown>,
  successStatus = 200,
): Promise<Response> {
  const session = await auth();
  if (!session) return Response.json({ error: "Please log in again." }, { status: 401 });
  try {
    if (request.method !== "GET") {
      const origin = request.headers.get("origin");
      if ((origin && origin !== new URL(process.env.AUTH_URL ?? request.url).origin) ||
        request.headers.get("sec-fetch-site") === "cross-site") throw new ShowsError("Request must come from this site.", 403);
    }
    if (!showsRequestLimit(session.user.id)) throw new ShowsError("Too many requests. Wait a minute and try again.", 429);
    let body: unknown = {};
    if (request.method === "POST" || request.method === "PATCH") {
      if (!request.headers.get("content-type")?.includes("application/json")) throw new ShowsError("Send a JSON request.", 415);
      body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new ShowsError("Invalid JSON request.");
    }
    const data = await handler(session.user.id, body as Record<string, unknown>);
    return Response.json({ data }, { status: successStatus, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ShowsError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof TmdbError && error.status === 404) {
      return Response.json({ error: "TMDB doesn't have this title." }, { status: 404 });
    }
    if (error instanceof TmdbError) {
      console.error("TMDB request failed", error);
      return Response.json({ error: "TMDB isn't answering right now. Try again in a moment." }, { status: 502 });
    }
    console.error("Shows request failed", error);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

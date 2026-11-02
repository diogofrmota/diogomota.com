import "server-only";
import { DatabaseError } from "pg";
import { auth } from "@/auth";
import { query } from "./db";
import { showsRequestLimit } from "./rate-limit";
import {
  addStatuses,
  discoverSections,
  mediaTypes,
  type DiscoverSection,
  type LibraryEntry,
  type MediaType,
  type TitleDetail,
  type TitleSummary,
} from "./show-types";
import { fetchTitle, listTitles, searchTitles, TmdbError, type TmdbTitle } from "./tmdb";

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
  const cached = rows[0];
  if (cached && !cached.stale) return cached;
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

/** A title's details (from the cache) with the user's library entry for it. */
export async function readTitle(userId: string, type: MediaType, id: number): Promise<TitleDetail> {
  const show = await cachedTitle(type, id);
  const { rows } = await query<LibraryEntry>(`SELECT ${entryColumns} FROM user_shows WHERE user_id = $1 AND show_id = $2`,
    [userId, show.id]);
  return detail(show, rows[0] ?? null);
}

/** Adds a title to the user's library as watching or planned. */
export async function addToLibrary(userId: string, body: Record<string, unknown>): Promise<TitleDetail> {
  const type = mediaType(body.type);
  const id = tmdbId(body.tmdbId);
  if (!addStatuses.includes(body.status as (typeof addStatuses)[number])) throw new ShowsError("Add it as Watching or Planned.");
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

// Titles of this type in the libraries of the user's accepted friends, the ones
// most of them have first.
async function friendsTitles(userId: string, type: MediaType): Promise<TitleSummary[]> {
  const { rows } = await query<TitleSummary>(
    `SELECT s.type, s.tmdb_id AS "tmdbId", s.title, s.year, s.poster_url AS "posterPath",
       s.vote_average::float8 AS rating
     FROM friendships f
     JOIN user_shows us ON us.user_id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
     JOIN shows s ON s.id = us.show_id
     WHERE f.status = 'accepted' AND $1 IN (f.user_id, f.friend_id) AND s.type = $2
     GROUP BY s.id ORDER BY count(*) DESC, s.title, s.id LIMIT 20`,
    [userId, type],
  );
  return rows;
}

export function discoverSection(userId: string, type: MediaType, section: string): Promise<TitleSummary[]> {
  if (!discoverSections.includes(section as DiscoverSection)) throw new ShowsError("Section not found.", 404);
  if (section === "friends") return friendsTitles(userId, type);
  return listTitles(type, section === "top-rated" ? "top_rated" : "popular");
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
    if (request.method === "POST") {
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

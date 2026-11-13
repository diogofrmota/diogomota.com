import "server-only";
import { tmdbImageUrl, type MediaType, type TitleSummary } from "./show-types";
import { testHooksEnabled } from "./test-hooks";

// Client for the TMDB API (https://developer.themoviedb.org), on the server only:
// it sends TMDB_READ_TOKEN, which must never reach the browser. The browser asks
// the app's /api/shows routes, which call this.
//
// List endpoints (Discover's lists, search) are kept in memory for a few
// minutes, recommendations for hours; details are cached in the shows table
// instead (lib/shows.ts).

export { tmdbImageUrl };

const apiBase = "https://api.themoviedb.org/3";
const timeoutMs = 8_000;
/** How long Discover's lists are kept. */
export const listTtlMs = 10 * 60_000;
const searchTtlMs = 5 * 60_000;
const recommendationsTtlMs = 6 * 60 * 60_000;

export class TmdbError extends Error {
  constructor(
    message: string,
    public status: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

// The parts of TMDB's responses that are used. Fields may be missing or null in
// practice, so the normalizers below check every value they read.
type TmdbPage<T> = { page: number; results: T[]; total_pages: number; total_results: number };
type TmdbTvItem = {
  id: number;
  name?: string;
  first_air_date?: string;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
};
type TmdbMovieItem = Omit<TmdbTvItem, "name" | "first_air_date"> & { title?: string; release_date?: string };
type TmdbMultiItem =
  | (TmdbTvItem & { media_type: "tv" })
  | (TmdbMovieItem & { media_type: "movie" })
  | { media_type: "person" | "collection"; id: number };
type TmdbEpisode = { runtime?: number | null };
type TmdbGenres = { genres?: { name?: unknown }[] };
type TmdbTvDetails = TmdbTvItem &
  TmdbGenres & {
    overview?: string;
    episode_run_time?: number[];
    seasons?: { season_number?: number; episode_count?: number }[];
    last_episode_to_air?: TmdbEpisode | null;
    next_episode_to_air?: TmdbEpisode | null;
  };
type TmdbMovieDetails = TmdbMovieItem & TmdbGenres & { overview?: string; runtime?: number | null };

/** A title's details, as stored in the shows table. */
export type TmdbTitle = TitleSummary & {
  overview: string;
  /** TMDB's genre names, e.g. ["Drama", "Comedy"]. */
  genres: string[];
  runtime: number | null;
  episodeRuntime: number | null;
  episodesPerSeason: number[] | null;
};

// With test hooks on (the e2e tests), requests go to a fake TMDB in this process
// (lib/tmdb-mock.ts) and never leave the machine.
async function send(url: URL, init: RequestInit): Promise<Response> {
  if (testHooksEnabled()) return (await import("./tmdb-mock")).mockTmdb(url, init);
  return fetch(url, init);
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = process.env.TMDB_READ_TOKEN || (testHooksEnabled() ? "e2e-token" : "");
  if (!token) throw new TmdbError("TMDB_READ_TOKEN is not set", 503);

  const url = new URL(`${apiBase}${path}`);
  url.search = new URLSearchParams({ language: "en-US", ...params }).toString();
  try {
    // The timeout covers reading the body too.
    const response = await send(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status === 404) throw new TmdbError("Not found on TMDB.", 404);
    if (!response.ok) throw new TmdbError(`TMDB answered ${response.status} to ${path}.`, 502);
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof TmdbError) throw error;
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new TmdbError(
      timedOut ? `TMDB took too long to answer ${path}.` : `Could not reach TMDB for ${path}.`,
      timedOut ? 504 : 502,
      { cause: error },
    );
  }
}

// In-memory cache of pending and finished requests, so concurrent callers share
// one. Failures are dropped at once, so the next caller tries again. One store
// across dev hot reloads, like the pg pool in db.ts.
type Cached = { expiresAt: number; value: Promise<unknown> };
const globalForTmdb = globalThis as typeof globalThis & { tmdbCache?: Map<string, Cached> };
const cache = (globalForTmdb.tmdbCache ??= new Map());
const maxCached = 500;

/** `load()`, shared by every caller for `ttlMs` (a failure isn't kept). Lists built from TMDB's (lib/shows.ts) are kept here too. */
export function remember<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value as Promise<T>;
  if (cache.size >= maxCached) {
    for (const [k, entry] of cache) if (entry.expiresAt <= now) cache.delete(k);
    // Still full: drop the oldest (a Map keeps insertion order).
    if (cache.size >= maxCached) cache.delete(cache.keys().next().value!);
  }
  const value = load();
  cache.set(key, { expiresAt: now + ttlMs, value });
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

const validId = (id: unknown): id is number => Number.isInteger(id) && (id as number) > 0 && (id as number) < 2 ** 31;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const minutes = (value: unknown) =>
  typeof value === "number" && value > 0 && value < 10_000 ? Math.round(value) : null;

function yearOf(date: unknown): number | null {
  const match = /^(\d{4})-/.exec(text(date));
  return match ? Number(match[1]) : null;
}

// Only a plain file name: it goes into image URLs (tmdbImageUrl).
function imagePath(value: unknown): string | null {
  return typeof value === "string" && /^\/[\w-]+\.(jpe?g|png|webp|svg)$/i.test(value) ? value : null;
}

function rating(average: unknown, count: unknown): number | null {
  if (typeof average !== "number" || !(average > 0) || average > 10) return null;
  if (typeof count === "number" && count <= 0) return null;
  return Math.round(average * 10) / 10;
}

function summary(type: MediaType, item: TmdbTvItem | TmdbMovieItem): TitleSummary {
  const tv = item as TmdbTvItem,
    movie = item as TmdbMovieItem;
  return {
    type,
    tmdbId: item.id,
    title: text(type === "tv" ? tv.name : movie.title) || "Untitled",
    year: yearOf(type === "tv" ? tv.first_air_date : movie.release_date),
    posterPath: imagePath(item.poster_path),
    rating: rating(item.vote_average, item.vote_count),
  };
}

const votesOf = (item: { vote_count?: unknown }) =>
  typeof item?.vote_count === "number" && item.vote_count > 0 ? Math.floor(item.vote_count) : 0;

/** A title from one of TMDB's lists, with how many people voted on it there. */
export type Listed = { title: TitleSummary; votes: number };

function listed(type: MediaType, page: TmdbPage<TmdbTvItem | TmdbMovieItem>): Listed[] {
  const results = Array.isArray(page?.results) ? page.results : [];
  return results
    .filter((item) => validId(item?.id))
    .map((item) => ({ title: summary(type, item), votes: votesOf(item) }));
}

/**
 * The fewest votes on TMDB a title needs to be listed in Discover or
 * recommended: without enough of them, a handful of 10s puts a title hardly
 * anyone has seen at the top. Top Rated, which sorts by rating, asks for many
 * more (topRatedVotes). Search finds titles with fewer, after the others.
 */
export const minVotes: Record<MediaType, number> = { tv: 50, movie: 100 };
export const topRatedVotes: Record<MediaType, number> = { tv: 500, movie: 2000 };

/**
 * Where a Discover list comes from on TMDB: this week's trending, popular,
 * upcoming (movies in cinemas soon), the best rated with at least
 * topRatedVotes votes, or the most popular of a genre (TMDB's genre ids differ
 * between TV and movies).
 */
export type TmdbSource = { list: "trending" | "popular" | "upcoming" | "top-rated" } | { list: "genre"; genre: number };

function sourceRequest(type: MediaType, source: TmdbSource): [string, Record<string, string>] {
  switch (source.list) {
    case "trending":
      return [`/trending/${type}/week`, {}];
    case "popular":
      return [`/${type}/popular`, {}];
    case "upcoming":
      return ["/movie/upcoming", {}];
    case "top-rated":
      return [
        `/discover/${type}`,
        {
          sort_by: "vote_average.desc",
          "vote_count.gte": String(topRatedVotes[type]),
          include_adult: "false",
        },
      ];
    case "genre":
      return [
        `/discover/${type}`,
        {
          with_genres: String(source.genre),
          sort_by: "popularity.desc",
          "vote_count.gte": String(minVotes[type]),
          include_adult: "false",
        },
      ];
  }
}

// A page of a source (20 titles), and whether it's the last.
function sourcePage(type: MediaType, source: TmdbSource, page: number): Promise<{ titles: Listed[]; last: boolean }> {
  const [path, params] = sourceRequest(type, source);
  const key = `${path}?${new URLSearchParams({ ...params, page: String(page) })}`;
  return remember(key, listTtlMs, async () => {
    const answer = await get<TmdbPage<TmdbTvItem | TmdbMovieItem>>(path, { ...params, page: String(page) });
    const total = typeof answer?.total_pages === "number" ? answer.total_pages : page;
    return { titles: listed(type, answer), last: page >= total };
  });
}

// Pages read at most to fill a list, after the titles left out.
const maxPages = 3;

/**
 * Up to `count` titles from a source, in its order, leaving out those with
 * fewer than `votes` votes and those in `exclude` (TMDB ids, of this type):
 * reads the next page while the list isn't full, up to 3 pages.
 */
export async function collectTitles(
  type: MediaType,
  source: TmdbSource,
  { count, votes, exclude = new Set() }: { count: number; votes: number; exclude?: ReadonlySet<number> },
): Promise<TitleSummary[]> {
  const found: TitleSummary[] = [];
  const seen = new Set(exclude);
  for (let page = 1; page <= maxPages && found.length < count; page++) {
    const { titles, last } = await sourcePage(type, source, page);
    for (const { title, votes: titleVotes } of titles) {
      if (titleVotes < votes || seen.has(title.tmdbId)) continue;
      seen.add(title.tmdbId);
      found.push(title);
      if (found.length === count) break;
    }
    if (last) break;
  }
  return found;
}

/** TMDB's recommendations for people who liked a title (page 1, 20 at most), with their votes. They change slowly. */
export function recommendedFor(type: MediaType, tmdbId: number): Promise<Listed[]> {
  return remember(`${type}/${tmdbId}/recommendations`, recommendationsTtlMs, async () =>
    listed(type, await get<TmdbPage<TmdbTvItem | TmdbMovieItem>>(`/${type}/${tmdbId}/recommendations`, { page: "1" })),
  );
}

// "The Office!" and "the office" are the same search.
const comparable = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// How well a result matches the search: its title exactly, then titles that
// start with it, then the rest; in each, the ones with a poster and enough
// votes (minVotes) first: TMDB also finds obscure entries. TMDB's order otherwise.
function searchRank(query: string, { title, votes }: Listed): number {
  const wanted = comparable(query),
    found = comparable(title.title);
  const match = found === wanted ? 0 : found.startsWith(wanted) ? 1 : 2;
  return match * 2 + (title.posterPath && votes >= minVotes[title.type] ? 0 : 1);
}

/**
 * TV shows and movies matching `query` (people and collections are left out),
 * the closest matches first.
 */
export function searchTitles(query: string): Promise<TitleSummary[]> {
  return remember(`search/${query.toLowerCase()}`, searchTtlMs, async () => {
    const page = await get<TmdbPage<TmdbMultiItem>>("/search/multi", { query, include_adult: "false", page: "1" });
    const results = Array.isArray(page?.results) ? page.results : [];
    const titles = results.flatMap((item): Listed[] =>
      (item?.media_type === "tv" || item?.media_type === "movie") && validId(item.id)
        ? [{ title: summary(item.media_type, item), votes: votesOf(item) }]
        : [],
    );
    // TMDB lists a title once per type, but a page can repeat one across pages' edges.
    const unique = [...new Map(titles.map((found) => [`${found.title.type}:${found.title.tmdbId}`, found])).values()];
    // Stable, so TMDB's order stays within each rank.
    return unique
      .map((found, index) => ({ found, index, rank: searchRank(query, found) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map(({ found }) => found.title);
  });
}

// TV: the episode count of each regular season, season 1 first; season 0 holds
// the specials. Seasons without episodes yet (announced ones) are left out at
// the end, and count 0 in a gap.
function seasonEpisodes(seasons: TmdbTvDetails["seasons"]): number[] {
  const counts: number[] = [];
  for (const season of Array.isArray(seasons) ? seasons : []) {
    const number = season?.season_number,
      count = season?.episode_count;
    if (
      typeof number === "number" &&
      Number.isInteger(number) &&
      number >= 1 &&
      number <= 1000 &&
      typeof count === "number" &&
      Number.isInteger(count) &&
      count > 0
    )
      counts[number - 1] = count;
  }
  return Array.from(counts, (count) => count ?? 0);
}

// The genre names, at most 5, each a short plain name.
function genreNames(details: TmdbGenres | undefined): string[] {
  const genres = Array.isArray(details?.genres) ? details.genres : [];
  return genres
    .map((genre) => text(genre?.name))
    .filter((name) => name && name.length <= 40)
    .slice(0, 5);
}

/** A title's details, straight from TMDB. */
export async function fetchTitle(type: MediaType, tmdbId: number): Promise<TmdbTitle> {
  if (type === "tv") {
    const show = await get<TmdbTvDetails>(`/tv/${tmdbId}`);
    // episode_run_time is often empty for newer shows; the latest episode's runtime stands in.
    const runtimes = Array.isArray(show?.episode_run_time) ? show.episode_run_time : [];
    return {
      ...summary("tv", { ...show, id: tmdbId }),
      overview: text(show?.overview),
      genres: genreNames(show),
      runtime: null,
      episodeRuntime:
        minutes(runtimes[0]) ??
        minutes(show?.last_episode_to_air?.runtime) ??
        minutes(show?.next_episode_to_air?.runtime),
      episodesPerSeason: seasonEpisodes(show?.seasons),
    };
  }
  const movie = await get<TmdbMovieDetails>(`/movie/${tmdbId}`);
  return {
    ...summary("movie", { ...movie, id: tmdbId }),
    overview: text(movie?.overview),
    genres: genreNames(movie),
    runtime: minutes(movie?.runtime),
    episodeRuntime: null,
    episodesPerSeason: null,
  };
}

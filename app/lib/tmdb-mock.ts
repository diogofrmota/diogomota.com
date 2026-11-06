import "server-only";

// A fake TMDB for the e2e tests: with test hooks on, lib/tmdb.ts sends its
// requests here instead of to api.themoviedb.org. It answers the endpoints the
// app uses with made-up titles, in TMDB's response format. Its ids start at
// 2,100,000,000, far above TMDB's, so what it puts in the shows table can't be
// mistaken for real titles; e2e/global-teardown.ts deletes them.

export const mockIdBase = 2_100_000_000;

type MockTitle = { type: "tv" | "movie"; id: number; title: string; year: number; rating: number; poster: boolean; votes: number };
type Named = Partial<Omit<MockTitle, "type">> & { title: string };

// Each list has 3 pages of 20 titles, every one with 5,000 votes unless named
// otherwise. Page 1's named titles, by their index, are what the tests look for.
function list(type: MockTitle["type"], offset: number, label: string, named: Record<number, Named> = {}): MockTitle[][] {
  return [1, 2, 3].map((pageNumber) => Array.from({ length: 20 }, (_, i) => {
    const n = (pageNumber - 1) * 20 + i;
    const plain: MockTitle = {
      type, id: mockIdBase + offset + n + 1, title: `${label} ${n + 1}`, year: 2000 + (n % 26),
      rating: Math.round((8.5 - n / 10) * 10) / 10, poster: n !== 19, votes: 5000,
    };
    return pageNumber === 1 && named[i] ? { ...plain, ...named[i] } : plain;
  }));
}

const harborLights: Named = { id: mockIdBase + 101, title: "Harbor Lights", year: 2021, rating: 7.8, poster: true };
const glassMeridian: Named = { id: mockIdBase + 401, title: "Glass Meridian", year: 2026, rating: 8.2, poster: true };

// By TMDB path (Discover's genre lists and top rated are TMDB's /discover, with
// a genre or sorted by rating). Some titles are in two lists, as on TMDB: Glass
// Meridian is trending and popular, Harbor Lights popular and a comedy. Two have
// a top rating from a handful of votes, which the app leaves out.
const lists: Record<string, MockTitle[][]> = {
  "tv/top_rated": list("tv", 0, "Top Rated Series", {
    0: { title: "The Quiet Orchard", year: 2016, rating: 9.1, poster: true },
    5: { title: "Obscure Gem", year: 2023, rating: 9.9, votes: 12 },
  }),
  "tv/popular": list("tv", 100, "Popular Series", { 0: harborLights, 5: glassMeridian }),
  "movie/top_rated": list("movie", 200, "Top Rated Film", { 0: { title: "Paper Moons", year: 1994, rating: 8.9, poster: true } }),
  "movie/popular": list("movie", 300, "Popular Film", {
    0: { title: "Northern Line", year: 2025, rating: 7.2, poster: true },
    1: { title: "Harbor Lights: Low Tide", year: 2024, rating: 6.4, poster: true },
  }),
  "trending/tv/week": list("tv", 400, "Trending Series", { 0: glassMeridian }),
  "trending/movie/week": list("movie", 600, "Trending Film", {
    0: { title: "Copper Sky", year: 2026, rating: 7.6, poster: true },
    3: { title: "Festival Darling", year: 2026, rating: 9.8, votes: 7 },
  }),
  "movie/upcoming": list("movie", 800, "Upcoming Film", { 0: { title: "Tomorrow's Tide", year: 2027, rating: 7, poster: true } }),
  "tv/genre/35": list("tv", 1100, "Comedy Series", { 0: { title: "Laugh Track", year: 2022, rating: 7.9, poster: true }, 2: harborLights }),
  "tv/genre/80": list("tv", 1200, "Crime Series", { 0: { title: "Cold Case Avenue", year: 2020, rating: 8, poster: true } }),
  "tv/genre/10765": list("tv", 1300, "Fantasy Series", { 0: { title: "Starbound", year: 2024, rating: 8.1, poster: true } }),
  "movie/genre/28": list("movie", 1400, "Action Film", { 0: { title: "Iron Tide", year: 2025, rating: 7.4, poster: true } }),
  "movie/genre/35": list("movie", 1500, "Comedy Film", { 0: { title: "Best Man Down", year: 2023, rating: 7.1, poster: true } }),
  "movie/genre/878": list("movie", 1600, "Sci-Fi Film", { 0: { title: "Orbit Nine", year: 2026, rating: 7.7, poster: true } }),
};
// What TMDB recommends for any title of each type (/{type}/{id}/recommendations),
// after the top rated list's first title (which tests may have in a library).
const recommended: Record<MockTitle["type"], MockTitle[]> = {
  tv: list("tv", 900, "Recommended Series", { 0: { title: "Lanterns at Dusk", year: 2019, rating: 8.4, poster: true } })[0],
  movie: list("movie", 1000, "Recommended Film", { 0: { title: "The Last Ferry", year: 2018, rating: 8.1, poster: true } })[0],
};
// What searches find: page 1 of each list. Details: any title in them.
const searchable = [...Object.values(lists).map((pages) => pages[0]), ...Object.values(recommended)].flat();
const catalog = [...Object.values(lists).flat(), ...Object.values(recommended)].flat();

/** The requests the fake TMDB answered, oldest first (read by /api/test/tmdb). */
export type MockRequest = { path: string; query: string | null; authorized: boolean };
const globalForMock = globalThis as typeof globalThis & { tmdbMockLog?: MockRequest[] };
export const tmdbMockLog = (globalForMock.tmdbMockLog ??= []);

const posterPath = (title: MockTitle) => (title.poster ? `/e2e-poster-${title.id}.jpg` : null);

function item(title: MockTitle) {
  const common = { id: title.id, poster_path: posterPath(title), vote_average: title.rating, vote_count: title.votes, overview: `Overview of ${title.title}.` };
  return title.type === "tv"
    ? { ...common, name: title.title, first_air_date: `${title.year}-03-14` }
    : { ...common, title: title.title, release_date: `${title.year}-09-01` };
}

const page = (results: object[], number = 1, pages = 1) => ({ page: number, results, total_pages: pages, total_results: results.length });

// The page of a list that ?page= asks for.
function listPage(pages: MockTitle[][], url: URL) {
  const number = Number(url.searchParams.get("page") ?? "1");
  return page((pages[number - 1] ?? []).map(item), number, pages.length);
}

function details(type: MockTitle["type"], id: number) {
  const title = catalog.find((t) => t.type === type && t.id === id) ??
    { type, id, title: `Mock ${type === "tv" ? "Series" : "Film"} ${id - mockIdBase}`, year: 2010, rating: 7, poster: true, votes: 5000 };
  if (type === "movie") return { ...item(title), runtime: title.title === "Paper Moons" ? 128 : 90 + (id % 60) };
  return {
    ...item(title),
    // Harbor Lights has no episode_run_time, like many newer shows on TMDB.
    episode_run_time: title.title === "Harbor Lights" ? [] : [45],
    last_episode_to_air: { runtime: 52 },
    next_episode_to_air: null,
    // Season 0 holds specials; season 3 is announced without episodes yet.
    seasons: [
      { season_number: 0, episode_count: 3 },
      { season_number: 1, episode_count: 10 },
      { season_number: 2, episode_count: 8 },
      { season_number: 3, episode_count: 0 },
    ],
  };
}

function answer(url: URL): [number, object] {
  const path = url.pathname.replace(/^\/3/, "");
  if (lists[path.slice(1)]) return [200, listPage(lists[path.slice(1)], url)];
  const discover = /^\/discover\/(tv|movie)$/.exec(path);
  if (discover) {
    // Like TMDB, by genre or by rating; unlike it, vote_count.gte is ignored, so the app's own floor is what counts.
    const genre = url.searchParams.get("with_genres");
    const key = genre ? `${discover[1]}/genre/${genre}` : url.searchParams.get("sort_by") === "vote_average.desc" ? `${discover[1]}/top_rated` : "";
    if (lists[key]) return [200, listPage(lists[key], url)];
  }
  if (path === "/search/multi") {
    const query = url.searchParams.get("query")?.toLowerCase() ?? "";
    // A search for "tmdb-down" fails, for the error message and its Retry button.
    if (query.includes("tmdb-down")) return [503, { status_message: "Service unavailable" }];
    const titles = searchable.filter((title) => title.title.toLowerCase().includes(query));
    // A person too: search/multi finds people, which the app leaves out.
    const people = "harbor master".includes(query) ? [{ media_type: "person", id: 7, name: "Harbor Master" }] : [];
    return [200, page([...titles.map((title) => ({ ...item(title), media_type: title.type })), ...people])];
  }
  const recommendations = /^\/(tv|movie)\/(\d+)\/recommendations$/.exec(path);
  if (recommendations && Number(recommendations[2]) > mockIdBase) {
    const type = recommendations[1] as MockTitle["type"];
    return [200, page([lists[`${type}/top_rated`][0][0], ...recommended[type].slice(0, 19)].map(item))];
  }
  const match = /^\/(tv|movie)\/(\d+)$/.exec(path);
  if (match && Number(match[2]) > mockIdBase) return [200, details(match[1] as MockTitle["type"], Number(match[2]))];
  return [404, { status_message: "The resource you requested could not be found." }];
}

export async function mockTmdb(url: URL, init: RequestInit): Promise<Response> {
  const authorized = /^Bearer \S+$/.test(new Headers(init.headers).get("Authorization") ?? "");
  tmdbMockLog.push({ path: url.pathname.replace(/^\/3/, ""), query: url.searchParams.get("query"), authorized });
  if (tmdbMockLog.length > 1000) tmdbMockLog.shift();
  const [status, body] = authorized ? answer(url) : [401, { status_message: "Invalid API key" }];
  return Response.json(body, { status });
}

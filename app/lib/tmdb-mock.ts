import "server-only";

// A fake TMDB for the e2e tests: with test hooks on, lib/tmdb.ts sends its
// requests here instead of to api.themoviedb.org. It answers the endpoints the
// app uses with made-up titles, in TMDB's response format. Its ids start at
// 2,100,000,000, far above TMDB's, so what it puts in the shows table can't be
// mistaken for real titles; e2e/global-teardown.ts deletes them.

export const mockIdBase = 2_100_000_000;

type MockTitle = { type: "tv" | "movie"; id: number; title: string; year: number; rating: number; poster: boolean };

// Each list has 20 titles; the named ones are what the tests search for.
function list(type: MockTitle["type"], offset: number, label: string, named: Omit<MockTitle, "type" | "id">[]): MockTitle[] {
  return Array.from({ length: 20 }, (_, i) => ({
    type,
    id: mockIdBase + offset + i + 1,
    ...(named[i] ?? { title: `${label} ${i + 1}`, year: 2000 + i, rating: Math.round((8.5 - i / 10) * 10) / 10, poster: i !== 19 }),
  }));
}

const lists: Record<string, MockTitle[]> = {
  "tv/top_rated": list("tv", 0, "Top Rated Series", [{ title: "The Quiet Orchard", year: 2016, rating: 9.1, poster: true }]),
  "tv/popular": list("tv", 100, "Popular Series", [{ title: "Harbor Lights", year: 2021, rating: 7.8, poster: true }]),
  "movie/top_rated": list("movie", 200, "Top Rated Film", [{ title: "Paper Moons", year: 1994, rating: 8.9, poster: true }]),
  "movie/popular": list("movie", 300, "Popular Film", [
    { title: "Northern Line", year: 2025, rating: 7.2, poster: true },
    { title: "Harbor Lights: Low Tide", year: 2024, rating: 6.4, poster: true },
  ]),
};
const catalog = Object.values(lists).flat();

/** The requests the fake TMDB answered, oldest first (read by /api/test/tmdb). */
export type MockRequest = { path: string; query: string | null; authorized: boolean };
const globalForMock = globalThis as typeof globalThis & { tmdbMockLog?: MockRequest[] };
export const tmdbMockLog = (globalForMock.tmdbMockLog ??= []);

const posterPath = (title: MockTitle) => (title.poster ? `/e2e-poster-${title.id}.jpg` : null);

function item(title: MockTitle) {
  const common = { id: title.id, poster_path: posterPath(title), vote_average: title.rating, vote_count: 1000, overview: `Overview of ${title.title}.` };
  return title.type === "tv"
    ? { ...common, name: title.title, first_air_date: `${title.year}-03-14` }
    : { ...common, title: title.title, release_date: `${title.year}-09-01` };
}

const page = (results: object[]) => ({ page: 1, results, total_pages: 1, total_results: results.length });

function details(type: MockTitle["type"], id: number) {
  const title = catalog.find((t) => t.type === type && t.id === id) ??
    { type, id, title: `Mock ${type === "tv" ? "Series" : "Film"} ${id - mockIdBase}`, year: 2010, rating: 7, poster: true };
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
  if (lists[path.slice(1)]) return [200, page(lists[path.slice(1)].map(item))];
  if (path === "/search/multi") {
    const query = url.searchParams.get("query")?.toLowerCase() ?? "";
    // A search for "tmdb-down" fails, for the error message and its Retry button.
    if (query.includes("tmdb-down")) return [503, { status_message: "Service unavailable" }];
    const titles = catalog.filter((title) => title.title.toLowerCase().includes(query));
    // A person too: search/multi finds people, which the app leaves out.
    const people = "harbor master".includes(query) ? [{ media_type: "person", id: 7, name: "Harbor Master" }] : [];
    return [200, page([...titles.map((title) => ({ ...item(title), media_type: title.type })), ...people])];
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

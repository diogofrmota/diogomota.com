// Types and helpers of the Shows app, for both the server and the browser.

export type MediaType = "tv" | "movie";
export const mediaTypes: readonly MediaType[] = ["tv", "movie"];

export type LibraryStatus = "watching" | "planned" | "completed";
/** What a title can be added to the library as, from Discover. */
export const addStatuses = ["watching", "planned"] as const satisfies readonly LibraryStatus[];

/** A title as shown on a card: in a Discover section or search results. */
export type TitleSummary = {
  type: MediaType;
  tmdbId: number;
  title: string;
  year: number | null;
  /** TMDB image path, e.g. "/abc.jpg" (see tmdbImageUrl), or null without a poster. */
  posterPath: string | null;
  /** TMDB's average rating, 0-10 with one decimal; null with no votes yet. */
  rating: number | null;
};

/** The current user's library entry for a title. */
export type LibraryEntry = {
  id: string;
  status: LibraryStatus;
  rating: number | null;
  currentSeason: number | null;
  currentEpisode: number | null;
  isFavourite: boolean;
};

/** A title as shown in the detail panel, from the shows table (the TMDB cache). */
export type TitleDetail = TitleSummary & {
  overview: string;
  /** Movie: minutes. */
  runtime: number | null;
  /** TV: typical episode length in minutes. */
  episodeRuntime: number | null;
  /** TV: episode count of each regular season, season 1 first. */
  episodesPerSeason: number[] | null;
  library: LibraryEntry | null;
};

export type DiscoverSection = "top-rated" | "popular" | "friends";
export const discoverSections: readonly DiscoverSection[] = ["top-rated", "popular", "friends"];

/** Key of a title in panel ids and lists, e.g. "tv:1399". */
export const titleKey = (title: Pick<TitleSummary, "type" | "tmdbId">) => `${title.type}:${title.tmdbId}`;

export function parseTitleKey(key: string): Pick<TitleSummary, "type" | "tmdbId"> | null {
  const match = /^(tv|movie):([1-9]\d{0,9})$/.exec(key);
  return match ? { type: match[1] as MediaType, tmdbId: Number(match[2]) } : null;
}

// TMDB serves its images in fixed widths: https://developer.themoviedb.org/docs/image-basics
const imageHost = "https://image.tmdb.org/t/p";
const posterWidths = [92, 154, 185, 342, 500, 780] as const;

/**
 * The URL of a TMDB poster in the size closest to `width` pixels (the smaller on
 * a tie), at most 780 wide: the originals can be several megabytes.
 */
export function tmdbImageUrl(path: string, width: number): string {
  const size = posterWidths.reduce((best, w) => (Math.abs(w - width) < Math.abs(best - width) ? w : best));
  return `${imageHost}/w${size}${path}`;
}

export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`;
}

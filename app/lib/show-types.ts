// Types and helpers of the Shows app, for both the server and the browser.

import type { Named } from "./names";

export type MediaType = "tv" | "movie";
export const mediaTypes: readonly MediaType[] = ["tv", "movie"];

export type LibraryStatus = "watching" | "planned" | "completed";
/** In the order of the Watchlist's sections, and of every status picker. */
export const libraryStatuses: readonly LibraryStatus[] = ["planned", "watching", "completed"];
export const statusNames: Record<LibraryStatus, string> = { watching: "Watching", planned: "Planned", completed: "Completed" };
/** What a title can be added to the library as, from Discover, search and the guide. */
export const addStatuses = ["planned", "watching", "completed"] as const satisfies readonly LibraryStatus[];

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
  /** TV: the last episode watched (both null before the first). */
  currentSeason: number | null;
  currentEpisode: number | null;
  isFavourite: boolean;
};

/** A library entry without its id, as a friend sees it. */
export type SharedEntry = Omit<LibraryEntry, "id">;

/** What a library entry's PATCH can change. Progress is both fields or neither. */
export type LibraryChange = Partial<SharedEntry>;

/** How long a title is, from the shows table (the TMDB cache). */
export type TitleLengths = {
  /** Movie: minutes. */
  runtime: number | null;
  /** TV: typical episode length in minutes. */
  episodeRuntime: number | null;
  /** TV: episode count of each regular season, season 1 first. */
  episodesPerSeason: number[] | null;
};

/** A title in the user's library, as on a Watchlist card, with its lengths for the stats. */
export type LibraryItem = TitleSummary & TitleLengths & { library: LibraryEntry };

/** A title in a friend's library, as on a card in their profile, with its seasons for the progress line. */
export type FriendItem = TitleSummary & Pick<TitleLengths, "episodesPerSeason"> & { library: SharedEntry };

/** A title as shown in the detail panel, from the shows table (the TMDB cache). */
export type TitleDetail = TitleSummary & TitleLengths & {
  overview: string;
  library: LibraryEntry | null;
};

export type DiscoverSection =
  | "for-you" | "trending" | "popular" | "upcoming" | "top-rated" | "action" | "comedy" | "crime" | "sci-fi" | "friends";

/**
 * Discover's sections for TV shows and for movies, in their order: the three
 * after Top Rated are genres. For You is only there with titles of that type in
 * the library: it is made from them.
 */
export const discoverSections: Record<MediaType, readonly { id: DiscoverSection; heading: string }[]> = {
  tv: [
    { id: "for-you", heading: "For You" },
    { id: "trending", heading: "Trending This Week" },
    { id: "popular", heading: "Popular" },
    { id: "top-rated", heading: "Top Rated" },
    { id: "comedy", heading: "Comedy" },
    { id: "crime", heading: "Crime" },
    { id: "sci-fi", heading: "Sci-Fi & Fantasy" },
    { id: "friends", heading: "Added by Friends" },
  ],
  movie: [
    { id: "for-you", heading: "For You" },
    { id: "trending", heading: "Trending This Week" },
    { id: "popular", heading: "Popular" },
    { id: "upcoming", heading: "Coming Soon" },
    { id: "top-rated", heading: "Top Rated" },
    { id: "action", heading: "Action" },
    { id: "comedy", heading: "Comedy" },
    { id: "sci-fi", heading: "Science Fiction" },
    { id: "friends", heading: "Added by Friends" },
  ],
};

/** Someone suggested in the friend search, and how they and the user are connected. */
export type PersonMatch = Person & { relation: "none" | "friend" | "incoming" | "outgoing" };

/**
 * People whose username or name starts with what was typed (`matches`),
 * whether another account has exactly it as its username (`exact`), and
 * whether it is the user's own (`self`).
 */
export type PeopleSearch = { matches: PersonMatch[]; exact: boolean; self: boolean };

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

export type Episode = { season: number; episode: number };

/** The progress of a library entry, or null before the first episode. */
export const progressOf = (entry: Pick<LibraryEntry, "currentSeason" | "currentEpisode">): Episode | null =>
  entry.currentSeason && entry.currentEpisode ? { season: entry.currentSeason, episode: entry.currentEpisode } : null;

/** "S2 E5" */
export const formatEpisode = ({ season, episode }: Episode) => `S${season} E${episode}`;

/**
 * The episode after `current` (null: the first one), or null after the show's
 * last episode. Seasons without episodes are skipped.
 */
export function nextEpisode(episodesPerSeason: readonly number[], current: Episode | null): Episode | null {
  let season = current?.season ?? 1;
  let episode = (current?.episode ?? 0) + 1;
  for (; season <= episodesPerSeason.length; season++, episode = 1) {
    if (episode <= episodesPerSeason[season - 1]) return { season, episode };
  }
  return null;
}

/** Whether `episode` is in the show (TMDB's episode count of each season). */
export const hasEpisode = (episodesPerSeason: readonly number[], { season, episode }: Episode) =>
  Number.isInteger(season) && Number.isInteger(episode) && season >= 1 && season <= episodesPerSeason.length &&
  episode >= 1 && episode <= episodesPerSeason[season - 1];

/** Whether `episode` is the show's last one. */
export const isLastEpisode = (episodesPerSeason: readonly number[], episode: Episode) =>
  hasEpisode(episodesPerSeason, episode) && !nextEpisode(episodesPerSeason, episode);

export function formatRuntime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`;
}

const sum = (counts: readonly number[]) => counts.reduce((total, count) => total + count, 0);

/** What the stats need of a title in a library. */
type StatsItem = Pick<TitleSummary, "type"> & TitleLengths & { library: Pick<LibraryEntry, "status" | "currentSeason" | "currentEpisode"> };

/**
 * The episodes of a TV show in the library that count as watched: every
 * episode of a completed show, up to the progress of one being watched (the
 * last episode watched included), none of a planned one.
 */
export function episodesWatched(item: Pick<StatsItem, "episodesPerSeason" | "library">): number {
  const seasons = item.episodesPerSeason ?? [];
  if (item.library.status === "completed") return sum(seasons);
  const progress = item.library.status === "watching" ? progressOf(item.library) : null;
  return progress ? sum(seasons.slice(0, progress.season - 1)) + progress.episode : 0;
}

/**
 * How much of a title in the library has been watched, 0 to 1: all of a
 * completed one, the share of a TV show's episodes watched while watching it
 * (0 without its seasons), none of a movie being watched or a planned title.
 */
export function shareWatched(item: Pick<StatsItem, "type" | "episodesPerSeason" | "library">): number {
  if (item.library.status === "completed") return 1;
  const total = sum(item.episodesPerSeason ?? []);
  return item.type === "tv" && total ? Math.min(1, episodesWatched(item) / total) : 0;
}

export type LibraryStats = {
  tvCompleted: number;
  moviesCompleted: number;
  /** TV episodes watched (episodesWatched). */
  episodesWatched: number;
  /** The episodes watched at each show's episode runtime, plus the runtimes of the completed movies. */
  minutesWatched: number;
};

/** A library's stats. Titles TMDB gives no runtime count as 0 minutes. */
export function libraryStats(items: readonly StatsItem[]): LibraryStats {
  const stats: LibraryStats = { tvCompleted: 0, moviesCompleted: 0, episodesWatched: 0, minutesWatched: 0 };
  for (const item of items) {
    const completed = item.library.status === "completed";
    if (item.type === "movie") {
      if (completed) { stats.moviesCompleted++; stats.minutesWatched += item.runtime ?? 0; }
      continue;
    }
    if (completed) stats.tvCompleted++;
    const episodes = episodesWatched(item);
    stats.episodesWatched += episodes;
    stats.minutesWatched += episodes * (item.episodeRuntime ?? 0);
  }
  return stats;
}

/** Hours with at most one decimal, e.g. "1,234.5". */
export const formatHours = (minutes: number) =>
  (Math.round(minutes / 6) / 10).toLocaleString("en-GB", { maximumFractionDigits: 1 });

/**
 * A friend, a request someone sent the user, or one the user sent: with their
 * profile picture and names, if they have them (lib/names.ts).
 */
export type Person = Named & { id: string; avatarUrl: string | null };

/** The user's friends and pending friend requests, each by username. */
export type FriendsState = { friends: Person[]; incoming: Person[]; outgoing: Person[] };

/** A friend's profile: what they're watching, what they've completed, their favourites and their stats. */
export type FriendProfile = Person & { stats: LibraryStats; items: FriendItem[] };

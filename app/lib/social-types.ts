import type { Named } from "./names";
import type { BookInput } from "./book-types";
import type { FriendItem, LibraryStats, TitleSummary } from "./show-types";

export type Person = Named & { id: string; avatarUrl: string | null };
export type FriendsState = { friends: Person[]; incoming: Person[]; outgoing: Person[] };
export type PersonMatch = Person & { relation: "none" | "friend" | "incoming" | "outgoing" };
export type PeopleSearch = { matches: PersonMatch[]; exact: boolean; self: boolean };
export type SharedBook = BookInput & { id: string };
export type BookStats = { wantToRead: number; currentlyReading: number; finished: number; pagesRead: number };
export type SocialProfile = Person & {
  shows: { stats: LibraryStats; items: FriendItem[] };
  books: { stats: BookStats; items: SharedBook[] };
  bothPlanned: TitleSummary[];
};

export function bookStats(items: readonly Pick<BookInput, "shelf" | "pagesRead">[]): BookStats {
  const stats: BookStats = { wantToRead: 0, currentlyReading: 0, finished: 0, pagesRead: 0 };
  for (const book of items) {
    if (book.shelf === "want-to-read") stats.wantToRead++;
    else if (book.shelf === "currently-reading") stats.currentlyReading++;
    else stats.finished++;
    stats.pagesRead += book.pagesRead;
  }
  return stats;
}

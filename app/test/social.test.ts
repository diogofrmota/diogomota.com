import { describe, expect, test } from "vitest";
import { bookStats } from "@/lib/social-types";
import { bookInput, normalizeProgress } from "@/lib/book-types";
import { booksViews, showsViews, viewFromParams } from "@/lib/app-views";

describe("Social", () => {
  test("book totals include recorded progress with unknown page counts", () => {
    const books = [
      { title: "Planned", shelf: "want-to-read", pagesRead: 50 },
      { title: "Reading", shelf: "currently-reading", pagesRead: 45, totalPages: 300 },
      { title: "Finished", shelf: "finished", pagesRead: 20, totalPages: 200 },
      { title: "Unknown", shelf: "finished", pagesRead: 80 },
    ].map((input) => normalizeProgress(bookInput.parse(input)));
    expect(bookStats(books)).toEqual({ wantToRead: 1, currentlyReading: 1, finished: 2, pagesRead: 325 });
    expect(bookStats([])).toEqual({ wantToRead: 0, currentlyReading: 0, finished: 0, pagesRead: 0 });
  });
  test("Shows and Books have a profile view, and open on their library", () => {
    for (const views of [showsViews, booksViews]) {
      expect(viewFromParams(views, ["profile"], undefined)?.view).toBe("profile");
      expect(viewFromParams(views, undefined, undefined)?.view).toBe("library");
    }
  });
});

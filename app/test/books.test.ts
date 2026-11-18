import { describe, expect, test } from "vitest";
import { bookInput, normalizeProgress, pagesText, progressPercent, shareRead } from "@/lib/book-types";

describe("reading progress", () => {
  const book = bookInput.parse({ title: "Dune", totalPages: 400, pagesRead: 120, shelf: "currently-reading" });
  test("tracks known and unknown page counts", () => {
    expect(progressPercent(book)).toBe(30);
    expect(progressPercent({ ...book, totalPages: null })).toBeNull();
    expect(progressPercent({ ...book, totalPages: null, shelf: "finished" })).toBe(100);
  });
  test("shelf changes reset or complete progress, and the last page finishes the book", () => {
    expect(normalizeProgress({ ...book, shelf: "want-to-read" }).pagesRead).toBe(0);
    expect(normalizeProgress({ ...book, shelf: "finished" }).pagesRead).toBe(400);
    expect(normalizeProgress({ ...book, pagesRead: 400 }).shelf).toBe("finished");
    expect(normalizeProgress({ ...book, totalPages: null, pagesRead: 400 }).shelf).toBe("currently-reading");
  });
  test("how far, for a cover's line and a card's words", () => {
    expect(shareRead(book)).toBe(0.3);
    expect(shareRead({ ...book, totalPages: null })).toBe(0);
    expect(shareRead({ ...book, totalPages: null, shelf: "finished" })).toBe(1);
    expect(pagesText(book)).toBe("120 of 400 pages · 30%");
    expect(pagesText({ ...book, totalPages: null })).toBe("120 pages read");
    expect(pagesText({ ...book, totalPages: null, pagesRead: 1 })).toBe("1 page read");
  });
  test("rejects impossible progress and invalid catalogue data", () => {
    for (const change of [
      { pagesRead: -1 },
      { pagesRead: 401 },
      { pagesRead: 1.5 },
      { totalPages: 0 },
      { title: " " },
      { catalogId: "https://example.com" },
      { shelf: "other" },
    ])
      expect(bookInput.safeParse({ ...book, ...change }).success).toBe(false);
  });
});

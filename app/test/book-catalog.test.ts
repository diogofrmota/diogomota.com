import { describe, expect, test } from "vitest";
import { parseCatalogBooks } from "@/lib/book-catalog";

describe("Open Library catalogue", () => {
  test("accepts both work ID formats and tolerates missing or invalid optional metadata", () => {
    expect(
      parseCatalogBooks({
        docs: [
          {
            key: "/works/OL893415W",
            title: "Dune",
            author_name: ["Frank Herbert"],
            cover_i: 123,
            number_of_pages_median: 400,
          },
          { key: "OL123W", title: "Another book", cover_i: -1, number_of_pages_median: 0, author_name: null },
          { key: "/books/OL123M", title: "An edition" },
          { key: "OL124W", title: " " },
        ],
      }),
    ).toEqual([
      { catalogId: "OL893415W", title: "Dune", author: "Frank Herbert", coverId: 123, totalPages: 400 },
      { catalogId: "OL123W", title: "Another book", author: "", coverId: null, totalPages: null },
    ]);
  });

  test("rejects an upstream error body instead of presenting an empty catalogue", () => {
    expect(() => parseCatalogBooks({ error: "Unavailable" })).toThrow();
  });
});

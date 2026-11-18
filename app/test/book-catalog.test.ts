import { describe, expect, test } from "vitest";
import { cleanDescription, parseCatalogBooks, pickSubjects } from "@/lib/book-catalog";

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

  test("a description is plain text: no Markdown links, sources or what an edition contains", () => {
    expect(
      cleanDescription(
        "Set on [Arrakis](https://example.com/arrakis), Dune [follows][1] Paul.\r\n\r\n\r\nA classic.\n\n----------\nContains:\n- [Dune](/works/OL1W)\n\n[1]: https://example.com",
      ),
    ).toBe("Set on Arrakis, Dune follows Paul.\n\nA classic.");
    expect(cleanDescription("  Just text.  ")).toBe("Just text.");
    expect(cleanDescription("x".repeat(5000))).toHaveLength(4000);
  });

  test("subjects: up to three short, plain ones, once each, not lists or awards", () => {
    expect(
      pickSubjects([
        "Dune (Imaginary place)",
        "Fiction",
        "Fiction, science fiction, general",
        "New York Times reviewed",
        "Science fiction",
        "Science-fiction",
        "nyt:mass-market-monthly=2021-11-07",
        "award:hugo_award=1966",
        "Hugo Award Winner",
        "american literature",
        "Ecology",
      ]),
    ).toEqual(["Fiction", "Science fiction", "American literature"]);
    expect(pickSubjects([])).toEqual([]);
  });
});

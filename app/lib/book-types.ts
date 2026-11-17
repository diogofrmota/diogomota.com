import { z } from "zod";

export const shelves = ["want-to-read", "currently-reading", "finished"] as const;
export type Shelf = (typeof shelves)[number];
export const shelfLabels: Record<Shelf, string> = {
  "want-to-read": "Want to Read",
  "currently-reading": "Currently Reading",
  finished: "Finished",
};

export const bookInput = z
  .object({
    catalogId: z
      .string()
      .regex(/^OL\d+W$/)
      .nullable()
      .default(null),
    title: z.string().trim().min(1, "Enter a title.").max(300),
    author: z.string().trim().max(500).default(""),
    coverId: z.number().int().positive().max(2147483647).nullable().default(null),
    totalPages: z.number().int().min(1).max(100000).nullable().default(null),
    pagesRead: z.number().int().min(0).max(100000).default(0),
    shelf: z.enum(shelves).default("want-to-read"),
  })
  .superRefine((book, ctx) => {
    if (book.totalPages !== null && book.pagesRead > book.totalPages)
      ctx.addIssue({ code: "custom", path: ["pagesRead"], message: "Pages read cannot exceed the book's page count." });
  });

export type BookInput = z.output<typeof bookInput>;
export type Book = BookInput & { id: string; createdAt: string; updatedAt: string };
export type CatalogBook = Pick<BookInput, "catalogId" | "title" | "author" | "coverId" | "totalPages">;

export function normalizeProgress(book: BookInput): BookInput {
  if (book.shelf === "want-to-read") return { ...book, pagesRead: 0 };
  if (book.shelf === "finished") return { ...book, pagesRead: book.totalPages ?? book.pagesRead };
  if (book.totalPages !== null && book.pagesRead === book.totalPages) return { ...book, shelf: "finished" };
  return book;
}

export function progressPercent(book: Pick<BookInput, "totalPages" | "pagesRead" | "shelf">): number | null {
  if (book.shelf === "finished") return 100;
  return book.totalPages ? Math.round((book.pagesRead / book.totalPages) * 100) : null;
}

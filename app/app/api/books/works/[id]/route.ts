import { apiRoute, HttpError } from "@/lib/http";
import { fetchCatalogWork } from "@/lib/book-catalog";
import { bookSearchLimit } from "@/lib/rate-limit";

// GET /api/books/works/OL…W: a catalogue book's page (its description, first
// publication and subjects), from Open Library, cached for a day.
export const GET = apiRoute({ label: "Loading a book", limit: bookSearchLimit }, async ({ params }) => {
  if (!/^OL\d+W$/.test(params.id)) throw new HttpError("Book not found.", 404);
  let book;
  try {
    book = await fetchCatalogWork(params.id);
  } catch {
    throw new HttpError("This book's details are unavailable. Please try again.", 502);
  }
  if (!book) throw new HttpError("Book not found.", 404);
  return book;
});

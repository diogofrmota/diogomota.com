import { apiRoute, HttpError } from "@/lib/http";
import { fetchCatalogBooks } from "@/lib/book-catalog";
import { bookLists, bookListParams } from "@/lib/book-discovery";
import { bookSearchLimit } from "@/lib/rate-limit";

export const GET = apiRoute({ label: "Discovering books", limit: bookSearchLimit }, async ({ searchParams }) => {
  const list = bookLists.find((entry) => entry === searchParams.get("list"));
  if (!list) throw new HttpError("Choose Trending, Popular today or Top rated.");
  try {
    return await fetchCatalogBooks(bookListParams(list));
  } catch {
    throw new HttpError("This book list is unavailable. Please try again.", 502);
  }
});

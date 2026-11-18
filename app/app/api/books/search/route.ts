import { apiRoute, HttpError } from "@/lib/http";
import { fetchCatalogBooks } from "@/lib/book-catalog";
import { bookSearchLimit } from "@/lib/rate-limit";

export const GET = apiRoute({ label: "Searching books", limit: bookSearchLimit }, async ({ searchParams }) => {
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 200) throw new HttpError("Search with 2 to 200 characters.");
  const params = new URLSearchParams({
    q,
    limit: "20",
    fields: "key,title,author_name,cover_i,number_of_pages_median",
  });
  try {
    return await fetchCatalogBooks(params);
  } catch {
    throw new HttpError("Book search is unavailable. Try again, or add your book manually.", 502);
  }
});

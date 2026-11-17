import { z } from "zod";
import { apiRoute, HttpError } from "@/lib/http";
import type { CatalogBook } from "@/lib/book-types";
import { bookSearchLimit } from "@/lib/rate-limit";

const catalogResponse = z.object({
  docs: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      author_name: z.array(z.string()).optional().catch([]),
      cover_i: z.number().int().positive().max(2147483647).optional().catch(undefined),
      number_of_pages_median: z.number().int().positive().max(100000).optional().catch(undefined),
    }),
  ),
});

export const GET = apiRoute({ label: "Searching books", limit: bookSearchLimit }, async ({ searchParams }) => {
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 200) throw new HttpError("Search with 2 to 200 characters.");
  const params = new URLSearchParams({
    q,
    limit: "20",
    fields: "key,title,author_name,cover_i,number_of_pages_median",
  });
  try {
    const response = await fetch(`https://openlibrary.org/search.json?${params}`, {
      headers: { "User-Agent": "diogomota.com Books (https://diogomota.com)" },
      signal: AbortSignal.timeout(10000),
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error("Catalogue unavailable");
    const data = catalogResponse.parse(await response.json());
    return data.docs.flatMap((doc): CatalogBook[] => {
      const id = doc.key.replace(/^\/works\//, "");
      if (!/^OL\d+W$/.test(id) || !doc.title.trim()) return [];
      return [
        {
          catalogId: id,
          title: doc.title.slice(0, 300),
          author: (doc.author_name ?? []).join(", ").slice(0, 500),
          coverId: doc.cover_i ?? null,
          totalPages: doc.number_of_pages_median ?? null,
        },
      ];
    });
  } catch {
    throw new HttpError("Book search is unavailable. Try again, or add your book manually.", 502);
  }
});

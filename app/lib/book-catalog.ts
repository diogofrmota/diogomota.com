import { z } from "zod";
import type { CatalogBook } from "@/lib/book-types";

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

export function parseCatalogBooks(value: unknown): CatalogBook[] {
  const data = catalogResponse.parse(value);
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
}

export async function fetchCatalogBooks(params: URLSearchParams): Promise<CatalogBook[]> {
  const response = await fetch(`https://openlibrary.org/search.json?${params}`, {
    headers: { "User-Agent": "diogomota.com Books (https://diogomota.com)" },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error("Catalogue unavailable");
  return parseCatalogBooks(await response.json());
}

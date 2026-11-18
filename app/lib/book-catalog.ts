import { z } from "zod";
import type { CatalogBook, CatalogBookDetail } from "@/lib/book-types";

const catalogResponse = z.object({
  docs: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      author_name: z.array(z.string()).optional().catch([]),
      cover_i: z.number().int().positive().max(2147483647).optional().catch(undefined),
      number_of_pages_median: z.number().int().positive().max(100000).optional().catch(undefined),
      first_publish_year: z.number().int().optional().catch(undefined),
      subject: z.array(z.string()).optional().catch([]),
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

const headers = { "User-Agent": "diogomota.com Books (https://diogomota.com)" };

export async function fetchCatalogBooks(params: URLSearchParams): Promise<CatalogBook[]> {
  const response = await fetch(`https://openlibrary.org/search.json?${params}`, {
    headers,
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error("Catalogue unavailable");
  return parseCatalogBooks(await response.json());
}

// A work's own record (openlibrary.org/works/OL…W.json): its description, which
// is a string or { value }, and its subjects. A merged work is a redirect to the
// one it became.
const workResponse = z.object({
  type: z.object({ key: z.string() }).optional().catch(undefined),
  location: z.string().optional().catch(undefined),
  title: z.string().optional().catch(undefined),
  description: z
    .union([z.string(), z.object({ value: z.string() })])
    .optional()
    .catch(undefined),
  covers: z.array(z.number()).optional().catch([]),
  subjects: z.array(z.string()).optional().catch([]),
});

/**
 * A description as plain text: Open Library's are often Markdown, with links,
 * and a "----------" line before their sources or what an edition contains.
 */
export function cleanDescription(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*-{3,}\s*(\n|$)/)[0]
    .replace(/^\s*\[\d+\]:\s*\S+.*$/gm, "")
    .replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[\d+\]/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 4000);
}

// Subjects that say what a book is ("Science fiction"), not where it's listed:
// awards, bestseller lists, library tags and the like are left out.
const notAGenre = /award|times|bestseller|reviewed|large type|accessible|daisy|library|lending|nyt|manual for/i;

/** Up to three of a work's subjects, short and plain, once each: "Fiction · Science fiction". */
export function pickSubjects(subjects: readonly string[]): string[] {
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const subject of subjects) {
    const text = subject.trim();
    const key = text.toLowerCase().replace(/[-\s]+/g, " ");
    if (!text || text.length > 24 || /[:=(),/]/.test(text) || notAGenre.test(text) || seen.has(key)) continue;
    seen.add(key);
    picked.push(text[0].toUpperCase() + text.slice(1));
    if (picked.length === 3) break;
  }
  return picked;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000), next: { revalidate: 86400 } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Catalogue unavailable");
  return response.json();
}

/**
 * A catalogue book's page: its work's record (followed once if it was merged
 * into another) for the description and subjects, and its search entry for
 * the authors' names, the cover, the page count and the year. Null for a work
 * Open Library doesn't have. Its catalogId stays the one asked for, the one on
 * the user's shelves.
 */
export async function fetchCatalogWork(catalogId: string): Promise<CatalogBookDetail | null> {
  let id = catalogId;
  let work = workResponse.safeParse(await getJson(`https://openlibrary.org/works/${id}.json`));
  const moved = work.success && work.data.type?.key === "/type/redirect" ? work.data.location : undefined;
  if (moved && /^\/works\/OL\d+W$/.test(moved)) {
    id = moved.slice("/works/".length);
    work = workResponse.safeParse(await getJson(`https://openlibrary.org/works/${id}.json`));
  }
  if (!work.success || !work.data.title?.trim()) return null;
  const params = new URLSearchParams({
    q: `key:/works/${id}`,
    limit: "1",
    fields: "key,title,author_name,cover_i,number_of_pages_median,first_publish_year,subject",
  });
  const searched = catalogResponse.safeParse(await getJson(`https://openlibrary.org/search.json?${params}`));
  const found = searched.success ? searched.data.docs[0] : undefined;
  const { description, covers = [], subjects = [] } = work.data;
  return {
    catalogId,
    title: work.data.title.trim().slice(0, 300),
    author: (found?.author_name ?? []).join(", ").slice(0, 500),
    coverId:
      found?.cover_i ?? covers.find((cover) => Number.isInteger(cover) && cover > 0 && cover <= 2147483647) ?? null,
    totalPages: found?.number_of_pages_median ?? null,
    year: found?.first_publish_year ?? null,
    description: description ? cleanDescription(typeof description === "string" ? description : description.value) : "",
    subjects: pickSubjects(subjects.length ? subjects : (found?.subject ?? [])),
  };
}

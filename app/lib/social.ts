import "server-only";
import { z } from "./zod";
import { query } from "./db";
import { apiRoute, HttpError, type ApiContext } from "./http";
import { showsRequestLimit } from "./rate-limit";
import { isUuid } from "./schemas";
import { avatarUrlSql } from "./users";
import { bothPlanned, sharedLibrary } from "./shows";
import { listBooks } from "./books";
import { bookStats, type Person, type SocialProfile } from "./social-types";

export function socialRoute<Schema extends z.ZodType = z.ZodType<Record<string, never>>>(
  options: { body?: Schema; status?: number },
  handler: (context: ApiContext<z.output<Schema>>) => Promise<unknown>,
) {
  return apiRoute<Schema>({ ...options, label: "Social", limit: showsRequestLimit }, handler);
}

export async function socialPerson(viewerId: string, targetId: string): Promise<Person> {
  if (!isUuid(targetId)) throw new HttpError("Profile not found.", 404);
  const {
    rows: [person],
  } = await query<Person>(
    `SELECT u.id, u.username, u.name, ${avatarUrlSql("u")} AS "avatarUrl" FROM users u
     WHERE u.id = $2 AND (u.id = $1 OR EXISTS (
       SELECT 1 FROM friendships f WHERE f.status = 'accepted'
       AND ((f.user_id = $1 AND f.friend_id = u.id) OR (f.friend_id = $1 AND f.user_id = u.id))))`,
    [viewerId, targetId],
  );
  if (!person) throw new HttpError("Profile not found.", 404);
  return person;
}

export async function readSocialProfile(viewerId: string, targetId = viewerId): Promise<SocialProfile> {
  const person = await socialPerson(viewerId, targetId);
  const [shows, books, planned] = await Promise.all([
    sharedLibrary(person.id, true),
    listBooks(person.id),
    person.id === viewerId ? Promise.resolve([]) : bothPlanned(viewerId, person.id),
  ]);
  return {
    ...person,
    shows,
    books: {
      stats: bookStats(books),
      items: books.map(({ id, catalogId, title, author, coverId, totalPages, pagesRead, shelf }) => ({
        id,
        catalogId,
        title,
        author,
        coverId,
        totalPages,
        pagesRead,
        shelf,
      })),
    },
    bothPlanned: planned,
  };
}

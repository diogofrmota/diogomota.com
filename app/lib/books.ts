import "server-only";
import { query, transaction } from "./db";
import { recordActivity } from "./activity";
import { HttpError } from "./http";
import { isUuid } from "./schemas";
import { normalizeProgress, type Book, type BookInput } from "./book-types";

const columns = `id, catalog_id AS "catalogId", title, author, cover_id AS "coverId",
  total_pages AS "totalPages", pages_read AS "pagesRead", shelf,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

export async function listBooks(userId: string): Promise<Book[]> {
  return (await query<Book>(`SELECT ${columns} FROM books WHERE user_id = $1 ORDER BY updated_at DESC, id`, [userId]))
    .rows;
}

export async function saveBook(userId: string, input: BookInput, id?: string): Promise<Book> {
  if (id && !isUuid(id)) throw new HttpError("Book not found.", 404);
  const book = normalizeProgress(input);
  const values = [
    userId,
    book.catalogId,
    book.title,
    book.author,
    book.coverId,
    book.totalPages,
    book.pagesRead,
    book.shelf,
  ];
  try {
    return await transaction(async (db) => {
      const previous = id
        ? (
            await db.query<{ shelf: BookInput["shelf"] }>(
              "SELECT shelf FROM books WHERE user_id=$1 AND id=$2 FOR UPDATE",
              [userId, id],
            )
          ).rows[0]
        : null;
      if (id && !previous) throw new HttpError("Book not found.", 404);
      const result = id
        ? await db.query<Book>(
            `UPDATE books SET catalog_id=$2, title=$3, author=$4, cover_id=$5,
          total_pages=$6, pages_read=$7, shelf=$8, updated_at=now()
          WHERE user_id=$1 AND id=$9 RETURNING ${columns}`,
            [...values, id],
          )
        : await db.query<Book>(
            `INSERT INTO books (user_id, catalog_id, title, author, cover_id, total_pages, pages_read, shelf)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${columns}`,
            values,
          );
      if (!result.rows[0]) throw new HttpError("Book not found.", 404);
      const saved = result.rows[0];
      if (!previous || previous.shelf !== saved.shelf) {
        const kinds = {
          "want-to-read": "book-planned",
          "currently-reading": "book-reading",
          finished: "book-finished",
        } as const;
        await recordActivity(db, {
          userId,
          bookId: saved.id,
          kind: kinds[saved.shelf],
          key: `book:${saved.id}`,
          data: { title: saved.title },
        });
      }
      return saved;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      throw new HttpError("This book is already on your shelves.", 409);
    throw error;
  }
}

export async function deleteBook(userId: string, id: string) {
  if (!isUuid(id)) throw new HttpError("Book not found.", 404);
  const result = await query("DELETE FROM books WHERE user_id=$1 AND id=$2 RETURNING id", [userId, id]);
  if (!result.rowCount) throw new HttpError("Book not found.", 404);
}

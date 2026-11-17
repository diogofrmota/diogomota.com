import { apiRoute } from "@/lib/http";
import { bookInput } from "@/lib/book-types";
import { deleteBook, saveBook } from "@/lib/books";
import { booksRequestLimit } from "@/lib/rate-limit";

export const PATCH = apiRoute(
  { label: "Saving a book", body: bookInput, limit: booksRequestLimit },
  ({ user, body, params }) => saveBook(user.id, body, params.id),
);
export const DELETE = apiRoute({ label: "Removing a book", limit: booksRequestLimit }, ({ user, params }) =>
  deleteBook(user.id, params.id),
);

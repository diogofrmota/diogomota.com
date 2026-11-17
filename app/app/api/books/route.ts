import { apiRoute } from "@/lib/http";
import { bookInput } from "@/lib/book-types";
import { listBooks, saveBook } from "@/lib/books";
import { booksRequestLimit } from "@/lib/rate-limit";

export const GET = apiRoute({ label: "Loading books", limit: booksRequestLimit }, ({ user }) => listBooks(user.id));
export const POST = apiRoute(
  { label: "Adding a book", body: bookInput, status: 201, limit: booksRequestLimit },
  ({ user, body }) => saveBook(user.id, body),
);

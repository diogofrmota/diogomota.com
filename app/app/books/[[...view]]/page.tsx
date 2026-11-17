import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { BooksApp } from "@/components/books/BooksApp";
import { appViewport } from "@/lib/apps";
import { booksViews, viewFromParams } from "@/lib/app-views";
import { findUserById } from "@/lib/users";

export const metadata: Metadata = { title: "Books", robots: { index: false } };
export const viewport = appViewport;

export default async function BooksPage({ params, searchParams }: PageProps<"/books/[[...view]]">) {
  const [{ view }, { p }] = await Promise.all([params, searchParams]);
  const initial = viewFromParams(booksViews, view, p);
  if (!initial) notFound();
  const { id } = await requireUser(view ? `/books/${view.join("/")}` : "/books");
  const user = await findUserById(id);
  if (!user) notFound();
  return (
    <BooksApp
      user={{ id, username: user.username, avatarUrl: user.avatarUrl }}
      theme={user.themePreference}
      initial={initial}
      version={process.env.APP_VERSION ?? "dev"}
    />
  );
}

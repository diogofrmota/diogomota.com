import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { RecipesApp } from "@/components/recipes/RecipesApp";
import { appViewport } from "@/lib/apps";
import { recipesViews, viewFromParams } from "@/lib/app-views";
import { findUserById } from "@/lib/users";

// The Recipes app. proxy.ts keeps logged-out users out.
export const metadata: Metadata = { title: "Recipes", robots: { index: false } };

export const viewport = appViewport;

// /recipes, /recipes/favourites, /recipes/shopping, with the open panels in ?p=
// (hooks/useAppView.ts): the server renders the view and panels of the URL.
export default async function RecipesPage({ params, searchParams }: PageProps<"/recipes/[[...view]]">) {
  const [{ view }, { p }] = await Promise.all([params, searchParams]);
  const initial = viewFromParams(recipesViews, view, p);
  if (!initial) notFound();
  const { id } = await requireUser(view ? `/recipes/${view.join("/")}` : "/recipes");
  const user = await findUserById(id);
  if (!user) notFound();
  return (
    <RecipesApp
      user={{ id, username: user.username, avatarUrl: user.avatarUrl }}
      theme={user.themePreference}
      initial={initial}
      version={process.env.APP_VERSION ?? "dev"}
    />
  );
}

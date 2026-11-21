import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { RecipesApp } from "@/components/recipes/RecipesApp";
import { GroupWelcomePage } from "@/components/shared/GroupWelcomePage";
import { appViewport } from "@/lib/apps";
import { recipesViews, viewFromParams } from "@/lib/app-views";
import { readSpace } from "@/lib/spaces";
import { findUserById } from "@/lib/users";

// The Recipes app, the group's (For Couples, docs/decisions/0023). proxy.ts keeps logged-out users out.
export const metadata: Metadata = { title: "Recipes", robots: { index: false } };

export const viewport = appViewport;

// /recipes, /recipes/favourites, /recipes/shopping, with the open panels in ?p=
// (hooks/useAppView.ts): the server renders the view and panels of the URL.
// Without a group, creating or joining one: outside the app's data, so the
// changes waiting in this browser for the connection wait until then too.
export default async function RecipesPage({ params, searchParams }: PageProps<"/recipes/[[...view]]">) {
  const [{ view }, { p }] = await Promise.all([params, searchParams]);
  const initial = viewFromParams(recipesViews, view, p);
  if (!initial) notFound();
  const { id } = await requireUser(view ? `/recipes/${view.join("/")}` : "/recipes");
  const [user, space] = await Promise.all([findUserById(id), readSpace(id)]);
  if (!user) notFound();
  if (!space)
    return (
      <GroupWelcomePage
        appName="Recipes"
        username={user.username}
        avatarUrl={user.avatarUrl}
        theme={user.themePreference}
      />
    );
  return (
    <RecipesApp
      user={{ id, username: user.username, avatarUrl: user.avatarUrl }}
      theme={user.themePreference}
      initial={initial}
      version={process.env.APP_VERSION ?? "dev"}
    />
  );
}

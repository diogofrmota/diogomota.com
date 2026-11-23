"use client";
import { useMemo } from "react";
import { AppShell } from "@/components/common/AppShell";
import { BasketIcon, BookIcon, HeartIcon } from "@/components/common/icons";
import { OpenAfterCloseProvider, useOpenQueuedPanel } from "@/components/common/OpenAfterClose";
import { QueryProvider } from "@/components/common/QueryProvider";
import { UndoToast } from "@/components/common/Undo";
import { useAppView } from "@/hooks/useAppView";
import type { AppViewState } from "@/lib/app-views";
import type { Theme } from "@/lib/themes";
import { photoUndoId, RecipeDialog } from "./RecipeDialog";
import { RecipeForm } from "./RecipeForm";
import { RecipeList } from "./RecipeList";
import { RecipesProvider, setupRecipes, useRecipes } from "./recipes-data";
import { ShoppingList } from "./ShoppingList";

// The panels, in the URL (hooks/useAppView.ts): a recipe's page
// (recipe:<id>), its form over it (edit:<id>), and a new recipe's form (new).
// A new recipe's page opens once its form has closed (useOpenAfterClose).

function Panels() {
  const { panels } = useAppView();
  const { undo } = useRecipes();
  useOpenQueuedPanel();
  const recipe = panels.find((panel) => panel.startsWith("recipe:"))?.slice(7);
  const top = panels.at(-1);
  const edit = top?.startsWith("edit:") ? top.slice(5) : null;
  // A photo's Undo is in its recipe's page while that is open (behind the modal, the page's can't be reached).
  const photoUndoInPage = !!recipe && !!undo.pending?.id?.startsWith(photoUndoId(""));
  return (
    <>
      {recipe && <RecipeDialog key={`recipe:${recipe}`} id={recipe} />}
      {top === "new" && <RecipeForm key="new" />}
      {edit && <RecipeForm key={`edit:${edit}`} id={edit} />}
      {!photoUndoInPage && <UndoToast undo={undo} />}
    </>
  );
}

// Recipes (all of them), Favourites and Shopping list, as tabs. The view and
// its open panels are in the URL: /recipes?p=recipe:<id>.
export function RecipesApp({
  user,
  theme,
  initial,
  version,
}: {
  user: { id: string; username: string; avatarUrl: string | null };
  theme: Theme;
  initial: AppViewState;
  version: string;
}) {
  const tabs = useMemo(
    () => [
      { id: "recipes", label: "Recipes", icon: <BookIcon />, view: <RecipeList /> },
      { id: "favourites", label: "Favourites", icon: <HeartIcon />, view: <RecipeList favourites /> },
      { id: "shopping", label: "Shopping", icon: <BasketIcon />, view: <ShoppingList /> },
    ],
    [],
  );
  return (
    <QueryProvider app="recipes" userId={user.id} version={version} setup={setupRecipes}>
      <RecipesProvider>
        <OpenAfterCloseProvider>
          <AppShell
            name="Recipes"
            basePath="/recipes"
            initial={initial}
            username={user.username}
            avatarUrl={user.avatarUrl}
            theme={theme}
            tabs={tabs}
          >
            <Panels />
          </AppShell>
        </OpenAfterCloseProvider>
      </RecipesProvider>
    </QueryProvider>
  );
}

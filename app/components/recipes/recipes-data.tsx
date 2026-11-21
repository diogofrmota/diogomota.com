"use client";
import { useMutation, useMutationState, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useUndo } from "@/components/common/Undo";
import { apiRequest, ApiError } from "@/lib/api-request";
import type { Recipe, RecipeChange, RecipeFields, ShoppingItem } from "@/lib/recipe-types";

// The Recipes app's data for the whole app (RecipesApp): the user's recipes and
// shopping list, loaded with the app, again when the page is shown again, and
// kept in this browser for offline use (components/common/QueryProvider).
//
// Changes show at once: what is shown is the last state the server sent with
// the changes not yet confirmed (those waiting for the connection too) applied
// on top. Each change is plain data, sent one at a time in the order made
// (one scope: a recipe is created before its ingredients go on the list), and
// can wait in this browser for the connection, even across a reload. Photos
// need the connection: they are sent at once, and say so when they can't be.

/** Calls /api/recipes{path} and returns its data, or throws an ApiError with its message. */
export function recipesRequest<T>(
  path: string,
  options: { method?: string; body?: object | FormData; signal?: AbortSignal } = {},
): Promise<T> {
  return apiRequest<T>(`/api/recipes${path}`, { ...options, fallback: "Something went wrong. Try again." });
}

export const recipesKey = ["recipes", "/"] as const;
export const shoppingKey = ["recipes", "/shopping"] as const;
const changeKey = ["recipes", "change"] as const;
const scope = { id: "recipes" };

/** A new recipe as the form makes it: its fields, and the id and time it was made on this device. */
export type NewRecipe = RecipeFields & { id: string; createdAt: string };

// A change, as plain data: it can wait in this browser for the connection and
// be sent after a reload. Each is safe to send twice (the server answers a
// create with an id it has with what is there, and a delete of what's gone is
// no matter).
type Change =
  | { kind: "create"; recipe: NewRecipe }
  | { kind: "update"; id: string; fields: RecipeChange }
  | { kind: "delete"; id: string }
  | { kind: "shop-add"; items: ShoppingItem[] }
  | { kind: "shop-update"; id: string; fields: Partial<Pick<ShoppingItem, "text" | "isChecked">> }
  | { kind: "shop-remove"; ids: string[] };

type Data = { recipes: Recipe[]; shopping: ShoppingItem[] };

/** The recipe a new one is shown as until the server has it. */
const draftRecipe = ({ createdAt, ...recipe }: NewRecipe): Recipe => ({
  ...recipe,
  photos: [],
  createdAt,
  updatedAt: createdAt,
});

// A change applied on screen, before the server has it.
function applyChange({ recipes, shopping }: Data, change: Change): Data {
  switch (change.kind) {
    case "create":
      return {
        recipes: [draftRecipe(change.recipe), ...recipes.filter((r) => r.id !== change.recipe.id)],
        shopping,
      };
    case "update":
      return { recipes: recipes.map((r) => (r.id === change.id ? { ...r, ...change.fields } : r)), shopping };
    case "delete":
      return {
        recipes: recipes.filter((r) => r.id !== change.id),
        shopping: shopping.map((item) => (item.recipeId === change.id ? { ...item, recipeId: null } : item)),
      };
    case "shop-add": {
      const ids = new Set(change.items.map((item) => item.id));
      return { recipes, shopping: [...shopping.filter((item) => !ids.has(item.id)), ...change.items] };
    }
    case "shop-update":
      return {
        recipes,
        shopping: shopping.map((item) => (item.id === change.id ? { ...item, ...change.fields } : item)),
      };
    case "shop-remove": {
      const ids = new Set(change.ids);
      return { recipes, shopping: shopping.filter((item) => !ids.has(item.id)) };
    }
  }
}

// What is gone already is no matter: a delete sent twice, or after another device's.
const unlessGone = (error: unknown) => {
  if (error instanceof ApiError && error.status === 404) return null;
  throw error;
};

function send(change: Change): Promise<unknown> {
  switch (change.kind) {
    case "create":
      return recipesRequest<Recipe>("", { method: "POST", body: change.recipe });
    case "update":
      return recipesRequest<Recipe>(`/${change.id}`, { method: "PATCH", body: change.fields });
    case "delete":
      return recipesRequest<null>(`/${change.id}`, { method: "DELETE" }).catch(unlessGone);
    case "shop-add":
      return recipesRequest<ShoppingItem[]>("/shopping", {
        method: "POST",
        body: { items: change.items.map(({ id, text, recipeId }) => ({ id, text, recipeId })) },
      });
    case "shop-update":
      return recipesRequest<ShoppingItem>(`/shopping/${change.id}`, { method: "PATCH", body: change.fields });
    case "shop-remove":
      return recipesRequest<null>("/shopping/remove", { method: "POST", body: { ids: change.ids } });
  }
}

/** Puts the server's copy of a recipe in what it last sent, keeping the photos known here (they change on their own). */
function keepRecipe(client: QueryClient, recipe: Recipe, keepPhotos: boolean) {
  client.setQueryData<Recipe[]>(recipesKey, (recipes) => {
    if (!recipes) return recipes;
    const known = recipes.find((r) => r.id === recipe.id);
    const merged = keepPhotos && known ? { ...recipe, photos: known.photos } : recipe;
    return known ? recipes.map((r) => (r.id === recipe.id ? merged : r)) : [merged, ...recipes];
  });
}

/**
 * Registers how changes are sent (QueryProvider's setup), so the ones kept from
 * before a reload go out too. Once the server has one, it is put in what it
 * last sent; one it refused is dropped, which undoes it on screen, and both
 * load again after a 404 or 409 (changed on another device meanwhile).
 */
export function setupRecipes(client: QueryClient) {
  client.setMutationDefaults(changeKey, {
    mutationFn: (change: Change) => send(change),
    scope,
    onSuccess: async (data, change) => {
      await client.cancelQueries({ queryKey: ["recipes"] });
      if (change.kind === "create" || change.kind === "update") keepRecipe(client, data as Recipe, true);
      else if (change.kind === "shop-update") {
        const item = data as ShoppingItem;
        client.setQueryData<ShoppingItem[]>(shoppingKey, (items) => items?.map((i) => (i.id === item.id ? item : i)));
      } else if (change.kind === "shop-add") {
        const added = data as ShoppingItem[];
        client.setQueryData<ShoppingItem[]>(
          shoppingKey,
          (items) =>
            items && applyChange({ recipes: [], shopping: items }, { kind: "shop-add", items: added }).shopping,
        );
      } else {
        const recipes = client.getQueryData<Recipe[]>(recipesKey) ?? [];
        const shopping = client.getQueryData<ShoppingItem[]>(shoppingKey) ?? [];
        const next = applyChange({ recipes, shopping }, change);
        client.setQueryData(recipesKey, next.recipes);
        client.setQueryData(shoppingKey, next.shopping);
      }
    },
    onError: (error) => {
      if (error instanceof ApiError && [404, 409].includes(error.status))
        void client.invalidateQueries({ queryKey: ["recipes"] });
    },
  });
}

export type RecipesData = {
  /** The user's recipes, the newest first; null until they have loaded. */
  recipes: Recipe[] | null;
  /** The shopping list, in the order it was added; null until it has loaded. */
  shopping: ShoppingItem[] | null;
  /** Why the last load failed ("" once one works), also while what was kept from before is shown. */
  loadError: string;
  /** Why the last refused change was undone. */
  error: string;
  dismissError: () => void;
  /** Says something went wrong with a photo (they aren't queued). */
  showError: (message: string) => void;
  reload: () => void;
  find: (id: string) => Recipe | undefined;
  /** Whether the server has the recipe (photos can only be added then). */
  isSaved: (id: string) => boolean;
  create: (recipe: NewRecipe) => void;
  update: (id: string, fields: RecipeChange) => void;
  remove: (id: string) => void;
  addToShopping: (items: Omit<ShoppingItem, "isChecked">[]) => void;
  updateShopping: (id: string, fields: Partial<Pick<ShoppingItem, "text" | "isChecked">>) => void;
  removeShopping: (ids: string[]) => void;
  /** Adds a photo to a recipe (the connection is needed); rejects with why it couldn't. */
  addPhoto: (recipeId: string, file: File) => Promise<void>;
  removePhoto: (photoId: string) => Promise<void>;
  makeCover: (photoId: string) => Promise<void>;
  /** Deletes and Clear ticked wait for their Undo (components/common/Undo). */
  undo: ReturnType<typeof useUndo>;
  /** What is waiting for its Undo, hidden meanwhile: recipes', photos' and items' ids. */
  hidden: ReadonlySet<string>;
};

const RecipesContext = createContext<RecipesData | null>(null);

export const AfterCloseContext = createContext<(panel: string) => void>(() => {});

/** Opens `panel` once the top panel has closed: a new recipe's page, in its form's place (RecipesApp). */
export const useOpenAfterClose = () => useContext(AfterCloseContext);

export function useRecipes(): RecipesData {
  const data = useContext(RecipesContext);
  if (!data) throw new Error("useRecipes must be used inside a RecipesProvider");
  return data;
}

export function RecipesProvider({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const recipesQuery = useQuery({
    queryKey: recipesKey,
    queryFn: ({ signal }) => recipesRequest<Recipe[]>("", { signal }),
    meta: { persist: true },
  });
  const shoppingQuery = useQuery({
    queryKey: shoppingKey,
    queryFn: ({ signal }) => recipesRequest<ShoppingItem[]>("/shopping", { signal }),
    meta: { persist: true },
  });
  // Out of the group (left it in another tab): the page again from the server,
  // which offers creating or joining one instead (app/recipes).
  const router = useRouter();
  const outOfGroup = [recipesQuery.error, shoppingQuery.error].some(
    (error) => error instanceof ApiError && error.status === 403,
  );
  useEffect(() => {
    if (outOfGroup) router.refresh();
  }, [outOfGroup, router]);
  const pending = useMutationState({
    filters: { mutationKey: changeKey, status: "pending" },
    select: (mutation) => mutation.state.variables as Change,
  });
  const refused = useMutationState({
    filters: { mutationKey: changeKey, status: "error" },
    select: (mutation) => ({
      at: mutation.state.submittedAt,
      message: (mutation.state.error as Error | null)?.message,
    }),
  }).at(-1);
  const [dismissedAt, setDismissedAt] = useState(0);
  const [photoError, setPhotoError] = useState<{ at: number; message: string } | null>(null);
  const changeError = refused && refused.at >= dismissedAt ? `${refused.message} Your change was undone.` : "";
  const error = photoError && photoError.at >= dismissedAt ? photoError.message : changeError;
  const { mutate } = useMutation<unknown, Error, Change>({ mutationKey: changeKey });
  const undo = useUndo();

  const shown = useMemo(() => {
    if (!recipesQuery.data || !shoppingQuery.data) {
      // One has loaded and the other not (yet): each shown on its own.
      const recipes = recipesQuery.data && pending.reduce(applyChange, { recipes: recipesQuery.data, shopping: [] });
      const shopping = shoppingQuery.data && pending.reduce(applyChange, { recipes: [], shopping: shoppingQuery.data });
      return { recipes: recipes?.recipes ?? null, shopping: shopping?.shopping ?? null };
    }
    return pending.reduce(applyChange, { recipes: recipesQuery.data, shopping: shoppingQuery.data });
  }, [recipesQuery.data, shoppingQuery.data, pending]);

  const hiddenKey = undo.pending?.id ?? "";
  const hidden = useMemo(() => new Set(hiddenKey.split(" ").filter(Boolean)), [hiddenKey]);
  const creating = useMemo(
    () => new Set(pending.flatMap((change) => (change.kind === "create" ? [change.recipe.id] : []))),
    [pending],
  );

  const data = useMemo<RecipesData>(() => {
    const change = (next: Change) => {
      setDismissedAt(Date.now());
      mutate(next);
    };
    // Photos: sent at once, and their answer (the recipe) put in what the server last sent.
    const photoRequest = async (request: () => Promise<Recipe>) => {
      setDismissedAt(Date.now());
      try {
        keepRecipe(client, await request(), false);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) void client.invalidateQueries({ queryKey: recipesKey });
        throw err;
      }
    };
    return {
      recipes: shown.recipes,
      shopping: shown.shopping,
      loadError: recipesQuery.error?.message ?? shoppingQuery.error?.message ?? "",
      error,
      dismissError: () => setDismissedAt(Date.now()),
      showError: (message) => setPhotoError({ at: Date.now(), message }),
      reload: () => void client.invalidateQueries({ queryKey: ["recipes"] }),
      find: (id) => shown.recipes?.find((recipe) => recipe.id === id),
      isSaved: (id) => !creating.has(id) && !!recipesQuery.data?.some((recipe) => recipe.id === id),
      create: (recipe) => change({ kind: "create", recipe }),
      update: (id, fields) => change({ kind: "update", id, fields }),
      remove: (id) => change({ kind: "delete", id }),
      addToShopping: (items) =>
        change({ kind: "shop-add", items: items.map((item) => ({ ...item, isChecked: false })) }),
      updateShopping: (id, fields) => change({ kind: "shop-update", id, fields }),
      removeShopping: (ids) => change({ kind: "shop-remove", ids }),
      addPhoto: (recipeId, file) => {
        const form = new FormData();
        form.append("photo", file);
        return photoRequest(() => recipesRequest<Recipe>(`/${recipeId}/photos`, { method: "POST", body: form }));
      },
      removePhoto: (photoId) => photoRequest(() => recipesRequest<Recipe>(`/photos/${photoId}`, { method: "DELETE" })),
      makeCover: (photoId) =>
        photoRequest(() => recipesRequest<Recipe>(`/photos/${photoId}/cover`, { method: "POST", body: {} })),
      undo,
      hidden,
    };
  }, [
    shown,
    recipesQuery.data,
    recipesQuery.error,
    shoppingQuery.error,
    error,
    client,
    creating,
    mutate,
    undo,
    hidden,
  ]);

  return <RecipesContext value={data}>{children}</RecipesContext>;
}

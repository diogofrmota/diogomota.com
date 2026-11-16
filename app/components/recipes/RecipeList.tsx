"use client";
import Image from "next/image";
import { useState } from "react";
import { BookIcon, ChevronDownIcon, HeartIcon, PlusIcon, SearchIcon } from "@/components/common/icons";
import { stagger, successPulse, useSettled } from "@/components/common/motion";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { useAppView } from "@/hooks/useAppView";
import {
  allTags,
  countOf,
  fold,
  hasTag,
  matchesSearch,
  photoSrc,
  sortRecipes,
  type Recipe,
  type RecipeSort,
} from "@/lib/recipe-types";
import { useRecipes } from "./recipes-data";
import styles from "./Recipes.module.css";

/** The last refused change (or photo), with a button to dismiss it. */
export function ChangeError() {
  const { error, dismissError } = useRecipes();
  if (!error) return null;
  return (
    <Alert className={styles.viewError} onDismiss={dismissError}>
      {error}
    </Alert>
  );
}

/** A recipe's card: its cover (or a book), its title and tags, and its heart, which makes it a favourite in a tap. */
function RecipeCard({ recipe, index, settled }: { recipe: Recipe; index: number; settled: boolean }) {
  const { openPanel } = useAppView();
  const { update } = useRecipes();
  const cover = recipe.photos[0];
  return (
    <li className={styles.cardItem} style={stagger(index, settled)}>
      <button type="button" className={styles.card} onClick={() => openPanel(`recipe:${recipe.id}`)}>
        <span className={styles.cover}>
          {cover ? (
            <Image
              src={photoSrc(cover, "thumb")}
              alt=""
              fill
              sizes="(min-width: 48rem) 16rem, 50vw"
              unoptimized
              // The first rows are on the screen as it opens.
              loading={index < 8 ? "eager" : "lazy"}
            />
          ) : (
            <span className={styles.coverEmpty} aria-hidden="true">
              <BookIcon />
            </span>
          )}
        </span>
        <span className={styles.cardTitle}>{recipe.title}</span>
        {recipe.tags.length > 0 && <span className={styles.cardTags}>{recipe.tags.join(" · ")}</span>}
      </button>
      <button
        type="button"
        className={styles.cardHeart}
        aria-label={`Favourite ${recipe.title}`}
        aria-pressed={recipe.isFavourite}
        onClick={(event) => {
          if (!recipe.isFavourite) successPulse(event.currentTarget);
          update(recipe.id, { isFavourite: !recipe.isFavourite });
        }}
      >
        <HeartIcon filled={recipe.isFavourite} />
      </button>
    </li>
  );
}

/** Grey cards while the recipes load for the first time. */
function Skeleton() {
  return (
    <ul className={styles.grid} aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className={styles.cardItem}>
          <span className={styles.card}>
            <span className={`${styles.cover} ${styles.skeleton}`} />
            <span className={`${styles.skeletonLine} ${styles.skeleton}`} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** No recipes yet: what the app is for, and Add your first recipe. */
function Welcome() {
  const { openPanel } = useAppView();
  return (
    <div className={styles.welcome}>
      <h2>Your recipes, in one place</h2>
      <p>
        Keep the recipes you want to cook again: their ingredients, steps, photos and where you found them. Scale them
        to how many you&rsquo;re cooking for, and make your shopping list from them.
      </p>
      <Button variant="primary" onClick={() => openPanel("new")}>
        <PlusIcon />
        Add your first recipe
      </Button>
    </div>
  );
}

/**
 * Recipes, or with `favourites` only the favourite ones: a search (title,
 * tags, ingredients and notes), a sort, the tags as chips to pick one, and the
 * recipes' cards. A recipe opens its page (recipe:<id>); New recipe its form.
 */
export function RecipeList({ favourites = false }: { favourites?: boolean }) {
  const { recipes, loadError, reload, hidden } = useRecipes();
  const { openPanel, setView } = useAppView();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<RecipeSort>("newest");
  const settled = useSettled(!!recipes);

  const shown = recipes?.filter((recipe) => !hidden.has(recipe.id) && (!favourites || recipe.isFavourite)) ?? null;
  const tags = shown ? allTags(shown) : [];
  // A tag no recipe here has any more (its last one deleted) isn't picked.
  const picked = tag && tags.some((t) => fold(t) === fold(tag)) ? tag : null;
  const matching = shown?.filter((recipe) => (!picked || hasTag(recipe, picked)) && matchesSearch(recipe, search));
  const sorted = matching && sortRecipes(matching, sort);
  const name = favourites ? "Favourites" : "Recipes";

  return (
    <div className={styles.view}>
      {/* The tab shows which view this is. */}
      <h1 className={ui.srOnly}>{name}</h1>
      <ChangeError />
      {loadError && <Alert onRetry={reload}>{loadError}</Alert>}
      {!shown ? (
        !loadError && <Skeleton />
      ) : shown.length === 0 && favourites ? (
        <div className={styles.welcome}>
          <h2>No favourites yet</h2>
          <p>Tap the heart on a recipe to keep it here, a tap away.</p>
          <Button onClick={() => setView("recipes")}>Go to your recipes</Button>
        </div>
      ) : shown.length === 0 ? (
        <Welcome />
      ) : (
        <>
          <div className={styles.toolbar}>
            <label className={styles.search}>
              <span className={ui.srOnly}>Search {favourites ? "your favourites" : "your recipes"}</span>
              <SearchIcon />
              <input
                type="search"
                value={search}
                placeholder={favourites ? "Search your favourites" : "Search recipes or ingredients"}
                autoComplete="off"
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label className={styles.sort}>
              <span className={ui.srOnly}>Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as RecipeSort)}>
                <option value="newest">Newest</option>
                <option value="az">A–Z</option>
              </select>
              <ChevronDownIcon />
            </label>
            {!favourites && (
              <Button variant="primary" className={styles.newRecipe} onClick={() => openPanel("new")}>
                <PlusIcon />
                New recipe
              </Button>
            )}
          </div>
          {tags.length > 0 && (
            <div className={styles.tagChips} role="group" aria-label="Tags">
              <button type="button" aria-pressed={!picked} onClick={() => setTag(null)}>
                All
              </button>
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={picked === t}
                  onClick={() => setTag(picked === t ? null : t)}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <p className={styles.count} aria-live="polite">
            {sorted!.length === shown.length
              ? countOf(shown.length, favourites ? "favourite" : "recipe")
              : `${sorted!.length} of ${countOf(shown.length, favourites ? "favourite" : "recipe")}`}
          </p>
          {sorted!.length ? (
            <ul className={styles.grid} aria-label={name}>
              {sorted!.map((recipe, i) => (
                <RecipeCard key={recipe.id} recipe={recipe} index={i} settled={settled} />
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>
              No {favourites ? "favourites" : "recipes"} match
              {search.trim() ? ` “${search.trim()}”` : ""}
              {picked ? ` in ${picked}` : ""}.{" "}
              <button
                type="button"
                className={styles.inlineLink}
                onClick={() => {
                  setSearch("");
                  setTag(null);
                }}
              >
                Show them all
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}

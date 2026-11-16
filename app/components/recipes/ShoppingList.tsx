"use client";
import { useId, useState, type FormEvent } from "react";
import { BookIcon, PlusIcon, TrashIcon } from "@/components/common/icons";
import { stagger, useSettled } from "@/components/common/motion";
import { Alert, Button, SrOnly } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { useAppView } from "@/hooks/useAppView";
import { countOf, recipeLimits, type ShoppingItem } from "@/lib/recipe-types";
import { useRecipes } from "./recipes-data";
import { ChangeError } from "./RecipeList";
import styles from "./Recipes.module.css";

/** A line of the list: ticked off with its box; the recipe it's from, which opens it; and a bin. */
function Item({ item, index, settled }: { item: ShoppingItem; index: number; settled: boolean }) {
  const { recipes, updateShopping, removeShopping, undo } = useRecipes();
  const { openPanel } = useAppView();
  const from = item.recipeId ? recipes?.find((recipe) => recipe.id === item.recipeId) : undefined;
  return (
    <li className={styles.item} data-checked={item.isChecked || undefined} style={stagger(index, settled)}>
      <label className={styles.itemLabel}>
        <input
          type="checkbox"
          checked={item.isChecked}
          onChange={(e) => updateShopping(item.id, { isChecked: e.target.checked })}
        />
        <span className={styles.itemText}>{item.text}</span>
      </label>
      {from && (
        <button type="button" className={styles.fromRecipe} onClick={() => openPanel(`recipe:${from.id}`)}>
          <span className={styles.fromPill}>
            <BookIcon />
            <SrOnly>From </SrOnly>
            <span className={styles.fromTitle}>{from.title}</span>
          </span>
        </button>
      )}
      <button
        type="button"
        className={styles.itemDelete}
        aria-label={`Delete ${item.text}`}
        onClick={() =>
          undo.schedule({ label: `Deleted “${item.text}”`, id: item.id, commit: () => removeShopping([item.id]) })
        }
      >
        <TrashIcon />
      </button>
    </li>
  );
}

/**
 * The shopping list: Add an item at the top, then what is still to buy, in the
 * order it was added, and what is ticked off under it, with Clear ticked. Lines
 * come from here or from a recipe's ingredients (its page, Add to shopping
 * list), and say which recipe. Delete and Clear ticked wait for their Undo.
 */
export function ShoppingList() {
  const { shopping, loadError, reload, hidden, addToShopping, removeShopping, undo } = useRecipes();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const input = useId();
  const items = shopping?.filter((item) => !hidden.has(item.id)) ?? null;
  const toBuy = items?.filter((item) => !item.isChecked) ?? [];
  const ticked = items?.filter((item) => item.isChecked) ?? [];
  const settled = useSettled(!!items);

  function add(e: FormEvent) {
    e.preventDefault();
    const line = text.replace(/\s+/g, " ").trim();
    if (!line) return;
    if ((items?.length ?? 0) >= recipeLimits.shoppingItems) {
      setError(`The shopping list can have up to ${recipeLimits.shoppingItems} items. Clear the ticked ones first.`);
      return;
    }
    setError("");
    addToShopping([{ id: crypto.randomUUID(), text: line, recipeId: null }]);
    setText("");
  }

  return (
    <div className={`${styles.view} ${styles.shopping}`}>
      <h1 className={ui.srOnly}>Shopping list</h1>
      <ChangeError />
      {loadError && <Alert onRetry={reload}>{loadError}</Alert>}
      <section className={styles.list} aria-labelledby={`${input}-heading`}>
        <h2 id={`${input}-heading`} className={styles.listHeading}>
          To buy <span className={styles.listCount}>({toBuy.length})</span>
        </h2>
        <form className={styles.addItem} onSubmit={add}>
          <label htmlFor={input} className={ui.srOnly}>
            Add an item
          </label>
          <input
            id={input}
            value={text}
            placeholder="Add an item"
            maxLength={recipeLimits.shoppingText}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" variant="primary" disabled={!text.trim() || !items}>
            <PlusIcon />
            Add
          </Button>
        </form>
        {error && <Alert onDismiss={() => setError("")}>{error}</Alert>}
        {!items ? null : toBuy.length ? (
          <ul className={styles.items} aria-label="To buy">
            {toBuy.map((item, i) => (
              <Item key={item.id} item={item} index={i} settled={settled} />
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>
            {ticked.length
              ? "All bought."
              : "Nothing to buy yet. Add what you need here, or a recipe's ingredients from its page."}
          </p>
        )}
      </section>
      {ticked.length > 0 && (
        <section className={styles.list} aria-labelledby={`${input}-ticked`}>
          <div className={styles.listHeader}>
            <h2 id={`${input}-ticked`} className={styles.listHeading}>
              Ticked off <span className={styles.listCount}>({ticked.length})</span>
            </h2>
            <Button
              onClick={() =>
                undo.schedule({
                  label: `Cleared ${countOf(ticked.length, "ticked item")}`,
                  id: ticked.map((item) => item.id).join(" "),
                  commit: () => removeShopping(ticked.map((item) => item.id)),
                })
              }
            >
              Clear ticked
            </Button>
          </div>
          <ul className={styles.items} aria-label="Ticked off">
            {ticked.map((item, i) => (
              <Item key={item.id} item={item} index={i} settled={settled} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

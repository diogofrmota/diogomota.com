"use client";
import Image from "next/image";
import { useId, useRef, useState } from "react";
import {
  BasketIcon,
  ExternalIcon,
  HeartIcon,
  MinusIcon,
  PencilIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/common/icons";
import { successPulse } from "@/components/common/motion";
import { InlineSpinner, Spinner } from "@/components/common/Spinner";
import { Alert, Button, Notice, SrOnly } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { useAppView } from "@/hooks/useAppView";
import {
  countOf,
  isHeading,
  photoSrc,
  recipeLimits,
  scaleIngredient,
  servingsFactor,
  sourceHost,
  type Recipe,
} from "@/lib/recipe-types";
import { useRecipes } from "./recipes-data";
import { Sheet } from "./Sheet";
import styles from "./Recipes.module.css";

/** What a photo waiting for its Undo is called, among the ids hidden meanwhile (RecipesApp keeps its message in here). */
export const photoUndoId = (photoId: string) => `photo:${photoId}`;

/**
 * A recipe's photos: the one picked, large (the cover to start with), with
 * Make cover and Remove over it, and all of them as thumbnails under it to pick
 * one, then Add photo. Without any, a place to drop or choose one. Photos need
 * the connection, and the recipe saved on the server first. A photo removed
 * waits for its Undo, which is here (the dialog is modal: the page's Undo
 * message behind it can't be reached until it closes).
 */
function Photos({ recipe }: { recipe: Recipe }) {
  const { addPhoto, removePhoto, makeCover, isSaved, undo, hidden, showError } = useRecipes();
  const photos = recipe.photos.filter((photo) => !hidden.has(photoUndoId(photo.id)));
  const removing = recipe.photos.some((photo) => undo.pending?.id === photoUndoId(photo.id));
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const picked = photos.find((photo) => photo.id === pickedId) ?? photos[0];
  const saved = isSaved(recipe.id);
  const room = recipeLimits.photos - photos.length - uploading;

  async function upload(files: File[]) {
    setError("");
    if (!saved) return;
    const images = files.filter((file) => !file.type || file.type.startsWith("image/")).slice(0, Math.max(0, room));
    if (!images.length) {
      setError(
        files.length && room > 0
          ? "Choose a photo: a JPEG, PNG or WebP."
          : `A recipe can have up to ${recipeLimits.photos} photos.`,
      );
      return;
    }
    for (const file of images) {
      setUploading((n) => n + 1);
      try {
        await addPhoto(recipe.id, file);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const choose = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      multiple
      hidden
      aria-label="Add a photo"
      onChange={(e) => {
        void upload([...(e.target.files ?? [])]);
        e.target.value = "";
      }}
    />
  );
  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      if (!saved || !e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => {
      if (!saved) return;
      e.preventDefault();
      setDragging(false);
      void upload([...e.dataTransfer.files]);
    },
  };
  const notSaved = !saved && (
    <p className={ui.note}>Photos can be added once the recipe is saved, with a connection.</p>
  );
  const failed = error && <Alert onDismiss={() => setError("")}>{error}</Alert>;
  const removed = removing && (
    <div role="status" className={styles.photoRemoved}>
      Photo removed.
      <Button variant="quiet" onClick={undo.undo}>
        Undo
      </Button>
    </div>
  );

  if (!photos.length && !uploading)
    return (
      <div className={styles.photos}>
        {choose}
        <button
          type="button"
          className={styles.dropZone}
          data-dragging={dragging || undefined}
          disabled={!saved}
          onClick={() => input.current?.click()}
          {...dropHandlers}
        >
          <PhotoIcon />
          <span className={styles.dropTitle}>Add a photo</span>
          <span className={styles.dropHint}>Drop one here, or choose it</span>
        </button>
        {removed}
        {notSaved}
        {failed}
      </div>
    );

  return (
    <div className={styles.photos} data-dragging={dragging || undefined} {...dropHandlers}>
      {choose}
      {picked ? (
        <figure className={styles.photo}>
          <a href={photoSrc(picked)} target="_blank" rel="noopener noreferrer" className={styles.photoLink}>
            <Image
              src={photoSrc(picked)}
              alt={`Photo of ${recipe.title}`}
              fill
              sizes="(min-width: 48rem) 56rem, 100vw"
              unoptimized
              loading="eager"
            />
            <SrOnly> (full size, opens in a new tab)</SrOnly>
          </a>
          <figcaption className={styles.photoActions}>
            {picked !== photos[0] && (
              <button type="button" onClick={() => makeCover(picked.id).catch((err: Error) => setError(err.message))}>
                Make cover
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setPickedId(null);
                undo.schedule({
                  label: "Removed a photo",
                  id: photoUndoId(picked.id),
                  commit: () => void removePhoto(picked.id).catch((err: Error) => showError(err.message)),
                });
              }}
            >
              <TrashIcon />
              Remove photo
            </button>
          </figcaption>
        </figure>
      ) : (
        <div className={`${styles.photo} ${styles.skeleton}`} />
      )}
      <ul className={styles.thumbs} aria-label="Photos" data-scrolls-sideways>
        {photos.map((photo, i) => (
          <li key={photo.id}>
            <button
              type="button"
              aria-pressed={photo === picked}
              aria-label={`Photo ${i + 1}${i === 0 ? " (cover)" : ""}`}
              onClick={() => setPickedId(photo.id)}
            >
              <Image src={photoSrc(photo, "thumb")} alt="" fill sizes="5rem" unoptimized loading="eager" />
            </button>
          </li>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <li key={`uploading-${i}`}>
            <span className={styles.thumbUploading} role="status">
              <InlineSpinner />
              <SrOnly>Adding the photo…</SrOnly>
            </span>
          </li>
        ))}
        {room > 0 && (
          <li>
            <button
              type="button"
              className={styles.addThumb}
              disabled={!saved}
              aria-label="Add a photo"
              onClick={() => input.current?.click()}
            >
              <PlusIcon />
            </button>
          </li>
        )}
      </ul>
      {removed}
      {notSaved}
      {failed}
    </div>
  );
}

/** Servings, with − and + (1 to 100): the ingredients are scaled to them. */
function Servings({ value, written, onChange }: { value: number; written: number; onChange: (n: number) => void }) {
  const id = useId();
  return (
    <div className={styles.servings} role="group" aria-labelledby={id}>
      <span id={id}>Servings</span>
      <button type="button" aria-label="Fewer servings" disabled={value <= 1} onClick={() => onChange(value - 1)}>
        <MinusIcon />
      </button>
      <output aria-live="polite">{value}</output>
      <button
        type="button"
        aria-label="More servings"
        disabled={value >= recipeLimits.servings}
        onClick={() => onChange(value + 1)}
      >
        <PlusIcon />
      </button>
      {value !== written && (
        <button type="button" className={styles.reset} onClick={() => onChange(written)}>
          Reset to {written}
        </button>
      )}
    </div>
  );
}

/**
 * The ingredients, scaled to the servings chosen; headings ("For the sauce:")
 * as headings. Add to shopping list ticks them all to start with, to untick
 * what's in the cupboard, then adds the rest to the list.
 */
function Ingredients({ recipe }: { recipe: Recipe }) {
  const { addToShopping } = useRecipes();
  const { setView } = useAppView();
  const [chosen, setChosen] = useState<number | null>(null);
  const servings = chosen ?? recipe.servings;
  const factor = servingsFactor(recipe, servings);
  const lines = recipe.ingredients.map((line) => ({
    line,
    heading: isHeading(line),
    text: scaleIngredient(line, factor),
  }));
  const buyable = lines.flatMap((line, i) => (line.heading ? [] : [i]));
  const [picking, setPicking] = useState<Set<number> | null>(null);
  const [added, setAdded] = useState(0);
  const heading = useId();

  function add() {
    if (!picking) return;
    const items = buyable
      .filter((i) => picking.has(i))
      .map((i) => ({
        id: crypto.randomUUID(),
        text: lines[i].text.slice(0, recipeLimits.shoppingText),
        recipeId: recipe.id,
      }));
    if (items.length) addToShopping(items);
    setAdded(items.length);
    setPicking(null);
  }

  return (
    <section className={styles.ingredients} aria-labelledby={heading}>
      <div className={styles.sectionHeader}>
        <h3 id={heading}>Ingredients</h3>
        <Servings value={servings} written={recipe.servings} onChange={setChosen} />
      </div>
      {!lines.length ? (
        <p className={ui.muted}>No ingredients yet. Edit the recipe to add them.</p>
      ) : picking ? (
        <form
          className={styles.picking}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <p className={ui.muted}>Untick what you have already.</p>
          <ul className={styles.ingredientList}>
            {lines.map(({ heading: isHead, text }, i) =>
              isHead ? (
                <li key={i} className={styles.ingredientHeading}>
                  {text.slice(0, -1)}
                </li>
              ) : (
                <li key={i}>
                  <label className={styles.pick}>
                    <input
                      type="checkbox"
                      checked={picking.has(i)}
                      onChange={(e) => {
                        const next = new Set(picking);
                        if (e.target.checked) next.add(i);
                        else next.delete(i);
                        setPicking(next);
                      }}
                    />
                    {text}
                  </label>
                </li>
              ),
            )}
          </ul>
          <div className={ui.actions}>
            <Button variant="primary" type="submit" disabled={!picking.size}>
              Add {countOf(picking.size, "item")} to the list
            </Button>
            <Button onClick={() => setPicking(null)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <>
          <ul className={styles.ingredientList}>
            {lines.map(({ heading: isHead, text }, i) =>
              isHead ? (
                <li key={i} className={styles.ingredientHeading}>
                  {text.slice(0, -1)}
                </li>
              ) : (
                <li key={i}>{text}</li>
              ),
            )}
          </ul>
          {buyable.length > 0 && (
            <Button
              className={styles.toShopping}
              onClick={() => {
                setAdded(0);
                setPicking(new Set(buyable));
              }}
            >
              <BasketIcon />
              Add to shopping list
            </Button>
          )}
          {added > 0 && (
            <Notice className={styles.added}>
              Added {countOf(added, "item")} to your shopping list.{" "}
              <button type="button" className={styles.inlineLink} onClick={() => setView("shopping")}>
                Open it
              </button>
            </Notice>
          )}
        </>
      )}
    </section>
  );
}

/**
 * A recipe's page (panel recipe:<id>): its photos, title, where it's from, its
 * tags, Favourite and Edit; the ingredients (scaled to the servings chosen,
 * and to the shopping list from there) beside the method; notes; and Delete
 * recipe, which closes it with Undo.
 */
export function RecipeDialog({ id }: { id: string }) {
  const { find, recipes, loadError, update, remove, undo, hidden } = useRecipes();
  const { closePanel, openPanel } = useAppView();
  const recipe = hidden.has(id) ? undefined : find(id);

  if (!recipe)
    return (
      <Sheet title={recipes || loadError ? "Recipe not found" : "Recipe"} onClose={closePanel}>
        {recipes || loadError ? (
          <p className={ui.muted}>{loadError || "It may have been deleted, on this device or another."}</p>
        ) : (
          <Spinner label="Loading the recipe…" />
        )}
      </Sheet>
    );

  const steps = recipe.steps;
  return (
    <Sheet title={recipe.title} onClose={closePanel} wide>
      <Photos recipe={recipe} />
      <div className={styles.recipeTop}>
        <p className={styles.recipeMeta}>
          <span>Serves {recipe.servings}</span>
          {recipe.sourceUrl && (
            <span>
              From{" "}
              <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.source}>
                {sourceHost(recipe.sourceUrl)}
                <ExternalIcon />
                <SrOnly> (opens in a new tab)</SrOnly>
              </a>
            </span>
          )}
        </p>
        {recipe.tags.length > 0 && (
          <ul className={styles.tags} aria-label="Tags">
            {recipe.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        )}
        <div className={ui.actions}>
          <Button
            aria-pressed={recipe.isFavourite}
            className={styles.favourite}
            onClick={(event) => {
              if (!recipe.isFavourite) successPulse(event.currentTarget);
              update(recipe.id, { isFavourite: !recipe.isFavourite });
            }}
          >
            <HeartIcon filled={recipe.isFavourite} />
            Favourite
          </Button>
          <Button onClick={() => openPanel(`edit:${recipe.id}`)}>
            <PencilIcon />
            Edit
          </Button>
        </div>
      </div>
      <div className={styles.columns}>
        {/* Edited to serve another number, its scaling starts again. */}
        <Ingredients key={recipe.servings} recipe={recipe} />
        <section className={styles.method} aria-labelledby={`${id}-method`}>
          <h3 id={`${id}-method`}>Method</h3>
          {steps.length ? (
            <ol className={styles.steps}>
              {steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          ) : (
            <p className={ui.muted}>No steps yet. Edit the recipe to add them.</p>
          )}
        </section>
      </div>
      {recipe.notes && (
        <section className={styles.notes} aria-labelledby={`${id}-notes`}>
          <h3 id={`${id}-notes`}>Notes</h3>
          <p>{recipe.notes}</p>
        </section>
      )}
      <div className={styles.deleteRow}>
        <Button
          variant="remove"
          onClick={() => {
            closePanel();
            undo.schedule({ label: `Deleted “${recipe.title}”`, id: recipe.id, commit: () => remove(recipe.id) });
          }}
        >
          <TrashIcon />
          Delete recipe
        </Button>
      </div>
    </Sheet>
  );
}

"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { CloseIcon, PlusIcon } from "@/components/common/icons";
import { Spinner } from "@/components/common/Spinner";
import { Alert, Button } from "@/components/common/ui";
import ui from "@/components/common/ui.module.css";
import { useAppView } from "@/hooks/useAppView";
import {
  allTags,
  defaultServings,
  fold,
  ingredientsOf,
  normalizeSourceUrl,
  normalizeTag,
  normalizeTags,
  recipeLimits,
  stepsOf,
  type RecipeChange,
  type RecipeFields,
} from "@/lib/recipe-types";
import { useOpenAfterClose, useRecipes } from "./recipes-data";
import { Sheet } from "./Sheet";
import styles from "./Recipes.module.css";

type Field = "title" | "servings" | "ingredients" | "steps" | "source" | "tags";

/**
 * Tags: the recipe's, each with × to take it off; a field to type a new one
 * (Enter or a comma adds it); and the user's other tags, a tap away.
 */
function TagPicker({
  tags,
  known,
  text,
  error,
  onText,
  onChange,
}: {
  tags: string[];
  known: string[];
  text: string;
  error?: string;
  onText: (text: string) => void;
  onChange: (tags: string[]) => void;
}) {
  const id = useId();
  const others = known.filter((tag) => !tags.some((t) => fold(t) === fold(tag)));
  const full = tags.length >= recipeLimits.tags;
  function add() {
    const tag = normalizeTag(text);
    if (tag && !full) onChange(normalizeTags([...tags, tag]));
    onText("");
  }
  return (
    <fieldset className={styles.tagPicker} aria-describedby={error ? `${id}-error` : undefined}>
      <legend>Tags</legend>
      {tags.length > 0 && (
        <ul className={styles.chosenTags}>
          {tags.map((tag) => (
            <li key={tag}>
              <button
                type="button"
                aria-label={`Remove the tag ${tag}`}
                onClick={() => onChange(tags.filter((t) => t !== tag))}
              >
                {tag}
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className={styles.inputRow}>
        <input
          id={`${id}-new`}
          aria-label="New tag"
          aria-invalid={!!error || undefined}
          value={text}
          placeholder={full ? `Up to ${recipeLimits.tags} tags` : "Add a tag, like Dinner"}
          disabled={full}
          maxLength={recipeLimits.tag}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => {
            // A comma ends a tag, as Enter does (several typed or pasted at once).
            const parts = e.target.value.split(",");
            if (parts.length > 1) {
              onChange(normalizeTags([...tags, ...parts.slice(0, -1)]).slice(0, recipeLimits.tags));
              onText(parts.at(-1)!.trimStart());
            } else onText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            add();
          }}
        />
        <Button onClick={add} disabled={!text.trim() || full}>
          Add
        </Button>
      </span>
      {error && (
        <p id={`${id}-error`} className={styles.fieldError}>
          {error}
        </p>
      )}
      {others.length > 0 && !full && (
        <div className={styles.knownTags} role="group" aria-label="Your other tags">
          {others.map((tag) => (
            <button key={tag} type="button" onClick={() => onChange([...tags, tag])}>
              <PlusIcon />
              {tag}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/** A field's error under it, and what ties it to its field for screen readers. */
function useFieldError(errors: Partial<Record<Field, string>>, field: Field) {
  const id = useId();
  const message = errors[field];
  return {
    props: { "aria-invalid": !!message || undefined, "aria-describedby": message ? id : undefined },
    error: message && (
      <p id={id} className={styles.fieldError}>
        {message}
      </p>
    ),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A recipe's form: New recipe (panel "new"), or Edit recipe (edit:<id>) over its
 * page. Title, Ingredients and Method (one a line), Tags, Source link and
 * Notes; Edit also has Serves (a new recipe serves the default, its page
 * scales it). Save checks them as the API does, saves (at once on screen, and
 * when there's a connection on the server), and closes: a new recipe's page
 * then opens, where its photos are added.
 */
export function RecipeForm({ id }: { id?: string }) {
  const { find, recipes, loadError, create, update, hidden } = useRecipes();
  const { closePanel } = useAppView();
  const openAfterClose = useOpenAfterClose();
  const recipe = id && !hidden.has(id) ? find(id) : undefined;
  const [tags, setTags] = useState<string[]>(() => recipe?.tags ?? []);
  const [tagText, setTagText] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const form = useRef<HTMLFormElement>(null);
  const known = allTags(recipes ?? []);
  const title = useFieldError(errors, "title");
  const servings = useFieldError(errors, "servings");
  const ingredients = useFieldError(errors, "ingredients");
  const steps = useFieldError(errors, "steps");
  const source = useFieldError(errors, "source");

  if (id && !recipe)
    return (
      <Sheet title={recipes || loadError ? "Recipe not found" : "Edit recipe"} onClose={closePanel}>
        {recipes || loadError ? (
          <p className={ui.muted}>{loadError || "It may have been deleted, on this device or another."}</p>
        ) : (
          <Spinner label="Loading the recipe…" />
        )}
      </Sheet>
    );

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "");
    const fields: RecipeFields = {
      title: text("title").replace(/\s+/g, " ").trim(),
      servings: recipe ? Number(text("servings")) : defaultServings,
      ingredients: ingredientsOf(text("ingredients")),
      steps: stepsOf(text("steps")),
      notes: text("notes").trim(),
      sourceUrl: normalizeSourceUrl(text("source")) ?? null,
      // A tag typed but not added yet counts too.
      tags: normalizeTags([...tags, tagText]),
      isFavourite: recipe?.isFavourite ?? false,
    };
    const found: Partial<Record<Field, string>> = {};
    if (!fields.title) found.title = "Enter a title.";
    else if (fields.title.length > recipeLimits.title)
      found.title = `Keep the title to ${recipeLimits.title} characters.`;
    if (!Number.isInteger(fields.servings) || fields.servings < 1 || fields.servings > recipeLimits.servings)
      found.servings = `Enter how many it serves, from 1 to ${recipeLimits.servings}.`;
    if (fields.ingredients.length > recipeLimits.ingredients)
      found.ingredients = `A recipe can have up to ${recipeLimits.ingredients} ingredients.`;
    else if (fields.ingredients.some((line) => line.length > recipeLimits.ingredient))
      found.ingredients = `Keep each ingredient to ${recipeLimits.ingredient} characters.`;
    if (fields.steps.length > recipeLimits.steps) found.steps = `A recipe can have up to ${recipeLimits.steps} steps.`;
    else if (fields.steps.some((line) => line.length > recipeLimits.step))
      found.steps = `Keep each step to ${recipeLimits.step.toLocaleString("en")} characters.`;
    if (normalizeSourceUrl(text("source")) === undefined)
      found.source = "Enter a web link, like https://example.com/recipe, or leave it empty.";
    if (fields.tags.length > recipeLimits.tags) found.tags = `A recipe can have up to ${recipeLimits.tags} tags.`;
    else if (fields.tags.some((tag) => tag.length > recipeLimits.tag))
      found.tags = `Keep each tag to ${recipeLimits.tag} characters.`;
    setErrors(found);
    if (Object.keys(found).length) {
      // The first field that needs fixing, to fix it.
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }

    if (recipe) {
      const changed = Object.fromEntries(
        Object.entries(fields).filter(([key, value]) => !same(recipe[key as keyof RecipeFields], value)),
      ) as RecipeChange;
      if (Object.keys(changed).length) update(recipe.id, changed);
    } else {
      const newId = crypto.randomUUID();
      create({ ...fields, id: newId, createdAt: new Date().toISOString() });
      openAfterClose(`recipe:${newId}`);
    }
    closePanel();
  }

  const failed = Object.keys(errors).length > 0;
  return (
    <Sheet title={recipe ? "Edit recipe" : "New recipe"} onClose={closePanel}>
      <form ref={form} className={styles.form} onSubmit={save} noValidate>
        {failed && <Alert>Check the fields marked below.</Alert>}
        <div className={recipe ? styles.titleRow : undefined}>
          <label>
            Title
            <input
              name="title"
              required
              maxLength={recipeLimits.title}
              defaultValue={recipe?.title}
              autoComplete="off"
              data-autofocus
              {...title.props}
            />
            {title.error}
          </label>
          {recipe && (
            <label className={styles.serves}>
              Serves
              <input
                name="servings"
                type="number"
                inputMode="numeric"
                min={1}
                max={recipeLimits.servings}
                step={1}
                required
                defaultValue={recipe.servings}
                {...servings.props}
              />
              {servings.error}
            </label>
          )}
        </div>
        <label>
          Ingredients
          <span className={styles.hint}>
            One a line, with its amount first so it scales: 200 g flour. A line ending in a colon is a heading.
          </span>
          <textarea
            name="ingredients"
            rows={8}
            defaultValue={recipe?.ingredients.join("\n")}
            placeholder={"200 g flour\n2 eggs\n300 ml milk"}
            {...ingredients.props}
          />
          {ingredients.error}
        </label>
        <label>
          Method
          <span className={styles.hint}>One step a line.</span>
          <textarea
            name="steps"
            rows={8}
            defaultValue={recipe?.steps.join("\n")}
            placeholder={"Whisk the flour, eggs and milk.\nRest the batter for 30 minutes."}
            {...steps.props}
          />
          {steps.error}
        </label>
        <TagPicker
          tags={tags}
          known={known}
          text={tagText}
          error={errors.tags}
          onText={setTagText}
          onChange={setTags}
        />
        <label>
          Source link
          <span className={styles.hint}>Where it&rsquo;s from, if it&rsquo;s online.</span>
          <input
            name="source"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={recipeLimits.sourceUrl}
            defaultValue={recipe?.sourceUrl ?? ""}
            placeholder="https://"
            {...source.props}
          />
          {source.error}
        </label>
        <label>
          Notes
          <textarea name="notes" rows={3} maxLength={recipeLimits.notes} defaultValue={recipe?.notes} />
        </label>
        {/* No Cancel: the × at the top closes it without saving. */}
        <div className={ui.actions}>
          <Button variant="primary" type="submit">
            Save
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

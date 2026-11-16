// The Recipes app's data, as the API sends it and the browser shows it, and the
// pure logic both use: reading what was typed (one ingredient or step a line,
// tags, a source link), scaling an ingredient's amount to other servings, and
// searching. No server or browser APIs here, so it is unit tested (test/).

/** A recipe's photo: its file is /api/recipes/photos/<id> (photoSrc). */
export type RecipePhoto = { id: string; width: number; height: number };

export type Recipe = {
  id: string;
  title: string;
  /** How many it serves as written: its amounts are for this many. */
  servings: number;
  /** One a line, in order; a line ending in ":" is a heading ("For the sauce:"). */
  ingredients: string[];
  /** One a line, in order (shown numbered). */
  steps: string[];
  notes: string;
  /** Where it came from: an http(s) link, or null. */
  sourceUrl: string | null;
  /** As typed, without duplicates (in any case). */
  tags: string[];
  isFavourite: boolean;
  /** The first is the cover. */
  photos: RecipePhoto[];
  createdAt: string;
  updatedAt: string;
};

/** What a recipe's form sets, and what a change to a recipe may change. */
export type RecipeFields = Pick<
  Recipe,
  "title" | "servings" | "ingredients" | "steps" | "notes" | "sourceUrl" | "tags" | "isFavourite"
>;
export type RecipeChange = Partial<RecipeFields>;

/** A line of the shopping list; `recipeId` is the recipe it was taken from, if any. */
export type ShoppingItem = { id: string; text: string; recipeId: string | null; isChecked: boolean };

// The limits the API checks (lib/schemas.ts) and the forms say.
export const recipeLimits = {
  title: 200,
  servings: 100,
  ingredients: 200,
  ingredient: 300,
  steps: 100,
  step: 2000,
  notes: 10_000,
  sourceUrl: 2000,
  tags: 20,
  tag: 30,
  photos: 10,
  shoppingText: 300,
  shoppingItems: 500,
} as const;

/** The servings a new recipe starts with. */
export const defaultServings = 4;

// --- Reading what was typed --------------------------------------------------

// Bullets that come with a list pasted from a website: "- ", "• ", "▢ ".
const bullet = /^[-–•*·▢□☐◦‣]\s+/;
// A step's own number, as pasted: "1. ", "2) ", "Step 3: ".
// Not "1.5 cups …": the number's mark is followed by a space.
const stepNumber = /^(?:step\s*)?\d{1,3}\s*[.):]\s+|^step\s*\d{1,3}\s+/i;

/** The lines of a text field: trimmed, without empty ones. */
export function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** An ingredients field's lines, without the bullets a pasted list has. */
export const ingredientsOf = (text: string) =>
  linesOf(text)
    .map((line) => line.replace(bullet, "").trim())
    .filter(Boolean);

/** A method field's steps, one a line, without the numbers a pasted list has (they are shown numbered). */
export const stepsOf = (text: string) =>
  linesOf(text)
    .map((line) => line.replace(bullet, "").replace(stepNumber, "").trim())
    .filter(Boolean);

/** An ingredient line that is a heading of the ones under it: "For the sauce:". Not scaled, not bought. */
export const isHeading = (line: string) => line.endsWith(":") && line.length <= 60;

/** A tag as it's kept: trimmed, one space between words, without a leading #. */
export const normalizeTag = (tag: string) => tag.replace(/^#+/, "").replace(/\s+/g, " ").trim();

/** For comparing what was typed with what is kept: lowercase, without accents ("Crème" is "creme"). */
export const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en");

/** Tags, normalized, without empty ones or a second one in another case (the first is kept). */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (!tag || seen.has(fold(tag))) continue;
    seen.add(fold(tag));
    kept.push(tag);
  }
  return kept;
}

/**
 * Every tag of these recipes, once each, A to Z: as it was first written (the
 * oldest recipe's "Dinner", not a newer one's "dinner"), whatever the order given.
 */
export function allTags(recipes: readonly Pick<Recipe, "tags" | "createdAt">[]): string[] {
  const byFold = new Map<string, string>();
  const oldestFirst = [...recipes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const recipe of oldestFirst)
    for (const tag of recipe.tags) if (!byFold.has(fold(tag))) byFold.set(fold(tag), tag);
  return [...byFold.values()].sort((a, b) => fold(a).localeCompare(fold(b)));
}

export const hasTag = (recipe: Pick<Recipe, "tags">, tag: string) => recipe.tags.some((t) => fold(t) === fold(tag));

/**
 * A source link as typed or pasted, read generously: trimmed, and https:// in
 * front of one without its scheme ("bbcgoodfood.com/recipes/…"). Empty is
 * none (null); anything but an http(s) link with a host with a dot in it is
 * undefined (not a link).
 */
export function normalizeSourceUrl(text: string): string | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || /\s/.test(trimmed))
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

/** Where a link goes, for "From bbcgoodfood.com": its host, without www. */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// --- Scaling ------------------------------------------------------------------

const vulgarFractions: Record<string, number> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅕": 1 / 5,
  "⅖": 2 / 5,
  "⅗": 3 / 5,
  "⅘": 4 / 5,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};
const vulgar = Object.keys(vulgarFractions).join("");

// An amount: "1 1/2", "1½", "1/2", "½", "1,000", "1.5" or "1,5" (a decimal comma).
const amount = String.raw`(?:\d+\s+\d+\/\d+|\d+\s*[${vulgar}]|\d+\/\d+|[${vulgar}]|\d{1,3}(?:,\d{3})+(?!\d)|\d+(?:[.,]\d+)?)`;
// The first amount in a line, or a range of two ("2-3", "2 to 3"): not inside a
// word or another number ("E330", "1.5" is one), nor a percentage or a temperature.
const amountsInLine = new RegExp(
  String.raw`(?<![\p{L}\d.,/])(${amount})(?:(\s*(?:-|–|—|\bto\b|\bor\b)\s*)(${amount}))?(?![\d%°/])`,
  "gu",
);

/** The value of an amount as written, and whether it was written as a fraction or a decimal. */
function readAmount(text: string): { value: number; style: "fraction" | "decimal" | "whole"; comma: boolean } {
  const t = text.trim();
  let m: RegExpExecArray | null;
  if ((m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t)))
    return { value: +m[1] + +m[2] / +m[3] || 0, style: "fraction", comma: false };
  if ((m = new RegExp(`^(\\d+)\\s*([${vulgar}])$`).exec(t)))
    return { value: +m[1] + vulgarFractions[m[2]], style: "fraction", comma: false };
  if ((m = /^(\d+)\/(\d+)$/.exec(t))) return { value: +m[2] ? +m[1] / +m[2] : 0, style: "fraction", comma: false };
  if (t in vulgarFractions) return { value: vulgarFractions[t], style: "fraction", comma: false };
  if (/^\d{1,3}(?:,\d{3})+$/.test(t)) return { value: +t.replace(/,/g, ""), style: "whole", comma: false };
  if (/^\d+[.,]\d+$/.test(t)) return { value: +t.replace(",", "."), style: "decimal", comma: t.includes(",") };
  return { value: +t, style: "whole", comma: false };
}

// The fractions an amount is shown with, when it was written whole or as one.
const shownFractions: [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
];

/**
 * An amount, scaled, written as the original was: decimals stay decimals (with
 * its comma or point), whole numbers and fractions become whole numbers or
 * fractions ("1½") where one is close, else a short decimal. From 10 up,
 * whole numbers (225 g, not 225.5 g).
 */
export function formatAmount(value: number, style: "fraction" | "decimal" | "whole" = "whole", comma = false): string {
  const decimal = (digits: number) => {
    const text = String(Number(value.toFixed(digits)));
    return comma ? text.replace(".", ",") : text;
  };
  if (value >= 10) return String(Math.round(value));
  if (style === "decimal") return decimal(2);
  const whole = Math.floor(value);
  const part = value - whole;
  if (part < 0.03) return String(whole);
  if (part > 0.97) return String(whole + 1);
  const close = shownFractions.find(([fraction]) => Math.abs(part - fraction) < 0.03);
  if (close) return whole ? `${whole}${close[1]}` : close[1];
  return decimal(value < 1 ? 2 : 1);
}

/**
 * An ingredient line for `factor` times as many servings: its first amount (or
 * range) multiplied, written as it was ("1½ cups", "2-3 cloves", "0,75 l").
 * The first amount that isn't 0 ("Type 00 flour, 500 g" is 500 g). A heading,
 * a line without an amount ("Salt, to taste") or a factor of 1 stays as it is.
 */
export function scaleIngredient(line: string, factor: number): string {
  if (factor === 1 || !Number.isFinite(factor) || factor <= 0 || isHeading(line)) return line;
  for (const match of line.matchAll(amountsInLine)) {
    const [whole, first, separator, second] = match;
    const from = readAmount(first);
    if (!(from.value > 0)) continue;
    let scaled = formatAmount(from.value * factor, from.style, from.comma);
    if (second !== undefined) {
      const to = readAmount(second);
      scaled += `${separator}${formatAmount(to.value * factor, to.style, to.comma)}`;
    }
    return line.slice(0, match.index) + scaled + line.slice(match.index! + whole.length);
  }
  return line;
}

/** The factor that takes a recipe from its servings to `servings`. */
export const servingsFactor = (recipe: Pick<Recipe, "servings">, servings: number) => servings / recipe.servings;

// --- Searching ------------------------------------------------------------------

/**
 * Whether a recipe matches what was typed in the search: every word of it is
 * in its title, tags, ingredients or notes, in any case and without accents
 * ("creme" finds "Crème brûlée").
 */
export function matchesSearch(recipe: Recipe, search: string): boolean {
  const words = fold(search).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = fold([recipe.title, ...recipe.tags, ...recipe.ingredients, recipe.notes].join("\n"));
  return words.every((word) => text.includes(word));
}

/** How a list of recipes is sorted: the newest first, or A to Z by title. */
export type RecipeSort = "newest" | "az";

export function sortRecipes(recipes: readonly Recipe[], sort: RecipeSort): Recipe[] {
  return sort === "az"
    ? [...recipes].sort((a, b) => fold(a.title).localeCompare(fold(b.title)))
    : [...recipes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// --- Photos -------------------------------------------------------------------

/** A photo's URL: the large one (a recipe's page), or the small one (a card). */
export const photoSrc = (photo: Pick<RecipePhoto, "id">, size: "large" | "thumb" = "large") =>
  `/api/recipes/photos/${photo.id}${size === "thumb" ? "?size=thumb" : ""}`;

/** "1 item", "2 items". */
export const countOf = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

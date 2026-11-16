import { describe, expect, test } from "vitest";
import {
  allTags,
  formatAmount,
  hasTag,
  ingredientsOf,
  isHeading,
  matchesSearch,
  normalizeSourceUrl,
  normalizeTags,
  scaleIngredient,
  sortRecipes,
  sourceHost,
  stepsOf,
  type Recipe,
} from "@/lib/recipe-types";
import { recipeCreate, recipePatch, shoppingAdd, shoppingRemove } from "@/lib/schemas";

const recipe = (fields: Partial<Recipe>): Recipe => ({
  id: "00000000-0000-4000-8000-000000000001",
  title: "Pancakes",
  servings: 4,
  ingredients: [],
  steps: [],
  notes: "",
  sourceUrl: null,
  tags: [],
  isFavourite: false,
  photos: [],
  createdAt: "2026-11-16T10:00:00.000Z",
  updatedAt: "2026-11-16T10:00:00.000Z",
  ...fields,
});

describe("scaling an ingredient", () => {
  test("its first amount is multiplied, written as it was", () => {
    expect(scaleIngredient("200 g flour", 2)).toBe("400 g flour");
    expect(scaleIngredient("200g flour", 1.5)).toBe("300g flour");
    expect(scaleIngredient("3 eggs", 0.5)).toBe("1½ eggs");
    expect(scaleIngredient("1/2 cup milk", 2)).toBe("1 cup milk");
    expect(scaleIngredient("1 1/2 cups sugar", 2)).toBe("3 cups sugar");
    expect(scaleIngredient("½ tsp salt", 3)).toBe("1½ tsp salt");
    expect(scaleIngredient("1½ tbsp oil", 2)).toBe("3 tbsp oil");
    expect(scaleIngredient("1.5 kg potatoes", 1.5)).toBe("2.25 kg potatoes");
    // A decimal comma stays a comma.
    expect(scaleIngredient("0,75 l water", 2)).toBe("1,5 l water");
    expect(scaleIngredient("1,000 ml stock", 0.5)).toBe("500 ml stock");
  });

  test("a range is scaled at both ends", () => {
    expect(scaleIngredient("2-3 cloves garlic", 2)).toBe("4-6 cloves garlic");
    expect(scaleIngredient("1 to 2 chillies", 2)).toBe("2 to 4 chillies");
  });

  test("only the first amount that isn't 0, and not a percentage or a code", () => {
    expect(scaleIngredient("2 x 400g tins tomatoes", 2)).toBe("4 x 400g tins tomatoes");
    expect(scaleIngredient("Type 00 flour, 500 g", 2)).toBe("Type 00 flour, 1000 g");
    expect(scaleIngredient("5% fat yoghurt", 2)).toBe("5% fat yoghurt");
    expect(scaleIngredient("Juice of 2 lemons", 1.5)).toBe("Juice of 3 lemons");
  });

  test("from 10 up, whole numbers; small odd ones, a short decimal", () => {
    expect(scaleIngredient("150 g butter", 1 / 3)).toBe("50 g butter");
    expect(scaleIngredient("100 g sugar", 2 / 3)).toBe("67 g sugar");
    expect(formatAmount(0.2)).toBe("0.2");
    expect(formatAmount(2 / 3)).toBe("⅔");
    expect(formatAmount(2.25)).toBe("2¼");
    expect(formatAmount(2.25, "decimal")).toBe("2.25");
  });

  test("a heading, a line without an amount or the servings as written stay as they are", () => {
    expect(scaleIngredient("For the sauce:", 2)).toBe("For the sauce:");
    expect(scaleIngredient("Salt, to taste", 2)).toBe("Salt, to taste");
    expect(scaleIngredient("1/3 cup oats", 1)).toBe("1/3 cup oats");
  });
});

describe("reading what was typed", () => {
  test("ingredients and steps are a line each, without a pasted list's bullets and numbers", () => {
    expect(ingredientsOf("  - 200 g flour\n\n• 2 eggs \r\n▢ 300 ml  milk\n")).toEqual([
      "200 g flour",
      "2 eggs",
      "300 ml milk",
    ]);
    expect(stepsOf("1. Whisk.\n2) Rest it.\nStep 3: Fry.\n1.5 cups go in last.")).toEqual([
      "Whisk.",
      "Rest it.",
      "Fry.",
      "1.5 cups go in last.",
    ]);
    expect(isHeading("For the sauce:")).toBe(true);
    expect(isHeading("2 eggs")).toBe(false);
  });

  test("tags are trimmed, without #, once each in any case", () => {
    expect(normalizeTags([" Dinner ", "#quick", "dinner", "", "Quick  and   easy"])).toEqual([
      "Dinner",
      "quick",
      "Quick and easy",
    ]);
    const recipes = [recipe({ tags: ["Dinner", "Vegan"] }), recipe({ tags: ["dinner", "Baking"] })];
    expect(allTags(recipes)).toEqual(["Baking", "Dinner", "Vegan"]);
    expect(hasTag(recipes[1], "DINNER")).toBe(true);
  });

  test("a source link is read generously, and refused if it isn't a web link", () => {
    expect(normalizeSourceUrl("")).toBeNull();
    expect(normalizeSourceUrl("  bbcgoodfood.com/recipes/pancakes ")).toBe("https://bbcgoodfood.com/recipes/pancakes");
    expect(normalizeSourceUrl("http://example.com/a")).toBe("http://example.com/a");
    expect(normalizeSourceUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeSourceUrl("not a link")).toBeUndefined();
    expect(sourceHost("https://www.bbcgoodfood.com/recipes/x")).toBe("bbcgoodfood.com");
  });
});

test("search finds every word in the title, tags, ingredients or notes, without accents", () => {
  const brulee = recipe({ title: "Crème brûlée", tags: ["Dessert"], ingredients: ["4 egg yolks", "500 ml cream"] });
  expect(matchesSearch(brulee, "creme")).toBe(true);
  expect(matchesSearch(brulee, "dessert yolks")).toBe(true);
  expect(matchesSearch(brulee, "dessert chocolate")).toBe(false);
  expect(matchesSearch(brulee, "   ")).toBe(true);
});

test("recipes sort by newest first, or A to Z", () => {
  const a = recipe({ id: "a", title: "Ánimo", createdAt: "2026-11-01T00:00:00.000Z" });
  const b = recipe({ id: "b", title: "Bread", createdAt: "2026-11-03T00:00:00.000Z" });
  const c = recipe({ id: "c", title: "apple pie", createdAt: "2026-11-02T00:00:00.000Z" });
  expect(sortRecipes([a, b, c], "newest").map((r) => r.id)).toEqual(["b", "c", "a"]);
  expect(sortRecipes([a, b, c], "az").map((r) => r.id)).toEqual(["a", "c", "b"]);
});

describe("the recipes API's schemas", () => {
  test("a new recipe needs only a title; lines are tidied and empty ones left out", () => {
    const parsed = recipeCreate.parse({ title: " Pancakes ", ingredients: [" 2 eggs ", "", "  "], tags: ["a", "A"] });
    expect(parsed).toMatchObject({
      title: "Pancakes",
      servings: 4,
      ingredients: ["2 eggs"],
      steps: [],
      notes: "",
      sourceUrl: null,
      tags: ["a"],
      isFavourite: false,
    });
  });

  test("each field's limits answer with what to fix", () => {
    const error = (input: unknown) => recipePatch.safeParse(input).error?.issues[0]?.message;
    expect(error({ servings: 0 })).toBe("Enter how many it serves, from 1 to 100.");
    expect(error({ servings: 2.5 })).toBe("Enter how many it serves, from 1 to 100.");
    expect(error({ title: "" })).toBe("Enter a title between 1 and 200 characters.");
    expect(error({ sourceUrl: "ftp://example.com" })).toBe(
      "Enter a web link, like https://example.com/recipe, or none.",
    );
    expect(error({ tags: Array.from({ length: 21 }, (_, i) => `tag ${i}`) })).toBe("A recipe can have up to 20 tags.");
    expect(error({ ingredients: ["x".repeat(301)] })).toBe("Keep each ingredient to 300 characters.");
    expect(recipePatch.parse({ sourceUrl: "example.com/r" })).toEqual({ sourceUrl: "https://example.com/r" });
    expect(recipePatch.parse({ sourceUrl: null })).toEqual({ sourceUrl: null });
  });

  test("the shopping list takes lines with their recipe, and ids to remove", () => {
    expect(shoppingAdd.parse({ items: [{ text: " milk " }] })).toEqual({ items: [{ text: "milk", recipeId: null }] });
    expect(shoppingAdd.safeParse({ items: [] }).error?.issues[0]?.message).toBe("Add at least one item.");
    expect(shoppingRemove.safeParse({ ids: ["nope"] }).success).toBe(false);
  });
});

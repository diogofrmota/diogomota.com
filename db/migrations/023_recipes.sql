-- 023_recipes: the Recipes app (/recipes). Each user's own recipes, their
-- photos and a shopping list; nobody else sees them. Only added: the previous
-- release, which doesn't know these tables, keeps working.

-- A recipe: its ingredients and steps are lines, in order, as typed (an
-- ingredient's amount is read from the start of its line to scale it;
-- lib/recipe-types.ts). Ids may be chosen by the client, so changes made
-- offline can refer to a recipe before it is saved.
CREATE TABLE recipes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title        text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  servings     integer NOT NULL DEFAULT 4 CHECK (servings BETWEEN 1 AND 100),
  ingredients  text[] NOT NULL DEFAULT '{}',
  steps        text[] NOT NULL DEFAULT '{}',
  notes        text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 10000),
  source_url   text CHECK (char_length(source_url) <= 2000),
  tags         text[] NOT NULL DEFAULT '{}',
  is_favourite boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recipes_user_idx ON recipes (user_id, created_at DESC);

-- A recipe's photos, the first (lowest position) its cover. The pictures
-- themselves are files, RECIPE_PHOTO_DIR/<id>.webp and <id>-thumb.webp
-- (lib/recipe-photos.ts), on the app's data volume beside the profile pictures.
CREATE TABLE recipe_photos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id  uuid NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  position   integer NOT NULL,
  width      integer NOT NULL CHECK (width > 0),
  height     integer NOT NULL CHECK (height > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recipe_photos_recipe_idx ON recipe_photos (recipe_id, position);

-- The shopping list: what to buy, in the order it was added, typed in or taken
-- from a recipe's ingredients (recipe_id, which says where it came from).
CREATE TABLE shopping_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  text       text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 300),
  recipe_id  uuid REFERENCES recipes (id) ON DELETE SET NULL,
  is_checked boolean NOT NULL DEFAULT false,
  position   integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shopping_items_user_idx ON shopping_items (user_id, position);

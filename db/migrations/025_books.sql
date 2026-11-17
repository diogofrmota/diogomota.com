-- Books: private shelves and page progress. Additive for existing releases.
CREATE TABLE books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  catalog_id text CHECK (catalog_id ~ '^OL[0-9]+W$'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  author text NOT NULL DEFAULT '' CHECK (char_length(author) <= 500),
  cover_id integer CHECK (cover_id > 0),
  total_pages integer CHECK (total_pages BETWEEN 1 AND 100000),
  pages_read integer NOT NULL DEFAULT 0 CHECK (pages_read BETWEEN 0 AND 100000),
  shelf text NOT NULL DEFAULT 'want-to-read' CHECK (shelf IN ('want-to-read', 'currently-reading', 'finished')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total_pages IS NULL OR pages_read <= total_pages),
  CHECK (shelf <> 'want-to-read' OR pages_read = 0),
  CHECK (shelf <> 'finished' OR total_pages IS NULL OR pages_read = total_pages)
);
CREATE INDEX books_user_idx ON books(user_id, updated_at DESC);
CREATE UNIQUE INDEX books_catalog_idx ON books(user_id, catalog_id) WHERE catalog_id IS NOT NULL;

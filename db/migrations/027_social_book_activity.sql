-- Social adds Books to the friends feed. Existing Shows and Shared activity is unchanged.
ALTER TABLE activity ADD COLUMN book_id uuid REFERENCES books (id) ON DELETE CASCADE;
CREATE INDEX activity_book_id_idx ON activity (book_id) WHERE book_id IS NOT NULL;

-- 014_one_name: a name is one field, as people want it: "Diogo" or "Diogo
-- Mota". It replaces 013's first and last names, which become the name they
-- made ("Diogo Mota", or the first name alone), cut to the 50 characters a
-- name can have. Set at sign-up or in /account (Name), as typed (trimmed, one
-- space between words); NULL for accounts made before names, which show their
-- username alone until they set one.

ALTER TABLE users ADD COLUMN name text CHECK (char_length(name) BETWEEN 1 AND 50);

UPDATE users SET name = rtrim(left(concat_ws(' ', first_name, last_name), 50))
WHERE first_name IS NOT NULL;

ALTER TABLE users
  DROP CONSTRAINT users_last_name_needs_first,
  DROP COLUMN first_name,
  DROP COLUMN last_name;

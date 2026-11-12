-- 013_names: people have a first name and a last name, set at sign-up or in
-- /account (Name), and shown with their username: "Diogo Mota (@diogofrmota)".
-- Accounts made before this have neither until they set them, and show their
-- username alone. The first name is the one a name needs; the last is optional.
-- Both are as typed (trimmed, one space between words), 1-50 characters.
--
-- And unaccent, so Shows' friend search finds "João" from "joao" too
-- (app/lib/friends.ts). It is a trusted extension, like citext (001).

ALTER TABLE users
  ADD COLUMN first_name text CHECK (char_length(first_name) BETWEEN 1 AND 50),
  ADD COLUMN last_name text CHECK (char_length(last_name) BETWEEN 1 AND 50),
  ADD CONSTRAINT users_last_name_needs_first CHECK (last_name IS NULL OR first_name IS NOT NULL);

CREATE EXTENSION IF NOT EXISTS unaccent;

-- 010_neutral_default_space_retro: two new themes, Space and Retro
-- (app/lib/themes.ts), and Neutral (minimal-neutrals) as new accounts' theme
-- instead of Dark mode. Accounts keep the theme they have.

ALTER TABLE users ALTER COLUMN theme_preference SET DEFAULT 'minimal-neutrals';

ALTER TABLE users DROP CONSTRAINT users_theme_preference_check;

ALTER TABLE users
  ADD CONSTRAINT users_theme_preference_check CHECK (theme_preference IN (
    'light-2', 'minimal-neutrals', 'warm-neutrals', 'earth-tones',
    'dark-2', 'graphite', 'dark-1', 'space', 'blueprint', 'retro'
  ));

-- Shows' Add a friend suggests usernames as they're typed: a prefix search
-- (username::text LIKE 'abc%', lib/friends.ts), which this index serves.
-- Usernames are stored in lowercase.
CREATE INDEX users_username_prefix_idx ON users ((username::text) text_pattern_ops);

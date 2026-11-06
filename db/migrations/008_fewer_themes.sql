-- 008_fewer_themes: the themes taken out of the picker (app/lib/themes.ts).
-- Users who had one get the closest theme that's left. Dark is gone, so new
-- accounts start in Dark 2 instead.

UPDATE users SET theme_preference = CASE theme_preference
    WHEN 'light' THEN 'light-2'
    WHEN 'light-1' THEN 'light-2'
    WHEN 'dark' THEN 'dark-2'
    WHEN 'dark-3' THEN 'iron'
    WHEN 'vibrant-greens' THEN 'cool-blues'
    WHEN 'maroon-mood' THEN 'warm-neutrals'
    WHEN 'bold-orange' THEN 'iron'
    WHEN 'vibrant-blues' THEN 'dark-1'
    WHEN 'power-purple' THEN 'vivid-nightfall'
  END
  WHERE theme_preference IN ('light', 'light-1', 'dark', 'dark-3', 'vibrant-greens', 'maroon-mood',
    'bold-orange', 'vibrant-blues', 'power-purple');

ALTER TABLE users ALTER COLUMN theme_preference SET DEFAULT 'dark-2';

ALTER TABLE users DROP CONSTRAINT users_theme_preference_check;

ALTER TABLE users
  ADD CONSTRAINT users_theme_preference_check CHECK (theme_preference IN (
    'light-2', 'light-3', 'dark-1', 'dark-2',
    'earth-tones', 'warm-neutrals', 'cool-blues', 'minimal-neutrals', 'pastels', 'vivid-nightfall',
    'iron', 'graphite', 'blueprint', 'grass', 'rocky-mountains'
  ));

-- 009_eight_themes: seven more themes taken out of the picker (app/lib/themes.ts).
-- Users who had one get the closest theme that's left. The ones that stay keep
-- their ids, under new names: light-2 is Light mode, dark-1 Ocean, dark-2 Dark
-- mode, warm-neutrals Warm, minimal-neutrals Neutral.

UPDATE users SET theme_preference = CASE theme_preference
    WHEN 'light-3' THEN 'light-2'
    WHEN 'pastels' THEN 'light-2'
    WHEN 'grass' THEN 'earth-tones'
    WHEN 'cool-blues' THEN 'dark-1'
    WHEN 'rocky-mountains' THEN 'dark-1'
    WHEN 'vivid-nightfall' THEN 'dark-2'
    WHEN 'iron' THEN 'graphite'
  END
  WHERE theme_preference IN ('light-3', 'pastels', 'grass', 'cool-blues', 'rocky-mountains',
    'vivid-nightfall', 'iron');

ALTER TABLE users DROP CONSTRAINT users_theme_preference_check;

ALTER TABLE users
  ADD CONSTRAINT users_theme_preference_check CHECK (theme_preference IN (
    'light-2', 'minimal-neutrals', 'warm-neutrals', 'earth-tones',
    'dark-2', 'graphite', 'dark-1', 'blueprint'
  ));

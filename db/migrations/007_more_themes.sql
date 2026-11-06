-- 007_more_themes: the themes added to the theme picker. The ids are the ones
-- in app/lib/themes.ts, whose colors are in app/components/common/themes.module.css:
-- a new theme goes in all three. Existing users keep the theme they have.

ALTER TABLE users DROP CONSTRAINT users_theme_preference_check;

ALTER TABLE users
  ADD CONSTRAINT users_theme_preference_check CHECK (theme_preference IN (
    'light', 'light-1', 'light-2', 'light-3',
    'dark', 'dark-1', 'dark-2', 'dark-3',
    'earth-tones', 'vibrant-greens', 'warm-neutrals', 'maroon-mood', 'bold-orange', 'cool-blues',
    'minimal-neutrals', 'pastels', 'vibrant-blues', 'power-purple', 'vivid-nightfall',
    'iron', 'graphite', 'blueprint', 'grass', 'rocky-mountains'
  ));

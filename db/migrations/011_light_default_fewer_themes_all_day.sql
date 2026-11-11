-- 011_light_default_fewer_themes_all_day: four themes taken out of the picker
-- (app/lib/themes.ts): Earth tones, Dark mode, Blueprint and Retro. Users who
-- had one get the closest theme that's left. Light mode (light-2) is new
-- accounts' theme instead of Neutral, and the one logged out.
--
-- And all-day events in Shared's calendar: such an event runs from the start
-- of its first day to the start of the day after its last (Europe/Lisbon), and
-- shows without times.

UPDATE users SET theme_preference = CASE theme_preference
    WHEN 'earth-tones' THEN 'warm-neutrals'
    WHEN 'dark-2' THEN 'graphite'
    WHEN 'blueprint' THEN 'dark-1'
    WHEN 'retro' THEN 'graphite'
  END
  WHERE theme_preference IN ('earth-tones', 'dark-2', 'blueprint', 'retro');

ALTER TABLE users ALTER COLUMN theme_preference SET DEFAULT 'light-2';

ALTER TABLE users DROP CONSTRAINT users_theme_preference_check;

ALTER TABLE users
  ADD CONSTRAINT users_theme_preference_check CHECK (theme_preference IN (
    'light-2', 'minimal-neutrals', 'warm-neutrals', 'graphite', 'dark-1', 'space'
  ));

ALTER TABLE events ADD COLUMN all_day boolean NOT NULL DEFAULT false;

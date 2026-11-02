-- TMDB's average rating (0-10) of a cached title, shown on cards and in the
-- detail panel. NULL when nobody has voted on TMDB yet. Refreshed with the rest
-- of the row (lib/shows.ts).
ALTER TABLE shows ADD COLUMN vote_average numeric(3, 1) CHECK (vote_average BETWEEN 0 AND 10);

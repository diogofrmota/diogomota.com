-- 022_recommendation_seen: when the recipient saw a recommendation (Discover's
-- Recommended by Friends), so home's Shows badge counts only the new ones.
-- Nullable and only added: the previous release, which doesn't know it, keeps working.
ALTER TABLE recommendations ADD COLUMN seen_at timestamptz;

-- The badge counts a user's unseen ones.
CREATE INDEX recommendations_unseen_idx ON recommendations (to_user) WHERE seen_at IS NULL;

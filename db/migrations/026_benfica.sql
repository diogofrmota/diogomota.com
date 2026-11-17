-- Private Benfica home fixtures and stadium plans; additive for older releases.
CREATE TABLE benfica_fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent text NOT NULL CHECK (char_length(opponent) BETWEEN 1 AND 200),
  competition text NOT NULL CHECK (char_length(competition) BETWEEN 1 AND 200),
  kickoff timestamptz NOT NULL,
  attendance text NOT NULL DEFAULT 'undecided' CHECK (attendance IN ('undecided', 'going', 'maybe', 'not-going')),
  ticket text NOT NULL DEFAULT 'needed' CHECK (ticket IN ('needed', 'requested', 'purchased', 'season-ticket', 'not-needed')),
  reminder_minutes integer CHECK (reminder_minutes IN (60, 180, 1440, 2880)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX benfica_fixtures_user_kickoff_idx ON benfica_fixtures(user_id, kickoff, id);

-- 024_fitness: the Fitness app (/fitness). Each user's own gym routines,
-- workouts (their exercises, sets, reps and weights), runs, supplements, daily
-- log (steps, water, body weight, the supplements taken) and daily goals;
-- nobody else sees them. Only added: the previous release, which doesn't know
-- these tables, keeps working.

-- A routine: a plan for a kind of day at the gym ("Push day"), its exercises in
-- order, each {name, sets, reps} (checked by the API, lib/schemas.ts). Ids may
-- be chosen by the client, so changes made offline can refer to a routine
-- before it is saved.
CREATE TABLE fitness_routines (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  exercises  jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(exercises) = 'array'),
  notes      text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fitness_routines_user_idx ON fitness_routines (user_id, created_at);

-- A workout: a day's session, started from a routine (routine_id, kept as null
-- once the routine is deleted) or empty. Its exercises in order, each {id,
-- name, sets: [{reps, weightKg, done}]}: a set counts (history, records) once
-- it is done. Read and written whole, as a recipe's lines are.
CREATE TABLE fitness_workouts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date       date NOT NULL,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  routine_id uuid REFERENCES fitness_routines (id) ON DELETE SET NULL,
  exercises  jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(exercises) = 'array'),
  notes      text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fitness_workouts_user_idx ON fitness_workouts (user_id, date DESC);

-- A run: its day, distance (metres) and time (seconds); the pace follows.
CREATE TABLE fitness_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date        date NOT NULL,
  distance_m  integer NOT NULL CHECK (distance_m BETWEEN 10 AND 500000),
  duration_s  integer NOT NULL CHECK (duration_s BETWEEN 1 AND 359999),
  notes       text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fitness_runs_user_idx ON fitness_runs (user_id, date DESC);

-- The supplements the user takes ("Creatine", "5 g"), to tick off each day.
CREATE TABLE fitness_supplements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  dose       text NOT NULL DEFAULT '' CHECK (char_length(dose) <= 40),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fitness_supplements_user_idx ON fitness_supplements (user_id, created_at);

-- A day of the log (a Lisbon calendar date): the steps walked, the water drunk,
-- the body weight, and the ids of the supplements taken (a deleted one's id
-- stays, unread). A row exists only while something is logged that day.
CREATE TABLE fitness_days (
  user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  date              date NOT NULL,
  steps             integer CHECK (steps BETWEEN 0 AND 200000),
  water_ml          integer NOT NULL DEFAULT 0 CHECK (water_ml BETWEEN 0 AND 20000),
  weight_kg         numeric(4, 1) CHECK (weight_kg BETWEEN 20 AND 400),
  supplements_taken uuid[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, date)
);

-- The daily goals the water and steps are shown against; the defaults until
-- the user changes them (lib/fitness-types.ts, defaultGoals).
CREATE TABLE fitness_goals (
  user_id  uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  water_ml integer NOT NULL DEFAULT 2000 CHECK (water_ml BETWEEN 250 AND 10000),
  steps    integer NOT NULL DEFAULT 10000 CHECK (steps BETWEEN 500 AND 100000)
);

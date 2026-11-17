# 0018 — Fitness, the fourth app: each user's own

**Decided:** unreleased (after v1.2.0), 2026-11-17.

**Why:** One place for training and the daily habits around it: gym routines and the sets lifted, runs, steps, water, body weight and supplements, and the history, progress and personal records they add up to. It takes in the Workouts idea that was in `new_apps.md` (routines; exercises, sets, reps and weights; history and records) and widens it to the rest of the day. Like Recipes, it is one person's, so it is private and simple because of it.

**What it is:**

- `/fitness`, built as the other apps are: an entry in `lib/apps.ts` (the front page's section, the header and footer, About and home follow from it), its views in the URL (`today`, `workouts`, `progress`; a workout, a routine's and a run's forms, Start a workout, Supplements and Daily goals as panels), the apps' parts and dialogs, Undo instead of "are you sure?".
- Each user's own: no spaces, friends or activity. Another user's routine, workout, run or supplement answers 404, as one that doesn't exist.
- A workout's exercises and sets are one `jsonb` value, read and written whole, as a recipe's lines are: a set is `{reps, weightKg, done}`, and only the sets ticked off count (history, volume, records). Starting a routine fills its sets at its reps and at the weights of the last time each exercise was done, so logging at the gym is mostly ticking. Exercises are matched by name, in any case and without accents: there is no exercise catalogue to keep.
- The daily log is a row per day with something logged (`fitness_days`): steps and body weight typed in, water as a total (a glass sends the day's new total, so a change sent twice is no matter), and the supplements ticked off as their ids. Days are Lisbon calendar dates, as tasks' due dates are.
- Records and the charts' series are worked out in the browser from everything loaded (`lib/fitness-types.ts`, unit tested), as Shows' stats are: one answer (`GET /api/fitness`) has it all. A heavy user's few hundred workouts a year are a few hundred KB.
- The charts are hand-drawn SVG (no chart library), one series each in the theme's accent, with hover, tap and keyboard tooltips and a table each, following the dataviz rules (thin marks, hairline grid, one tick style an axis).
- Data through TanStack Query, as in Recipes ([0002](0002-tanstack-query-offline.md)): shown at once, kept for offline use, changes queued in order and safe to send twice (ids chosen by the client).
- `024_fitness.sql` only adds tables ([0004](0004-expand-and-contract-migrations.md)).

**Costs:** kilograms and kilometres only (no pounds or miles). Steps are typed in, not read from the phone's health data (a web app can't). Two devices changing the same workout at once: the last change wins, whole. Loading everything at once grows with the years; if it ever gets heavy, the history can be paged like the calendar's agenda, with the records kept on the server. No rest timer (that Workouts idea had one); it would be the next addition to a workout.

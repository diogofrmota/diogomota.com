import { randomUUID } from "node:crypto";
import { withDatabase } from "./db";

/** Five years: 3 workouts and 2 runs/week, daily logs; 1,000 full recipes. */
export async function seedLargeDataset(userId: string) {
  const exercises = Array.from({ length: 10 }, (_, i) => ({
    id: randomUUID(),
    name: `Exercise ${i}`,
    sets: Array.from({ length: 5 }, () => ({ reps: 10, weightKg: 50, done: true })),
  }));
  await withDatabase(async (db) => {
    await db.query(
      "INSERT INTO fitness_days (user_id, date, steps, water_ml, weight_kg) SELECT $1, CURRENT_DATE - n, 8000, 2000, 70 FROM generate_series(0,1824) n",
      [userId],
    );
    await db.query(
      "INSERT INTO fitness_workouts (user_id, date, name, exercises, notes) SELECT $1, CURRENT_DATE - (n * 7 / 3), 'Training', $2, repeat('notes ', 50) FROM generate_series(0,779) n",
      [userId, JSON.stringify(exercises)],
    );
    await db.query(
      "INSERT INTO fitness_runs (user_id, date, distance_m, duration_s) SELECT $1, CURRENT_DATE - (n * 7 / 2), 5000, 1500 FROM generate_series(0,519) n",
      [userId],
    );
    await db.query(
      "INSERT INTO recipes (user_id, title, ingredients, steps, notes) SELECT $1, 'Measured recipe ' || n, array_fill(repeat('ingredient ', 8), ARRAY[20]), array_fill(repeat('cooking step ', 20), ARRAY[20]), repeat('recipe notes ', 200) FROM generate_series(1,1000) n",
      [userId],
    );
  });
}

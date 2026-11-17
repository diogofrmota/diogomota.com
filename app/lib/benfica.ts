import "server-only";
import { z } from "zod";
import { query } from "./db";
import { HttpError } from "./http";
import type { Fixture, FixtureInput } from "./benfica-types";

const columns = `id, opponent, competition, kickoff, attendance, ticket, reminder_minutes AS "reminderMinutes", updated_at AS "updatedAt"`;
function validId(id: string) {
  if (!z.uuid().safeParse(id).success) throw new HttpError("Match not found.", 404);
}
export async function listFixtures(userId: string): Promise<Fixture[]> {
  return (
    await query<Fixture>(`SELECT ${columns} FROM benfica_fixtures WHERE user_id=$1 ORDER BY kickoff, id`, [userId])
  ).rows;
}
export async function readFixture(userId: string, id: string): Promise<Fixture> {
  validId(id);
  const result = await query<Fixture>(`SELECT ${columns} FROM benfica_fixtures WHERE user_id=$1 AND id=$2`, [
    userId,
    id,
  ]);
  if (!result.rows[0]) throw new HttpError("Match not found.", 404);
  return result.rows[0];
}
export async function saveFixture(userId: string, input: FixtureInput, id?: string): Promise<Fixture> {
  if (id) validId(id);
  const values = [
    userId,
    input.opponent,
    input.competition,
    input.kickoff,
    input.attendance,
    input.ticket,
    input.reminderMinutes,
  ];
  const result = id
    ? await query<Fixture>(
        `UPDATE benfica_fixtures SET opponent=$2, competition=$3, kickoff=$4, attendance=$5, ticket=$6, reminder_minutes=$7, updated_at=now() WHERE user_id=$1 AND id=$8 RETURNING ${columns}`,
        [...values, id],
      )
    : await query<Fixture>(
        `INSERT INTO benfica_fixtures (user_id, opponent, competition, kickoff, attendance, ticket, reminder_minutes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${columns}`,
        values,
      );
  if (!result.rows[0]) throw new HttpError("Match not found.", 404);
  return result.rows[0];
}
export async function deleteFixture(userId: string, id: string) {
  validId(id);
  const result = await query("DELETE FROM benfica_fixtures WHERE user_id=$1 AND id=$2 RETURNING id", [userId, id]);
  if (!result.rowCount) throw new HttpError("Match not found.", 404);
}

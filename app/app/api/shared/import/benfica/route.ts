import { benficaSchedule } from "@/lib/football-data";
import { importBenficaGames } from "@/lib/events";
import { apiRoute } from "@/lib/http";
import { inSpace } from "@/lib/spaces";

// POST /api/shared/import/benfica: adds Benfica's upcoming games to your
// space's calendar, once each ({added, skipped}).
export const POST = apiRoute({ label: "Importing Benfica games", status: 201 }, async ({ user }) => {
  const { matches } = await benficaSchedule();
  return inSpace(user.id, (db, space) => importBenficaGames(db, space, user.id, matches));
});

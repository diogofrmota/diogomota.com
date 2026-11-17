import { apiRoute } from "@/lib/http";
import { listFixtures, readFixture } from "@/lib/benfica";
import { fixturesIcs, isStadiumDay } from "@/lib/benfica-types";
import { benficaRequestLimit } from "@/lib/rate-limit";

export const GET = apiRoute(
  { label: "Exporting Benfica matches", limit: benficaRequestLimit },
  async ({ user, searchParams }) => {
    const id = searchParams.get("id");
    const fixtures = id
      ? [await readFixture(user.id, id)]
      : (await listFixtures(user.id)).filter(
          (fixture) => isStadiumDay(fixture) && Date.parse(fixture.kickoff) >= Date.now(),
        );
    return new Response(fixturesIcs(fixtures), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="benfica.ics"',
        "Cache-Control": "no-store",
      },
    });
  },
);

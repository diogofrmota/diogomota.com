import { apiRoute } from "@/lib/http";
import { benficaSchedule } from "@/lib/football-data";
import { benficaRequestLimit } from "@/lib/rate-limit";

export const GET = apiRoute({ label: "Loading Benfica schedule", limit: benficaRequestLimit }, async () => {
  const schedule = await benficaSchedule();
  return { ...schedule, matches: schedule.matches.filter((match) => Date.parse(match.kickoff) > Date.now()) };
});

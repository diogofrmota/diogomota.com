import { z } from "./zod";

export const benficaTeamId = 1903;
const team = z.object({ id: z.number().nullable(), name: z.string().nullish(), shortName: z.string().nullish() });
export const footballResponse = z.object({
  matches: z.array(
    z.object({
      id: z.number(),
      utcDate: z.string().datetime(),
      status: z.string(),
      competition: z.object({ name: z.string() }),
      homeTeam: team,
      awayTeam: team,
    }),
  ),
});

export type BenficaMatch = {
  id: number;
  kickoff: string;
  confirmedTime: boolean;
  home: boolean;
  homeTeam: string;
  awayTeam: string;
  competition: string;
};
export type BenficaSchedule = { matches: BenficaMatch[]; updatedAt: string; stale: boolean };

/** Scheduled fixtures only; cancelled/finished games and other teams never become stadium days. */
export function upcomingBenficaMatches(response: z.infer<typeof footballResponse>, now = Date.now()): BenficaMatch[] {
  return response.matches
    .filter(
      (match) =>
        ["SCHEDULED", "TIMED"].includes(match.status) &&
        Date.parse(match.utcDate) > now &&
        (match.homeTeam.id === benficaTeamId || match.awayTeam.id === benficaTeamId),
    )
    .map((match) => ({
      id: match.id,
      kickoff: match.utcDate,
      confirmedTime: match.status === "TIMED",
      home: match.homeTeam.id === benficaTeamId,
      homeTeam: match.homeTeam.shortName || match.homeTeam.name || "Opponent to be confirmed",
      awayTeam: match.awayTeam.shortName || match.awayTeam.name || "Opponent to be confirmed",
      competition: match.competition.name,
    }))
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

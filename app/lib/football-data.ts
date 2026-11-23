import "server-only";
import { HttpError } from "./http";
import { benficaTeamId, footballResponse, upcomingBenficaMatches, type BenficaSchedule } from "./football-types";
import { testHooksEnabled } from "./test-hooks";

const ttl = 15 * 60_000;
let cached: BenficaSchedule | undefined;
let retryAfter = 0;
let pending: Promise<BenficaSchedule> | undefined;

async function loadSchedule(): Promise<BenficaSchedule> {
  const token = process.env.FOOTBALL_DATA_API_KEY;
  if (!token) throw new HttpError("Benfica fixtures are not connected yet. Please contact Diogo.", 503);
  try {
    const response = await fetch(
      `https://api.football-data.org/v4/teams/${benficaTeamId}/matches?status=SCHEDULED,TIMED&limit=100`,
      {
        headers: { "X-Auth-Token": token },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
    if (!response.ok) {
      if (response.status === 429)
        throw new HttpError("The fixture service is busy. Please try again in a minute.", 503);
      if ([401, 403].includes(response.status))
        throw new HttpError("The fixture service could not authorize access. Please contact Diogo.", 503);
      throw new Error("Fixture provider unavailable");
    }
    const body = footballResponse.parse(await response.json());
    cached = { matches: upcomingBenficaMatches(body), updatedAt: new Date().toISOString() };
    return cached;
  } catch (error) {
    // Shared backoff avoids exhausting the provider's quota during an outage.
    retryAfter = Date.now() + 60_000;
    if (cached && Date.now() - Date.parse(cached.updatedAt) < 24 * 60 * 60_000) return cached;
    if (error instanceof HttpError) throw error;
    throw new HttpError("Could not load Benfica fixtures. Please try again shortly.", 502);
  }
}

/**
 * The e2e tests' schedule, which Shared's import of Benfica games reads: two
 * games, at the same times all day, so importing them twice finds them there.
 */
function testSchedule(): BenficaSchedule {
  const day = (days: number, hour: number) => {
    const date = new Date();
    date.setUTCHours(hour, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString();
  };
  return {
    matches: [
      { kickoff: day(2, 20), homeTeam: "Benfica", awayTeam: "Sporting CP" },
      { kickoff: day(9, 18), homeTeam: "FC Porto", awayTeam: "Benfica" },
    ],
    updatedAt: new Date().toISOString(),
  };
}

/** One shared cache and in-flight request for all accounts; the token stays on the server. */
export function benficaSchedule(): Promise<BenficaSchedule> {
  if (testHooksEnabled()) return Promise.resolve(testSchedule());
  const age = cached ? Date.now() - Date.parse(cached.updatedAt) : Infinity;
  if (cached && age < ttl) return Promise.resolve(cached);
  if (Date.now() < retryAfter) {
    if (cached && age < 24 * 60 * 60_000) return Promise.resolve(cached);
    throw new HttpError("The fixture service is busy. Please try again in a minute.", 503);
  }
  pending ??= loadSchedule().finally(() => {
    pending = undefined;
  });
  return pending;
}

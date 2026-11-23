import { afterEach, describe, expect, test, vi } from "vitest";
import { footballResponse, upcomingBenficaMatches } from "@/lib/football-types";

vi.mock("@/lib/http", () => ({
  HttpError: class extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));

const now = Date.parse("2026-11-17T12:00:00Z");
const match = (id: number, date: string, status = "TIMED", home = true) => ({
  id,
  utcDate: date,
  status,
  competition: { name: "Primeira Liga" },
  homeTeam: {
    id: home ? 1903 : 498,
    name: home ? "Sport Lisboa e Benfica" : "Sporting CP",
    shortName: home ? "Benfica" : "Sporting",
  },
  awayTeam: {
    id: home ? 498 : 1903,
    name: home ? "Sporting CP" : "Sport Lisboa e Benfica",
    shortName: home ? "Sporting" : "Benfica",
  },
});
const body = { matches: [match(1, "2026-11-20T20:00:00Z")] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetModules();
});

describe("Benfica fixtures", () => {
  test("keeps Benfica's future scheduled games, in kickoff order", () => {
    const response = footballResponse.parse({
      matches: [
        match(2, "2026-12-01T00:00:00Z", "SCHEDULED", false),
        ...body.matches,
        match(3, "2026-11-01T20:00:00Z"),
        match(4, "2026-11-23T20:00:00Z", "POSTPONED"),
        match(5, "2026-11-24T20:00:00Z", "CANCELLED"),
        match(6, "2026-11-25T20:00:00Z", "FINISHED"),
        { ...match(7, "2026-11-26T20:00:00Z"), homeTeam: { id: 123 }, awayTeam: { id: 456 } },
      ],
    });
    expect(upcomingBenficaMatches(response, now)).toEqual([
      { kickoff: "2026-11-20T20:00:00Z", homeTeam: "Benfica", awayTeam: "Sporting" },
      { kickoff: "2026-12-01T00:00:00Z", homeTeam: "Sporting", awayTeam: "Benfica" },
    ]);
  });

  test("shares in-flight requests and caches the schedule across users", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubEnv("FOOTBALL_DATA_API_KEY", "test-token");
    const fetcher = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", fetcher);
    const { benficaSchedule } = await import("@/lib/football-data");
    const [a, b] = await Promise.all([benficaSchedule(), benficaSchedule()]);
    expect(a).toEqual(b);
    expect(a.matches).toHaveLength(1);
    await benficaSchedule();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].headers).toEqual({ "X-Auth-Token": "test-token" });
    expect(JSON.stringify(a)).not.toContain("test-token");
    vi.advanceTimersByTime(16 * 60_000);
    fetcher.mockResolvedValue(Response.json({}, { status: 429 }));
    // The provider is busy: the schedule kept from before, for up to a day.
    expect(await benficaSchedule()).toEqual(a);
    await benficaSchedule();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("provider failures have safe errors and a backoff when there is no cached schedule", async () => {
    vi.stubEnv("FOOTBALL_DATA_API_KEY", "test-token");
    const fetcher = vi.fn().mockResolvedValue(Response.json({}, { status: 403 }));
    vi.stubGlobal("fetch", fetcher);
    const { benficaSchedule } = await import("@/lib/football-data");
    await expect(benficaSchedule()).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("authorize"),
    });
    expect(() => benficaSchedule()).toThrow("try again in a minute");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

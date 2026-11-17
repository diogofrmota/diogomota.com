import { describe, expect, test } from "vitest";
import { fixtureInput, fixturesIcs, isStadiumDay, type Fixture } from "@/lib/benfica-types";
import { localInstants } from "@/lib/calendar";

const fixture: Fixture = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  opponent: "Porto",
  competition: "Liga Portugal",
  kickoff: "2027-07-10T19:00:00.000Z",
  attendance: "going",
  ticket: "purchased",
  reminderMinutes: 1440,
  updatedAt: "2026-11-17T12:00:00.000Z",
};

describe("Benfica fixtures and calendar reminders", () => {
  test("validates real UTC instants, text and supported reminder intervals", () => {
    expect(fixtureInput.parse({ ...fixture, opponent: "  Porto  " }).opponent).toBe("Porto");
    for (const change of [
      { opponent: " " },
      { competition: "" },
      { kickoff: "2027-02-30T20:00:00Z" },
      { kickoff: "2027-07-10T20:00:00" },
      { reminderMinutes: -1 },
      { reminderMinutes: 15 },
      { attendance: "yes" },
      { ticket: "done" },
    ]) {
      expect(fixtureInput.safeParse({ ...fixture, ...change }).success).toBe(false);
    }
    expect(fixtureInput.safeParse({ ...fixture, reminderMinutes: null }).success).toBe(true);
  });
  test("Going and Maybe are stadium plans", () => {
    expect(isStadiumDay(fixture)).toBe(true);
    expect(isStadiumDay({ ...fixture, attendance: "maybe" })).toBe(true);
    expect(isStadiumDay({ ...fixture, attendance: "undecided" })).toBe(false);
    expect(isStadiumDay({ ...fixture, attendance: "not-going" })).toBe(false);
  });
  test("Lisbon's summer kickoff exports in UTC with a stable UID and alarm", () => {
    expect(localInstants("2027-07-10", "20:00")).toEqual([fixture.kickoff]);
    const ics = fixturesIcs([fixture]);
    expect(ics).toContain("DTSTART:20270710T190000Z\r\nDTEND:20270710T210000Z");
    expect(ics).toContain(`UID:benfica-${fixture.id}@diogomota.com`);
    expect(ics).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT1440M");
    expect(ics).toContain("LOCATION:Estádio da Luz");
    expect(ics).toContain("LAST-MODIFIED:20261117T120000Z");
    expect(fixturesIcs([{ ...fixture, reminderMinutes: null }])).not.toContain("VALARM");
  });
  test("escapes untrusted text and folds lines at 75 UTF-8 bytes", () => {
    const ics = fixturesIcs([{ ...fixture, opponent: "é".repeat(100) + ",;\\\nEND:VEVENT" }]);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, "")).toContain("\\,\\;\\\\\\nEND:VEVENT");
    expect(ics.split("\r\n").filter((line) => line === "END:VEVENT")).toHaveLength(1);
    expect(fixturesIcs([])).not.toContain("BEGIN:VEVENT");
  });
});

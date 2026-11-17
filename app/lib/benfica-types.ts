import { z } from "zod";
import { utcStamp } from "./calendar";

export const attendanceLabels = {
  undecided: "Undecided",
  going: "Going",
  maybe: "Maybe",
  "not-going": "Not going",
} as const;
export const ticketLabels = {
  needed: "Need a ticket",
  requested: "Requested",
  purchased: "Purchased",
  "season-ticket": "Season ticket",
  "not-needed": "Not needed",
} as const;
export const reminderLabels: Record<number, string> = {
  60: "1 hour before",
  180: "3 hours before",
  1440: "1 day before",
  2880: "2 days before",
};
export const fixtureInput = z.object({
  opponent: z.string().trim().min(1, "Enter an opponent.").max(200),
  competition: z.string().trim().min(1, "Enter a competition.").max(200),
  kickoff: z.iso.datetime(),
  attendance: z.enum(["undecided", "going", "maybe", "not-going"]),
  ticket: z.enum(["needed", "requested", "purchased", "season-ticket", "not-needed"]),
  reminderMinutes: z.union([z.literal(60), z.literal(180), z.literal(1440), z.literal(2880), z.null()]),
});
export type FixtureInput = z.infer<typeof fixtureInput>;
export type Fixture = FixtureInput & { id: string; updatedAt: string };

export function isStadiumDay(fixture: FixtureInput) {
  return fixture.attendance === "going" || fixture.attendance === "maybe";
}

const escapeText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/[,;]/g, "\\$&");
function fold(line: string) {
  let output = "",
    bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) {
      output += "\r\n ";
      bytes = 1;
    }
    output += char;
    bytes += size;
  }
  return output;
}

/** A portable calendar reminder; imported calendar apps deliver its alarm. */
export function fixturesIcs(fixtures: Fixture[]) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//diogomota.com//Benfica//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...fixtures.flatMap((fixture) => [
      "BEGIN:VEVENT",
      `UID:benfica-${fixture.id}@diogomota.com`,
      `DTSTAMP:${utcStamp(new Date().toISOString())}`,
      `LAST-MODIFIED:${utcStamp(fixture.updatedAt)}`,
      `DTSTART:${utcStamp(fixture.kickoff)}`,
      `DTEND:${utcStamp(new Date(Date.parse(fixture.kickoff) + 2 * 60 * 60 * 1000).toISOString())}`,
      `SUMMARY:${escapeText(`Benfica vs ${fixture.opponent}`)}`,
      "LOCATION:Estádio da Luz",
      `DESCRIPTION:${escapeText(`${fixture.competition}\nAttendance: ${attendanceLabels[fixture.attendance]}\nTicket: ${ticketLabels[fixture.ticket]}\nTimes may change. Event duration is an estimate of 2 hours.`)}`,
      ...(fixture.reminderMinutes === null
        ? []
        : [
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            `TRIGGER:-PT${fixture.reminderMinutes}M`,
            "DESCRIPTION:Benfica match reminder",
            "END:VALARM",
          ]),
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
}

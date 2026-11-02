export const calendarZone = "Europe/Lisbon";
export type CalendarEvent = {
  id: string; title: string; notes: string; startsAt: string; endsAt: string;
  isGroup: boolean; assigneeId: string | null;
};

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarZone, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
export function localParts(instant: string | Date) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

// Derive the possible offsets on either side of a transition, then round-trip
// each candidate. Never silently shift a nonexistent spring-forward time.
export function localInstants(date: string, time: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return [];
  const wall = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== `${date}T${time}`) return [];
  const offsets = new Set([-86400000, 0, 86400000].map((delta) => {
    const probe = new Date(wall + delta);
    const local = localParts(probe);
    return Date.parse(`${local.date}T${local.time}:00Z`) - probe.getTime();
  }));
  return [...offsets].map((offset) => new Date(wall - offset).toISOString()).filter((instant) => {
    const local = localParts(instant);
    return local.date === date && local.time === time;
  }).sort();
}
export function datePlus(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function dateLabel(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
export function utcStamp(instant: string) { return new Date(instant).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
export function googleCalendarLink(event: CalendarEvent) {
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: "TEMPLATE", text: event.title, dates: `${utcStamp(event.startsAt)}/${utcStamp(event.endsAt)}`,
    details: event.notes, ctz: calendarZone,
  })}`;
}
function escapeText(value: string) { return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/[,;]/g, "\\$&"); }
// RFC 5545: fold at 75 octets, without splitting a UTF-8 character.
function fold(line: string) {
  let output = "", bytes = 0;
  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (bytes + size > 75) { output += "\r\n "; bytes = 1; }
    output += char; bytes += size;
  }
  return output;
}
export function calendarIcs(events: CalendarEvent[]) {
  const stamp = utcStamp(new Date().toISOString());
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//diogomota.com//Shared//EN", "CALSCALE:GREGORIAN",
    ...events.flatMap((event) => ["BEGIN:VEVENT", `UID:${event.id}@diogomota.com`, `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(event.startsAt)}`, `DTEND:${utcStamp(event.endsAt)}`,
      `SUMMARY:${escapeText(event.title)}`, `DESCRIPTION:${escapeText(event.notes)}`, "END:VEVENT"]),
    "END:VCALENDAR", ""].map(fold).join("\r\n");
}

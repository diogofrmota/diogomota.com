export const calendarZone = "Europe/Lisbon";
export type CalendarEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  /** From the start of its first day to the start of the day after its last (Lisbon), shown without times. */
  allDay: boolean;
  /** For the whole group; otherwise for the members in assigneeIds (one or more). */
  isGroup: boolean;
  /** Sorted; empty for a group event, or when everyone it was for has left. */
  assigneeIds: string[];
};

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
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
  const offsets = new Set(
    [-86400000, 0, 86400000].map((delta) => {
      const probe = new Date(wall + delta);
      const local = localParts(probe);
      return Date.parse(`${local.date}T${local.time}:00Z`) - probe.getTime();
    }),
  );
  return [...offsets]
    .map((offset) => new Date(wall - offset).toISOString())
    .filter((instant) => {
      const local = localParts(instant);
      return local.date === date && local.time === time;
    })
    .sort();
}
/**
 * An all-day event's instants: the start of its first day, and the start of the
 * day after its last. Midnight always exists, once, in Lisbon (the clocks change
 * at 01:00 and 02:00).
 */
export function allDayInstants(startDate: string, endDate: string): { startsAt: string; endsAt: string } | null {
  const [startsAt] = localInstants(startDate, "00:00");
  const [endsAt] = localInstants(datePlus(endDate, 1), "00:00");
  return startsAt && endsAt ? { startsAt, endsAt } : null;
}
/** The local days an event is on: its first, and its last (an end at midnight belongs to the day before). */
export function eventDates(event: Pick<CalendarEvent, "startsAt" | "endsAt">) {
  return { start: localParts(event.startsAt), end: localParts(new Date(Date.parse(event.endsAt) - 1)) };
}
export function datePlus(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function dateLabel(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
export function utcStamp(instant: string) {
  return new Date(instant)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}
/** An all-day event's first day and the day after its last, as iCalendar and Google write dates: 20260710. */
function dateStamps(event: Pick<CalendarEvent, "startsAt" | "endsAt">) {
  return [event.startsAt, event.endsAt].map((instant) => localParts(instant).date.replace(/-/g, ""));
}
/** Who an event is for, in words: "Whole group", or the names of its members ("Ana and João"). */
export function eventFor(event: Pick<CalendarEvent, "isGroup" | "assigneeIds">, names: Map<string, string>): string {
  if (event.isGroup) return "Whole group";
  const known = event.assigneeIds.map((id) => names.get(id)).filter((name): name is string => !!name);
  return known.length ? new Intl.ListFormat("en-GB", { type: "conjunction" }).format(known) : "Former member";
}

export function googleCalendarLink(event: CalendarEvent, forWhom: string) {
  const dates = event.allDay ? dateStamps(event).join("/") : `${utcStamp(event.startsAt)}/${utcStamp(event.endsAt)}`;
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates,
    details: `For: ${forWhom}`,
    ctz: calendarZone,
  })}`;
}
function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/[,;]/g, "\\$&");
}
// RFC 5545: fold at 75 octets, without splitting a UTF-8 character.
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

/**
 * An iCalendar file (RFC 5545) of these events: one event's download, or a
 * calendar app's subscription (`name` and `refresh`: app/api/calendar/[token]).
 * `names` says who each event is for (its description).
 */
export function calendarIcs(
  events: CalendarEvent[],
  names: Map<string, string>,
  feed?: { name: string; refreshHours: number },
) {
  const stamp = utcStamp(new Date().toISOString());
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//diogomota.com//Shared//EN",
    "CALSCALE:GREGORIAN",
    ...(feed
      ? [
          "METHOD:PUBLISH",
          `X-WR-CALNAME:${escapeText(feed.name)}`,
          `X-WR-TIMEZONE:${calendarZone}`,
          `REFRESH-INTERVAL;VALUE=DURATION:PT${feed.refreshHours}H`,
          `X-PUBLISHED-TTL:PT${feed.refreshHours}H`,
        ]
      : []),
    ...events.flatMap((event) => [
      "BEGIN:VEVENT",
      `UID:${event.id}@diogomota.com`,
      `DTSTAMP:${stamp}`,
      ...(event.allDay
        ? dateStamps(event).map((date, i) => `${i ? "DTEND" : "DTSTART"};VALUE=DATE:${date}`)
        : [`DTSTART:${utcStamp(event.startsAt)}`, `DTEND:${utcStamp(event.endsAt)}`]),
      `SUMMARY:${escapeText(event.title)}`,
      `DESCRIPTION:${escapeText(`For: ${eventFor(event, names)}`)}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: calendarZone,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** An instant as people in Portugal write it, on the 24-hour clock in Lisbon time: "14 Nov 2026, 15:30". */
export function dateTimeLabel(instant: string | Date): string {
  return dateTimeFormatter.format(new Date(instant));
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

/**
 * The timed events of one day as the week and day views lay them out: each from
 * its top to its bottom (minutes into the day, at least 44 tall: a finger), in a
 * lane of its overlap group. Every event of a group of overlapping events has as
 * many lanes as the group needs, so none covers another's tap target.
 */
export function timedEvents(events: CalendarEvent[], date: string) {
  const items = events
    .map((event) => {
      const { start, end } = eventDates(event);
      const top = start.date < date ? 0 : minutesOf(start.time);
      const bottom = end.date > date ? 1440 : minutesOf(end.time) + 1;
      return { event, top, bottom: Math.max(top + 44, bottom), lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  let group: typeof items = [],
    laneEnds: number[] = [],
    groupEnd = -1;
  function finish() {
    for (const item of group) item.lanes = laneEnds.length;
  }
  for (const item of items) {
    if (item.top >= groupEnd) {
      finish();
      group = [];
      laneEnds = [];
      groupEnd = -1;
    }
    let lane = laneEnds.findIndex((end) => end <= item.top);
    if (lane < 0) lane = laneEnds.length;
    item.lane = lane;
    laneEnds[lane] = item.bottom;
    group.push(item);
    groupEnd = Math.max(groupEnd, item.bottom);
  }
  finish();
  return items;
}

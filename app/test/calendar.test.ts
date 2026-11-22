import { describe, expect, test } from "vitest";
import {
  allDayInstants,
  calendarIcs,
  dateTimeLabel,
  eventDates,
  eventFor,
  localInstants,
  type CalendarEvent,
} from "@/lib/calendar";

const event = (fields: Partial<CalendarEvent>): CalendarEvent => ({
  id: "id",
  title: "Dinner",
  startsAt: "2026-07-10T18:00:00.000Z",
  endsAt: "2026-07-10T19:00:00.000Z",
  allDay: false,
  isGroup: true,
  assigneeIds: [],
  ...fields,
});

describe("Lisbon time", () => {
  test("a wall-clock time is one instant, none in the spring gap, two in the autumn repeat", () => {
    expect(localInstants("2026-01-10", "09:30")).toEqual(["2026-01-10T09:30:00.000Z"]);
    expect(localInstants("2026-07-10", "09:30")).toEqual(["2026-07-10T08:30:00.000Z"]);
    expect(localInstants("2026-03-29", "01:30")).toEqual([]);
    expect(localInstants("2026-10-25", "01:30")).toEqual(["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"]);
  });

  test("dates and times that don't exist give nothing", () => {
    expect(localInstants("2026-02-30", "10:00")).toEqual([]);
    expect(localInstants("2026-02-10", "24:00")).toEqual([]);
    expect(localInstants("10/02/2026", "10:00")).toEqual([]);
  });

  test("an all-day event runs from its first day's midnight to the one after its last", () => {
    expect(allDayInstants("2026-07-10", "2026-07-12")).toEqual({
      startsAt: "2026-07-09T23:00:00.000Z",
      endsAt: "2026-07-12T23:00:00.000Z",
    });
    // An end at midnight belongs to the day before.
    expect(eventDates(event({ startsAt: "2026-07-09T23:00:00.000Z", endsAt: "2026-07-12T23:00:00.000Z" }))).toEqual({
      start: { date: "2026-07-10", time: "00:00" },
      end: { date: "2026-07-12", time: "23:59" },
    });
  });

  test("an instant is written the European way, on the 24-hour clock in Lisbon", () => {
    expect(dateTimeLabel("2026-11-14T15:30:00Z")).toBe("14 Nov 2026, 15:30");
    expect(dateTimeLabel("2026-07-01T22:05:00Z")).toBe("1 Jul 2026, 23:05");
  });
});

describe("iCalendar", () => {
  test("UTC times, escaped text, lines folded at 75 bytes without splitting a character, CRLF", () => {
    const title = "Café 🌍, meeting; ".repeat(15);
    const ics = calendarIcs(
      [event({ title, startsAt: "2026-07-10T08:30:00Z", endsAt: "2026-07-10T09:30:00Z" })],
      new Map(),
    );
    expect(ics).toContain("DTSTART:20260710T083000Z\r\n");
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n /g, "")).toContain(`SUMMARY:${title.replace(/[,;]/g, "\\$&")}`);
    expect(ics).toContain("DESCRIPTION:For: Whole group\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  test("all-day events are whole dates; a subscription names itself and says how often to check", () => {
    const ics = calendarIcs(
      [event({ allDay: true, startsAt: "2026-07-09T23:00:00.000Z", endsAt: "2026-07-11T23:00:00.000Z" })],
      new Map(),
      { name: "Shared calendar", refreshHours: 3 },
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20260710\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20260712\r\n");
    expect(ics).toContain("X-WR-CALNAME:Shared calendar\r\n");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT3H\r\n");
  });

  test("who an event is for, by name", () => {
    const names = new Map([
      ["a", "Ana"],
      ["b", "Diogo"],
    ]);
    expect(eventFor({ isGroup: true, assigneeIds: [] }, names)).toBe("Whole group");
    expect(eventFor({ isGroup: false, assigneeIds: ["a"] }, names)).toBe("Ana");
    expect(eventFor({ isGroup: false, assigneeIds: ["a", "b"] }, names)).toBe("Ana and Diogo");
    expect(eventFor({ isGroup: false, assigneeIds: ["gone"] }, names)).toBe("Former member");
  });
});

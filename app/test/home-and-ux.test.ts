import { describe, expect, test } from "vitest";
import { groupActivity, type ActivityItem } from "@/lib/activity-types";
import { lastViewCookie, lastViewCookieName, lastViewHref, sharedViews, showsViews } from "@/lib/app-views";
import { dayOfEvent, layoutWeek, type CalendarEvent } from "@/lib/calendar";
import { initials } from "@/lib/names";
import { authHref, homeWithNext } from "@/lib/next-path";

describe("home (docs/decisions/0014)", () => {
  test("a logged-out visitor is sent home, which sends them on after logging in", () => {
    expect(homeWithNext("/shows/discover?p=search")).toBe("/?next=%2Fshows%2Fdiscover%3Fp%3Dsearch");
    expect(authHref("/login", "/shared")).toBe("/login?next=%2Fshared");
  });

  test("an app's icon goes back to the view last used in it, if it is still one", () => {
    expect(lastViewHref("/shows", showsViews, "discover")).toBe("/shows/discover");
    expect(lastViewHref("/shared", sharedViews, "tasks")).toBe("/shared/tasks");
    // The first view is the app's own path.
    expect(lastViewHref("/shows", showsViews, "library")).toBe("/shows");
    // Nothing remembered, or something that isn't a view (Shared's welcome, a tampered cookie).
    expect(lastViewHref("/shows", showsViews, undefined)).toBe("/shows");
    expect(lastViewHref("/shared", sharedViews, "welcome")).toBe("/shared");
    expect(lastViewHref("/shared", sharedViews, "../account")).toBe("/shared");
  });

  test("the cookie that remembers it is one per app, for the whole site, for a year", () => {
    expect(lastViewCookieName("/shared")).toBe("last-view-shared");
    expect(lastViewCookieName("/test/app-shell")).toBe("last-view-test-app-shell");
    expect(lastViewCookie("/shows", "discover")).toBe(
      "last-view-shows=discover; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });
});

describe("avatars without a picture", () => {
  test("the first letters of the first and last words of the name, or the username's first", () => {
    expect(initials("diogofrmota", "Diogo Mota")).toBe("DM");
    expect(initials("rita", "Rita")).toBe("R");
    expect(initials("ana", "Ana Maria da Silva")).toBe("AS");
    expect(initials("e2e_123", null)).toBe("E");
    expect(initials("joao", "  joão   pereira ")).toBe("JP");
  });
});

const event = (id: string, startsAt: string, endsAt: string, allDay = false): CalendarEvent =>
  ({ id, title: id, startsAt, endsAt, allDay, isGroup: true, assigneeIds: [] }) as unknown as CalendarEvent;

describe("the month's lanes", () => {
  // Monday 16 to Sunday 22 November 2026, Lisbon time (UTC in November).
  const week = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];

  test("an event of several days is one bar across them, first, and the others keep clear of it", () => {
    const trip = event("trip", "2026-11-17T00:00:00.000Z", "2026-11-19T00:00:00.000Z", true);
    const dentist = event("dentist", "2026-11-18T09:00:00.000Z", "2026-11-18T10:00:00.000Z");
    const yoga = event("yoga", "2026-11-16T18:00:00.000Z", "2026-11-16T19:00:00.000Z");
    const placed = layoutWeek(week, [dentist, yoga, trip]);
    const byId = Object.fromEntries(placed.map((item) => [item.event.id, item]));
    expect(byId.trip).toMatchObject({ col: 1, span: 2, lane: 0 });
    // The trip takes lane 0 on Wednesday: the dentist goes under it.
    expect(byId.dentist).toMatchObject({ col: 2, span: 1, lane: 1 });
    // Monday has nothing over it.
    expect(byId.yoga).toMatchObject({ col: 0, span: 1, lane: 0 });
  });

  test("an event that started before the week, or ends after it, is cut at the week's edges", () => {
    const long = event("long", "2026-11-14T00:00:00.000Z", "2026-11-25T00:00:00.000Z", true);
    expect(layoutWeek(week, [long])).toEqual([expect.objectContaining({ col: 0, span: 7, lane: 0 })]);
    expect(layoutWeek(week, [event("before", "2026-11-10T09:00:00.000Z", "2026-11-10T10:00:00.000Z")])).toEqual([]);
  });

  test("which of its days the agenda is on, for an event of several", () => {
    const trip = event("trip", "2026-11-17T00:00:00.000Z", "2026-11-19T00:00:00.000Z", true);
    expect(dayOfEvent(trip, "2026-11-17")).toBe("day 1 of 2");
    expect(dayOfEvent(trip, "2026-11-18")).toBe("day 2 of 2");
    expect(dayOfEvent(event("one", "2026-11-18T09:00:00.000Z", "2026-11-18T10:00:00.000Z"), "2026-11-18")).toBeNull();
  });
});

describe("the activity feed", () => {
  const person = (id: string) => ({ id, username: id, name: null, avatarUrl: null });
  const task = (id: string, by: string, at: string, list = "Home"): ActivityItem => ({
    id,
    kind: "task-added",
    data: { title: id, list },
    createdAt: at,
    person: person(by),
    title: null,
  });

  test("a run of one thing by one person is one line; someone else, or another thing, starts another", () => {
    const items: ActivityItem[] = [
      task("a", "diogo", "2026-11-14T10:05:00Z", "Groceries"),
      task("b", "diogo", "2026-11-14T10:04:00Z"),
      task("c", "diogo", "2026-11-14T10:03:00Z"),
      task("d", "rita", "2026-11-14T10:02:00Z"),
      { ...task("e", "diogo", "2026-11-14T10:01:00Z"), kind: "joined", data: {} } as ActivityItem,
    ];
    expect(groupActivity(items).map((line) => line.map((item) => item.id))).toEqual([["a", "b", "c"], ["d"], ["e"]]);
  });

  test("not across more than an hour, and never for Shows' titles", () => {
    const items = [task("a", "diogo", "2026-11-14T12:00:00Z"), task("b", "diogo", "2026-11-14T10:00:00Z")];
    expect(groupActivity(items)).toHaveLength(2);
    const watching = (id: string): ActivityItem => ({
      id,
      kind: "watching",
      data: {},
      createdAt: "2026-11-14T10:00:00Z",
      person: person("diogo"),
      title: null,
    });
    expect(groupActivity([watching("x"), watching("y")])).toHaveLength(2);
  });
});

import { describe, expect, test } from "vitest";
import { appViewFromUrl, appViewUrl } from "@/hooks/useAppView";
import { viewFromParams } from "@/lib/app-views";
import { safeNextPath } from "@/lib/next-path";
import { eventInput, inviteCodeOf, joinInput, libraryPatch, taskCreate, taskPatch } from "@/lib/schemas";

describe("the APIs' schemas", () => {
  const event = {
    title: "  Dinner  ",
    startsAt: "2026-07-10T18:00:00.000Z",
    endsAt: "2026-07-10T19:00:00.000Z",
    isGroup: false,
    assigneeIds: ["0b5c1a7e-2f3d-4c5b-9a8e-1d2c3b4a5f60"],
  };

  test("an event: a trimmed title, UTC times with the end after the start, and who it's for", () => {
    expect(eventInput.parse(event)).toMatchObject({ title: "Dinner", allDay: false });
    expect(eventInput.safeParse({ ...event, endsAt: event.startsAt }).success).toBe(false);
    expect(eventInput.safeParse({ ...event, startsAt: "2026-07-10 18:00" }).success).toBe(false);
    // The group has nobody in particular; everything else someone.
    expect(eventInput.safeParse({ ...event, isGroup: true }).success).toBe(false);
    expect(eventInput.safeParse({ ...event, assigneeIds: [] }).success).toBe(false);
    expect(eventInput.parse({ ...event, isGroup: true, assigneeIds: [] }).isGroup).toBe(true);
    const error = eventInput.safeParse({ ...event, title: " " });
    expect(error.success || error.error.issues[0].message).toBe("Enter a title between 1 and 200 characters.");
  });

  test("tasks: a new one needs only a title; a change any of its fields; repeat is one of four", () => {
    expect(taskCreate.parse({ title: "Milk" })).toEqual({
      title: "Milk",
      notes: "",
      dueDate: null,
      assigneeId: null,
      isComplete: false,
      repeat: null,
    });
    expect(taskPatch.parse({ repeat: "weekly", rating: 5 })).toEqual({ repeat: "weekly" });
    expect(taskPatch.safeParse({ repeat: "hourly" }).success).toBe(false);
    expect(taskPatch.safeParse({ dueDate: "2026-02-30" }).success).toBe(false);
    const person = event.assigneeIds[0];
    expect(taskPatch.parse({ assigneeIds: [person, person] })).toEqual({ assigneeIds: [person] });
    expect(taskPatch.parse({ assigneeIds: [] })).toEqual({ assigneeIds: [] });
    expect(taskPatch.safeParse({ assigneeIds: ["not-a-person-id"] }).success).toBe(false);
    expect(taskPatch.safeParse({ assigneeIds: Array(11).fill(person) }).success).toBe(false);
  });

  test("an invite code is read in any case and with spaces around it", () => {
    expect(joinInput.parse({ code: " abcd2345 " })).toEqual({ code: "ABCD2345" });
    expect(joinInput.safeParse({ code: "ABCD1234" }).success).toBe(false);
  });

  test("an invite code is read as shown (two groups), with dashes, or as the whole link (Postel's law)", () => {
    for (const typed of ["ABCD 2345", "abcd-2345", " AB CD 23 45 ", "https://diogomota.com/join/abcd2345"]) {
      expect(joinInput.parse({ code: typed })).toEqual({ code: "ABCD2345" });
    }
    expect(inviteCodeOf("https://diogomota.com/join/ABCD2345?from=share#top")).toBe("ABCD2345");
    // Generous, not careless: what isn't a code still isn't one.
    expect(joinInput.safeParse({ code: "ABCD 234" }).success).toBe(false);
    expect(joinInput.safeParse({ code: "https://diogomota.com/apps" }).success).toBe(false);
  });

  test("a library change ignores what it doesn't know (a rating from before)", () => {
    expect(libraryPatch.parse({ rating: 4 })).toEqual({});
    expect(libraryPatch.safeParse({ status: "dropped" }).success).toBe(false);
  });
});

describe("the apps' URLs", () => {
  const views = ["library", "discover", "profile"];

  test("the first view is the app's own path; panels are p parameters, in order", () => {
    expect(appViewUrl("/shows", views, { view: "library", panels: [] })).toBe("/shows");
    expect(appViewUrl("/shows", views, { view: "discover", panels: ["search", "title:tv:1"] })).toBe(
      "/shows/discover?p=search&p=title%3Atv%3A1",
    );
    expect(appViewFromUrl("/shows", views, "/shows/discover", "?p=search&p=title:tv:1")).toEqual({
      view: "discover",
      panels: ["search", "title:tv:1"],
    });
    expect(appViewFromUrl("/shows", views, "/shows", "")).toEqual({ view: "library", panels: [] });
  });

  test("a path that isn't one of the app's views is nothing", () => {
    expect(appViewFromUrl("/shows", views, "/shows/watchlist", "")).toBeNull();
    expect(appViewFromUrl("/shows", views, "/shows/discover/more", "")).toBeNull();
    expect(appViewFromUrl("/shows", views, "/shared", "")).toBeNull();
    expect(viewFromParams(views, ["nope"], undefined)).toBeNull();
    expect(viewFromParams(views, undefined, ["a", "b", "c", "d", "e", "f"])?.panels).toHaveLength(5);
  });

  test("where to go after logging in is only ever a path of this site", () => {
    expect(safeNextPath("/join/ABCD2345")).toBe("/join/ABCD2345");
    expect(safeNextPath("https://elsewhere.example")).toBeNull();
    expect(safeNextPath("//elsewhere.example")).toBeNull();
    expect(safeNextPath("/\\elsewhere.example")).toBeNull();
  });
});

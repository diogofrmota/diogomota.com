import { describe, expect, test } from "vitest";
import {
  hasEpisode,
  libraryStats,
  mergeRecommendations,
  nextEpisode,
  tmdbImageUrl,
  type LibraryItem,
  type TitleSummary,
} from "@/lib/show-types";
import { applyTaskFields, moveBefore, nextDue, taskAssignees, type Task } from "@/lib/task-types";

test("task assignment handles cached single assignments, multiple people, and clearing everyone", () => {
  const task: Task = {
    id: "task",
    listId: "list",
    title: "Trip",
    notes: "",
    dueDate: null,
    assigneeId: "ana",
    isComplete: false,
    repeat: null,
  };
  expect(taskAssignees(task)).toEqual(["ana"]);
  const shared = applyTaskFields(task, { assigneeIds: ["ana", "diogo", "ana"] }, "2026-11-13");
  expect(taskAssignees(shared)).toEqual(["ana", "diogo"]);
  expect(applyTaskFields(shared, { assigneeIds: [] }, "2026-11-13")).toMatchObject({
    assigneeId: null,
    assigneeIds: [],
  });
  expect(taskAssignees(applyTaskFields(shared, { assigneeId: "diogo" }, "2026-11-13"))).toEqual(["diogo"]);
});

describe("repeating tasks", () => {
  test("the next due date is a period after the last, skipping the ones already past", () => {
    expect(nextDue("weekly", "2026-11-09", "2026-11-09")).toBe("2026-11-16");
    // Done a day late: still due on Mondays.
    expect(nextDue("weekly", "2026-11-09", "2026-11-10")).toBe("2026-11-16");
    // Weeks late: the next Monday to come.
    expect(nextDue("weekly", "2026-10-05", "2026-11-10")).toBe("2026-11-16");
    expect(nextDue("daily", null, "2026-11-10")).toBe("2026-11-11");
    expect(nextDue("yearly", "2026-02-14", "2026-02-14")).toBe("2027-02-14");
  });

  test("a month on from the 31st is the end of a shorter month", () => {
    expect(nextDue("monthly", "2026-01-31", "2026-01-31")).toBe("2026-02-28");
    expect(nextDue("monthly", "2028-01-31", "2028-01-31")).toBe("2028-02-29");
    expect(nextDue("yearly", "2028-02-29", "2028-02-29")).toBe("2029-02-28");
  });

  test("ticking off a repeating task brings it back, due again; other tasks just tick", () => {
    const task: Task = {
      id: "t",
      listId: "l",
      title: "Bins",
      notes: "",
      dueDate: "2026-11-09",
      assigneeId: null,
      isComplete: false,
      repeat: "weekly",
    };
    expect(applyTaskFields(task, { isComplete: true }, "2026-11-09")).toMatchObject({
      isComplete: false,
      dueDate: "2026-11-16",
    });
    expect(applyTaskFields({ ...task, repeat: null }, { isComplete: true }, "2026-11-09")).toMatchObject({
      isComplete: true,
      dueDate: "2026-11-09",
    });
    // Changing anything else leaves the date alone.
    expect(applyTaskFields(task, { title: "Bins out" }, "2026-11-09").dueDate).toBe("2026-11-09");
  });

  test("moving puts an item before another, or at the end; null when either is gone", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(moveBefore(items, "c", "a")?.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(moveBefore(items, "a", null)?.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(moveBefore(items, "x", null)).toBeNull();
    expect(moveBefore(items, "a", "x")).toBeNull();
  });
});

describe("the Shows library", () => {
  const item = (fields: Partial<LibraryItem> & Pick<LibraryItem, "type">): LibraryItem => ({
    tmdbId: 1,
    title: "T",
    year: 2020,
    posterPath: null,
    rating: null,
    runtime: null,
    episodeRuntime: null,
    episodesPerSeason: null,
    library: { id: "e", status: "planned", currentSeason: null, currentEpisode: null, isFavourite: false },
    ...fields,
  });

  test("stats count episodes up to the current one, completed shows whole, and completed movies", () => {
    const stats = libraryStats([
      item({
        type: "tv",
        episodeRuntime: 50,
        episodesPerSeason: [10, 8],
        library: { id: "1", status: "watching", currentSeason: 2, currentEpisode: 5, isFavourite: false },
      }),
      item({
        type: "tv",
        episodeRuntime: 30,
        episodesPerSeason: [6],
        library: { id: "2", status: "completed", currentSeason: null, currentEpisode: null, isFavourite: false },
      }),
      item({
        type: "movie",
        runtime: 120,
        library: { id: "3", status: "completed", currentSeason: null, currentEpisode: null, isFavourite: false },
      }),
      // Planned: nothing, whatever progress it has from before.
      item({
        type: "tv",
        episodeRuntime: 60,
        episodesPerSeason: [10],
        library: { id: "4", status: "planned", currentSeason: 1, currentEpisode: 3, isFavourite: false },
      }),
    ]);
    expect(stats).toEqual({
      tvCompleted: 1,
      moviesCompleted: 1,
      episodesWatched: 21,
      minutesWatched: 15 * 50 + 6 * 30 + 120,
    });
  });

  test("the next episode moves on to the next season, skipping empty ones, and ends after the last", () => {
    expect(nextEpisode([10, 8], null)).toEqual({ season: 1, episode: 1 });
    expect(nextEpisode([10, 0, 8], { season: 1, episode: 10 })).toEqual({ season: 3, episode: 1 });
    expect(nextEpisode([10, 8], { season: 2, episode: 8 })).toBeNull();
    expect(hasEpisode([10, 8], { season: 2, episode: 9 })).toBe(false);
    expect(hasEpisode([10, 8], { season: 1, episode: 10 })).toBe(true);
  });

  test("posters come in TMDB's closest width, at most 780", () => {
    expect(tmdbImageUrl("/a.jpg", 300)).toBe("https://image.tmdb.org/t/p/w342/a.jpg");
    expect(tmdbImageUrl("/a.jpg", 4000)).toBe("https://image.tmdb.org/t/p/w780/a.jpg");
  });

  test("For You ranks titles in several lists, or near their top, first, without the ones left out", () => {
    const title = (tmdbId: number, rating = 7): TitleSummary => ({
      type: "tv",
      tmdbId,
      title: `T${tmdbId}`,
      year: 2020,
      posterPath: null,
      rating,
    });
    const listed = (...ids: number[]) => ids.map((id) => ({ title: title(id), votes: 100 }));
    const merged = mergeRecommendations([listed(1, 2, 3, 4), listed(3, 5)], new Set([4]), 50, 10);
    // 3: 0.6 + 1, 1: 1, 2: 0.8, 5: 0.67.
    expect(merged.map((t) => t.tmdbId)).toEqual([3, 1, 2, 5]);
    // Too few votes: out.
    expect(mergeRecommendations([[{ title: title(9), votes: 10 }]], new Set(), 50, 10)).toEqual([]);
  });
});

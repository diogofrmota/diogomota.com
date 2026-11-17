import { expect, newUser, signUp, test } from "./fixtures";
import { checkView } from "./checks";
import { mockFixtures } from "./benfica";

test("Benfica: automatic fixtures highlight home games, refresh and recover from errors", async ({ page }) => {
  await mockFixtures(page);
  expect((await page.request.get("/api/benfica/fixtures")).status()).toBe(401);
  await signUp(page, newUser(), "/signup?next=%2Fbenfica");
  await expect(page).toHaveURL("/benfica");
  const games = page.getByRole("list", { name: "Upcoming Benfica games" });
  await expect(games.getByRole("listitem")).toHaveCount(2);
  await expect(games.getByRole("listitem").first()).toContainText("Home · Stadium day");
  await expect(games.getByRole("listitem").first()).toContainText("Estádio da Luz");
  await expect(games.getByRole("listitem").last()).toContainText("Away");
  await expect(games.getByRole("listitem").last()).toContainText("Kickoff to be confirmed");
  await expect(page.getByRole("button", { name: "Stadium days" })).toHaveCount(0);
  await checkView(page, "Benfica upcoming games");
  await page.route("**/api/benfica/fixtures", (route) =>
    route.fulfill({ status: 502, json: { error: "Could not load Benfica fixtures." } }),
  );
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Could not load Benfica fixtures.");
  await expect(games.getByRole("listitem")).toHaveCount(2);
  await mockFixtures(page);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await page.goto("/benfica/calendar");
  await expect(page).toHaveURL("/benfica");
});

test("Benfica API: validation, authentication, ownership, exports and deletion", async ({ page, browser }) => {
  expect((await page.request.get("/api/benfica")).status()).toBe(401);
  await signUp(page, newUser(), "/signup?next=%2Fbenfica");
  await expect(page).toHaveURL("/benfica");
  const input = {
    opponent: "Private opponent",
    competition: "Test cup",
    kickoff: new Date(Date.now() + 86400000).toISOString(),
    attendance: "going",
    ticket: "needed",
    reminderMinutes: 60,
  };
  expect((await page.request.post("/api/benfica", { data: { ...input, reminderMinutes: -5 } })).status()).toBe(400);
  expect(
    (await page.request.post("/api/benfica", { data: input, headers: { origin: "https://example.com" } })).status(),
  ).toBe(403);
  const created = await page.request.post("/api/benfica", { data: input });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).data;
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await signUp(other, newUser(), "/signup?next=%2Fbenfica");
    await expect(other).toHaveURL("/benfica");
    expect((await (await other.request.get("/api/benfica")).json()).data).toEqual([]);
    expect((await other.request.get(`/api/benfica/${id}`)).status()).toBe(404);
    expect((await other.request.patch(`/api/benfica/${id}`, { data: input })).status()).toBe(404);
    expect((await other.request.delete(`/api/benfica/${id}`)).status()).toBe(404);
    expect((await other.request.get(`/api/benfica/export?id=${id}`)).status()).toBe(404);
  } finally {
    await context.close();
  }
  expect((await page.request.get("/api/benfica/not-an-id")).status()).toBe(404);
  await page.request.patch(`/api/benfica/${id}`, { data: { ...input, attendance: "not-going" } });
  expect(await (await page.request.get("/api/benfica/export")).text()).not.toContain("BEGIN:VEVENT");
  expect(await (await page.request.get(`/api/benfica/export?id=${id}`)).text()).toContain("Private opponent");
  expect((await page.request.delete(`/api/benfica/${id}`)).status()).toBe(200);
  expect((await page.request.get(`/api/benfica/${id}`)).status()).toBe(404);
});

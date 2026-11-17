import { expect, newUser, signUp, test } from "./fixtures";
import { checkView } from "./checks";
import { localParts } from "../lib/calendar";

test("Benfica: plan, update, export and view stadium days", async ({ page }) => {
  const today = localParts(new Date()).date;
  const year = Number(today.slice(0, 4)) + 1;
  await signUp(page, newUser(), "/signup?next=%2Fbenfica");
  await expect(page).toHaveURL("/benfica");
  await page.getByRole("button", { name: "Add match", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Add home match" });
  await form.getByLabel("Opponent", { exact: true }).fill("Test opponent");
  await form.getByLabel("Competition", { exact: true }).fill("Liga Portugal");
  await form.getByLabel("Match date", { exact: true }).fill(`10/07/${year}`);
  await form.getByLabel("Kickoff", { exact: true }).fill("20:00");
  await form.getByLabel("Attendance plan").selectOption("going");
  await form.getByLabel("Ticket status").selectOption("requested");
  await form.getByLabel("Calendar reminder").selectOption("1440");
  await checkView(page, "Benfica match form");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole("heading", { name: "Benfica vs Test opponent" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Ticket: Requested", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit match", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit match" });
  await edit.getByLabel("Ticket status").selectOption("purchased");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit).toBeHidden();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export event", exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("benfica.ics");
  const exported = await (await page.request.get("/api/benfica/export")).text();
  expect(exported).toContain("TRIGGER:-PT1440M");
  expect(exported).toContain(`DTSTART:${year}0710T190000Z`);
  const account = await (await page.request.get("/api/account/export")).json();
  expect(account.benfica).toEqual([expect.objectContaining({ opponent: "Test opponent", ticket: "purchased" })]);
  await checkView(page, "Benfica fixtures");
  await page
    .getByRole("navigation", { name: "Benfica", exact: true })
    .getByRole("button", { name: "Stadium days" })
    .click();
  const monthsAhead = 12 + 7 - Number(today.slice(5, 7));
  for (let i = 0; i < monthsAhead; i++) await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByRole("heading", { name: `July ${year}` })).toBeVisible();
  await expect(page.getByRole("button", { name: /Benfica vs Test opponent/ }).last()).toBeVisible();
  await checkView(page, "Benfica stadium days");
  await page.screenshot({ path: test.info().outputPath("stadium-desktop.png"), fullPage: true });
  await page
    .getByRole("button", { name: /Benfica vs Test opponent/ })
    .last()
    .click();
  await expect(edit.getByLabel("Ticket status")).toHaveValue("purchased");
  await checkView(page, "Benfica edit match");
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Benfica", exact: true })
    .getByRole("button", { name: "Fixtures", exact: true })
    .click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Benfica vs Test opponent" })).toBeVisible();
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

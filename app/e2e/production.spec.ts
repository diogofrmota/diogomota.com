import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { expect, test, newUser, signUp, accountSetting } from "./fixtures";
import { userId, mockBase } from "./shows";
import { isolatedNginx, photoMultipart } from "./nginx";
import { seedLargeDataset } from "./large-dataset";

test.skip(process.env.E2E_PRODUCTION !== "1", "Requires an isolated production build and service worker.");

async function controlled(page: import("@playwright/test").Page, route: string) {
  await page.goto(route);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect
    .poll(() => page.evaluate(async (pathname) => !!(await caches.match(location.origin + pathname)), route))
    .toBe(true);
}

test("offline Fitness edits survive Books switching, another app tab, reload and replay once", async ({
  page,
  context,
}) => {
  const user = newUser();
  await signUp(page, user, "/signup?next=/books");
  await expect(page).toHaveURL("/books");
  const book = await page.request.post("/api/books", { data: { title: "Offline shelf A", author: "Test" } });
  expect(book.status()).toBe(201);
  await controlled(page, "/books");
  await expect(page.getByText("Offline shelf A", { exact: true })).toBeVisible();
  await controlled(page, "/books/library");
  await controlled(page, "/fitness");
  await expect(page.getByRole("button", { name: "250 ml", exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "250 ml", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => key.endsWith(":pending"))
          .some((key) => JSON.parse(localStorage.getItem(key)!).mutations.length > 0),
      ),
    )
    .toBe(true);
  await page.goto("/books/library");
  await expect(page.getByText("Offline shelf A", { exact: true })).toBeVisible();
  const another = await context.newPage();
  await another.goto("/fitness");
  await expect(another.getByRole("button", { name: "250 ml", exact: true })).toBeVisible();
  const simultaneous = await context.newPage();
  await simultaneous.goto("/fitness");
  await expect(simultaneous.getByRole("button", { name: "250 ml", exact: true })).toBeVisible();
  await simultaneous.close();
  let patches = 0;
  context.on("request", (request) => {
    if (request.method() === "PATCH" && request.url().includes("/api/fitness/days/")) patches++;
  });
  await another.reload();
  await context.setOffline(false);
  await expect
    .poll(async () =>
      // Retrying this read's ECONNRESET never retries the counted mutation.
      (await (await another.request.get("/api/fitness", { maxRetries: 2 })).json()).data.days.some(
        (day: { waterMl: number }) => day.waterMl === 250,
      ),
    )
    .toBe(true);
  expect(patches).toBe(1);
  await context.setOffline(true);
  await page.goto("/books/discover");
  await expect(page.getByRole("heading", { name: "This view is not available offline." })).toBeVisible();
  await context.setOffline(false);
  await another.close();
  await page.goto("/fitness");
  await expect(page.locator('data[value="250"]')).toBeVisible();
  expect(patches).toBe(1);
});

test("multi-year data measurements and quota failure keep pending operations recoverable", async ({
  page,
  context,
}, testInfo) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  const id = await userId(user.username);
  await seedLargeDataset(id);
  const metrics: Record<string, unknown> = {};
  for (const app of ["fitness", "recipes"]) {
    const measurements = await page.evaluate(async (app) => {
      const start = performance.now();
      const data = await (await fetch(`/api/${app}`)).json();
      const responseMs = performance.now() - start;
      const stringifyStart = performance.now();
      const serialized = JSON.stringify(data);
      return {
        responseMs,
        serializationMs: performance.now() - stringifyStart,
        bytes: new TextEncoder().encode(serialized).byteLength,
      };
    }, app);
    const started = performance.now();
    await controlled(page, `/${app}`);
    if (app === "fitness") await expect(page.getByRole("button", { name: "250 ml", exact: true })).toBeVisible();
    else await expect(page.getByRole("button", { name: "Favourite Measured recipe 1", exact: true })).toBeVisible();
    metrics[app] = { ...measurements, documentAndRenderMs: performance.now() - started };
  }
  // This snapshot exceeded localStorage in the initial measurement. Verify
  // the larger view is now kept in IndexedDB, then inject a real browser
  // quota exception to exercise the independent durable pending journal.
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const request = indexedDB.open("diogomota-offline-queries-v1", 1);
          request.onsuccess = () => resolve(request.result);
        });
        return new Promise<boolean>((resolve) => {
          const request = db.transaction("snapshots").objectStore("snapshots").get(`diogomota-cache:${id}:recipes:v1`);
          request.onsuccess = () => {
            resolve(
              request.result?.clientState.queries.some(
                (query: { state: { data?: unknown[] } }) => query.state.data?.length === 1000,
              ) ?? false,
            );
            db.close();
          };
        });
      }, id),
    )
    .toBe(true);
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException("Injected cache quota failure", "QuotaExceededError");
    };
  });
  await context.setOffline(true);
  await page.getByRole("button", { name: "Favourite Measured recipe 1", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => key.includes(":recipes:") && key.endsWith(":pending"))
          .some((key) => JSON.parse(localStorage.getItem(key)!).mutations.length === 1),
      ),
    )
    .toBe(true);
  await expect(page.getByRole("alert").filter({ hasText: "Offline views could not be saved" })).toBeVisible();
  const storage = await page.evaluate(() => {
    const start = performance.now();
    const bytes = Object.keys(localStorage).reduce(
      (sum, key) => sum + new TextEncoder().encode(localStorage.getItem(key)!).byteLength,
      0,
    );
    return { storedUtf8Bytes: bytes, readAndCountMs: performance.now() - start };
  });
  metrics.storage = storage;
  console.log("S04 measurements", JSON.stringify(metrics));
  await testInfo.attach("S04-measurements.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Favourite Measured recipe 1", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await context.setOffline(false);
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/recipes")).json()).data.find(
          (recipe: { title: string }) => recipe.title === "Measured recipe 1",
        ).isFavourite,
    )
    .toBe(true);
});

test("legacy queues from an old release migrate by app and Shows additions resume with reconciliation", async ({
  page,
}) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  const id = await userId(user.username);
  const mutation = (key: string[], variables: object) => ({
    mutationKey: key,
    state: {
      context: null,
      data: null,
      error: null,
      failureCount: 0,
      failureReason: null,
      isPaused: true,
      status: "pending",
      variables,
      submittedAt: Date.now(),
    },
  });
  const snapshot = {
    timestamp: 1,
    buster: "v0-before-patch",
    clientState: {
      queries: [],
      mutations: [
        mutation(["fitness", "change"], { kind: "goals", fields: { waterMl: 3000 } }),
        mutation(["shows", "library-add"], { title: { type: "movie", tmdbId: mockBase + 1 }, status: "planned" }),
      ],
    },
  };
  await page.evaluate(({ id, snapshot }) => localStorage.setItem(`diogomota-cache:${id}`, JSON.stringify(snapshot)), {
    id,
    snapshot,
  });
  await page.goto("/books");
  await expect(page.getByRole("navigation", { name: "Books", exact: true })).toBeVisible();
  await page.goto("/shows");
  await expect.poll(async () => (await (await page.request.get("/api/shows/library")).json()).data.length).toBe(1);
  await page.reload();
  expect((await (await page.request.get("/api/shows/library")).json()).data).toHaveLength(1);
  await page.goto("/fitness");
  await expect.poll(async () => (await (await page.request.get("/api/fitness")).json()).data.goals.waterMl).toBe(3000);
  await page.reload();
  expect(
    await page.evaluate(
      (id) => JSON.parse(localStorage.getItem(`diogomota-cache:${id}`)!).clientState.mutations.length,
      id,
    ),
  ).toBe(2);
});

test("successful password logout clears other tabs and private documents; failed validation preserves queues", async ({
  page,
  context,
}) => {
  const user = newUser();
  await signUp(page, user, "/signup?next=/books");
  await expect(page).toHaveURL("/books");
  await page.request.post("/api/books", { data: { title: "PRIVATE_A_SHOULD_DISAPPEAR" } });
  await controlled(page, "/books");
  const other = await context.newPage();
  await other.goto("/fitness");
  await expect(other.getByRole("button", { name: "250 ml", exact: true })).toBeVisible();
  await page.goto("/account");
  await page.evaluate(() => localStorage.setItem("diogomota-cache:recovery-sentinel", "pending-work"));
  // A navigation or forged link is not authorization to delete pending work.
  await page.goto("/session-transition?next=/&login=0");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("diogomota-cache:recovery-sentinel"))).toBe("pending-work");
  await page.goto("/account");
  await accountSetting(page, "Password").click();
  const form = page.getByRole("dialog", { name: "Update password" });
  await form.getByLabel("Current password").fill("incorrect password");
  await form.getByLabel("New password", { exact: true }).fill("new correct horse password");
  await form.getByLabel("Confirm new password").fill("new correct horse password");
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(form.getByText("That isn't your current password.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("diogomota-cache:recovery-sentinel"))).toBe("pending-work");
  await form.getByLabel("Current password").fill(user.password);
  await form.getByLabel("New password", { exact: true }).fill("new correct horse password");
  await form.getByLabel("Confirm new password").fill("new correct horse password");
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/login\?password=changed/);
  await expect(other).toHaveURL("/login");
  expect(await page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("diogomota-cache:")))).toBe(
    false,
  );
  expect(await page.evaluate(async () => !!(await caches.match(location.origin + "/books")))).toBe(false);
  await context.setOffline(true);
  await page.goto("/books").catch(() => {});
  await expect(page.getByText("PRIVATE_A_SHOULD_DISAPPEAR")).toHaveCount(0);
  await context.setOffline(false);
  const next = newUser();
  await signUp(page, next, "/signup?next=/books");
  await expect(page).toHaveURL("/books");
  await controlled(page, "/books");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("PRIVATE_A_SHOULD_DISAPPEAR")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Books", exact: true })).toBeVisible();
});

test("production nginx and Next accept bounded photos; reject oversized, chunked and malformed bodies", async ({
  page,
  context,
}) => {
  await signUp(page, newUser(), "/signup?next=/recipes");
  await expect(page).toHaveURL("/recipes");
  const recipe = (await (await page.request.post("/api/recipes", { data: { title: "Upload boundaries" } })).json())
    .data;
  const cookie = (await context.cookies()).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const nginx = await isolatedNginx(cookie);
  try {
    for (const side of [2048, 2600]) {
      const png = await sharp(randomBytes(side * side * 3), { raw: { width: side, height: side, channels: 3 } })
        .png({ compressionLevel: 0 })
        .toBuffer();
      expect(png.length).toBeGreaterThan(10 * 1024 * 1024);
      expect(png.length).toBeLessThan(20 * 1024 * 1024);
      const response = await page.request.post(`/api/recipes/${recipe.id}/photos`, {
        multipart: { photo: { name: "large.png", mimeType: "image/png", buffer: png } },
      });
      expect(response.status(), await response.text()).toBe(201);
      const multipart = photoMultipart(png);
      const proxied = await nginx.request(`/api/recipes/${recipe.id}/photos`, multipart.body, multipart.contentType);
      expect(proxied.status, proxied.body).toBe(201);
    }
    const oversized = await page.request.post(`/api/recipes/${recipe.id}/photos`, {
      multipart: { photo: { name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(20 * 1024 * 1024 + 1) } },
    });
    expect(oversized.status()).toBe(413);
    const malformed = await page.request.post(`/api/recipes/${recipe.id}/photos`, {
      headers: { "content-type": "multipart/form-data; boundary=broken" },
      data: "not multipart",
    });
    expect(malformed.status()).toBe(400);
    const multipart = photoMultipart(Buffer.alloc(20 * 1024 * 1024 + 1));
    expect(
      (await nginx.request(`/api/recipes/${recipe.id}/photos`, multipart.body, multipart.contentType)).status,
    ).toBe(413);
    expect(
      (await nginx.request(`/api/recipes/${recipe.id}/photos`, multipart.body, multipart.contentType, true)).status,
    ).toBe(413);
    expect(
      (
        await nginx.request(
          `/api/recipes/${recipe.id}/photos`,
          Buffer.from("broken"),
          "multipart/form-data; boundary=broken",
        )
      ).status,
    ).toBe(400);
  } finally {
    await nginx.cleanup();
  }
});

test("logout upgrades a legacy worker without a cleanup handler before completing local cleanup", async ({ page }) => {
  await signUp(page, newUser());
  await expect(page).toHaveURL("/");
  await page.goto("/account");
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/api/test/legacy-worker", { scope: "/" });
  });
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL.includes("/api/test/legacy-worker")))
    .toBe(true);
  await page.evaluate(async () => {
    const cache = await caches.open("diogomota-offline-v1");
    await cache.put(location.origin + "/fitness", new Response("PRIVATE_LEGACY_DOCUMENT"));
  });
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL("/");
  expect(await page.evaluate(async () => !!(await caches.match(location.origin + "/fitness")))).toBe(false);
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL.endsWith("/sw.js"))).toBe(true);
});

test("unsupported journals remain unchanged, pause editing, and can be downloaded for recovery", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  const id = await userId(user.username);
  const raw = JSON.stringify({
    format: "future-format-v99",
    mutations: [
      { mutationKey: ["fitness", "unknown-operation"], state: { variables: { privatePendingValue: "recover-me" } } },
    ],
  });
  const key = `diogomota-cache:${id}:fitness:v1:pending`;
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
  await page.goto("/fitness");
  await expect(page.getByRole("alert").filter({ hasText: "queue needs recovery" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(raw);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download pending changes" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("diogomota-pending-changes.json");
  const recovered = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(recovered.entries[key]).toBe(raw);
  expect((await (await page.request.get("/api/fitness")).json()).data.days).toEqual([]);
});

test("browsers without Web Locks retain connected use and explicitly reject offline edits", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "locks", { value: undefined }));
  await signUp(page, newUser(), "/signup?next=/fitness");
  await expect(page).toHaveURL("/fitness");
  await expect(page.getByRole("alert").filter({ hasText: "Offline saving is unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: "250 ml", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "250 ml", exact: true }).click();
  await expect
    .poll(async () =>
      (await (await page.request.get("/api/fitness")).json()).data.days.some(
        (day: { waterMl: number }) => day.waterMl === 250,
      ),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.getByRole("button", { name: "250 ml", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Reconnect before changing data" })).toBeVisible();
  await expect(page.locator('data[value="250"]')).toBeVisible();
});

test("an acknowledged write leaving its view is drained before another journal owner replays it", async ({
  page,
  context,
}) => {
  await signUp(page, newUser(), "/signup?next=/fitness");
  await expect(page).toHaveURL("/fitness");
  await expect(page.getByRole("button", { name: "250 ml", exact: true })).toBeVisible();
  let sent!: () => void;
  let release!: () => void;
  let calls = 0;
  const received = new Promise<void>((resolve) => {
    sent = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await context.route("**/api/fitness/days/*", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    calls++;
    const response = await route.fetch();
    sent();
    await released;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "250 ml", exact: true }).click();
  await received;
  await page.getByRole("link", { name: "Apps", exact: true }).click();
  await page.locator('main a[href="/books"]').click();
  await expect(page).toHaveURL("/books");
  release();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => key.includes(":fitness:") && key.endsWith(":pending"))
          .every((key) => JSON.parse(localStorage.getItem(key)!).mutations.length === 0),
      ),
    )
    .toBe(true);
  await page.goto("/fitness");
  await expect(page.locator('data[value="250"]')).toBeVisible();
  expect(calls).toBe(1);
});

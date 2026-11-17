import { emailsTo, expect, newUser, signUp, test } from "./fixtures";

// /about: who runs the site, in the website's frame (docs/decisions/0016), as
// the front page is: its header, the intro, what the site is, Get in touch, and its footer.

/** CONTACT_EMAIL on the tests' server (playwright.config.ts): where Get in touch sends. */
const contactAddress = "contact@example.com";

test("about is in the website's look: its header and footer, the intro, and what the site is", async ({ page }) => {
  await page.goto("/about");
  // Light, logged out, as the front page: not black any more.
  await expect(page.locator("[data-theme]")).toHaveAttribute("data-theme", "minimal-neutrals");
  await expect(page.locator("[data-theme]")).toHaveCSS("background-color", "rgb(230, 230, 230)");
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText("Diogo Mota");
  await expect(main).toContainText("DevOps engineer based in Lisbon, Portugal");
  await expect(main).not.toContainText("Richemont");
  // No button to the apps: the header has them.
  await expect(page.getByRole("link", { name: "See the apps" })).toHaveCount(0);

  // What the site is, in Diogo's own words, with a link to each app's section and to Privacy.
  const site = main.getByRole("region", { name: "This site" });
  await expect(site).toContainText("diogomota.com is where I build small apps");
  await expect(site).toContainText("I make them for my friends and family");
  await expect(site).not.toContainText("Diogo makes");
  await expect(site).toContainText(
    "Shared, a calendar for two, Shows, a watchlist with your friends, Recipes, a recipe box with a shopping list, Fitness, a workout and health tracker, and Books, a bookshelf and reading tracker.",
  );
  await expect(site.getByRole("link", { name: "Shared", exact: true })).toHaveAttribute("href", "/#shared");
  await expect(site.getByRole("link", { name: "Shows", exact: true })).toHaveAttribute("href", "/#shows");
  await expect(site.getByRole("link", { name: "Recipes", exact: true })).toHaveAttribute("href", "/#recipes");
  await expect(site.getByRole("link", { name: "Fitness", exact: true })).toHaveAttribute("href", "/#fitness");
  await expect(site.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");

  // The header, with About marked, and the footer.
  const nav = page.getByRole("banner").getByRole("navigation", { name: "Site" });
  await expect(nav.getByRole("link", { name: "About" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("contentinfo").getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("contentinfo")).toContainText(`\u00a9 ${new Date().getFullYear()} Diogo Mota`);
});

test("Get in touch is a form that emails Diogo, without showing his address", async ({ page, request }) => {
  await page.goto("/about");
  const contact = page.getByRole("main").getByRole("region", { name: "Get in touch" });
  // The address is nowhere on the page, nor in what was sent to the browser.
  expect(await page.content()).not.toContain(contactAddress);
  await expect(page.locator("a[href^='mailto:']")).toHaveCount(0);

  // Empty, each field says what it needs, and nothing is sent.
  const send = contact.getByRole("button", { name: "Send message" });
  await send.click();
  await expect(contact.getByLabel("Your name")).toHaveAttribute("aria-invalid", "true");
  await expect(contact).toContainText("Enter your name.");
  await expect(contact).toContainText("Enter your email.");
  await expect(contact).toContainText("Write your message.");

  // Filled in, it goes to CONTACT_EMAIL, with the sender to reply to; the fields empty.
  const message = `Hello from the tests ${Date.now()}.
A second line.`;
  await contact.getByLabel("Your name").fill("Ana Test");
  await contact.getByLabel("Your email").fill("ana@example.com");
  await contact.getByLabel("Message").fill(message);
  await send.click();
  await expect(contact.getByRole("status")).toHaveText(
    "Thanks! Your message is on its way, and I'll reply to the email you gave.",
  );
  await expect(contact.getByLabel("Message")).toHaveValue("");
  const sent = (await emailsTo(request, contactAddress, "Message from Ana Test on diogomota.com")).filter((email) =>
    email.text.includes(message),
  );
  expect(sent).toHaveLength(1);
  expect(sent[0].replyTo).toBe("ana@example.com");
  expect(sent[0].text).toContain("From: Ana Test <ana@example.com>");
});

test("Privacy sends questions to About's form, not to an address", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.locator("a[href^='mailto:']")).toHaveCount(0);
  await page.getByRole("main").getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL("/about#contact");
  await expect(page.getByRole("region", { name: "Get in touch" })).toBeInViewport();
});

test("about has a title, the intro as its description and its own preview image", async ({ page }) => {
  await page.goto("/about");
  await expect(page).toHaveTitle("about · diogo mota");

  const meta = (attribute: string, value: string) => page.locator(`head meta[${attribute}="${value}"]`);
  await expect(meta("name", "description")).toHaveAttribute(
    "content",
    "Diogo Mota, DevOps engineer based in Lisbon, Portugal.",
  );
  await expect(meta("property", "og:title")).toHaveAttribute("content", "diogo mota");
  await expect(meta("property", "og:description")).toHaveAttribute("content", /Lisbon, Portugal/);
  await expect(meta("property", "og:url")).toHaveAttribute("content", "https://diogomota.com/about");
  await expect(meta("property", "og:type")).toHaveAttribute("content", "website");
  // The dev server puts its own origin here; production builds use https://diogomota.com.
  await expect(meta("property", "og:image")).toHaveAttribute("content", /^https?:\/\/[^/]+\/about\/opengraph-image\b/);

  const image = await page.request.get("/about/opengraph-image");
  expect(image.ok()).toBe(true);
  expect(image.headers()["content-type"]).toBe("image/png");
});

test("about is in the system font, as the rest of the site, with nothing from other sites", async ({
  page,
  baseURL,
}) => {
  const requests: URL[] = [];
  page.on("request", (request) => requests.push(new URL(request.url())));
  await page.goto("/about");
  await page.evaluate(() => document.fonts.ready);

  const family = await page
    .getByRole("heading", { level: 1 })
    .evaluate((h1) => getComputedStyle(h1).fontFamily.split(",")[0].trim());
  expect(family).toBe("system-ui");
  // Not counting the dev server's own tools: their badge loads a font while it says "Compiling".
  const fonts = requests.filter(
    (url) => /\.(woff2?|ttf|otf)$/.test(url.pathname) && !url.pathname.startsWith("/__nextjs"),
  );
  expect(fonts.map(String)).toEqual([]);
  const origin = new URL(baseURL!).origin;
  expect(requests.filter((url) => url.origin !== origin).map(String)).toEqual([]);
});

test("logged in, about's header has Account and Your apps, and the apps' links open them", async ({ page }) => {
  const user = newUser();
  await signUp(page, user);
  await expect(page).toHaveURL("/");
  await page.goto("/about");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
  await expect(header.getByRole("link", { name: "Your apps" })).toHaveAttribute("href", "/");
  await expect(header.getByRole("link", { name: "Log in" })).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("region", { name: "This site" }).getByRole("link", { name: "Shows", exact: true }),
  ).toHaveAttribute("href", "/shows");
});

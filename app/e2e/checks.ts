import AxeBuilder from "@axe-core/playwright";
import { test, type Page } from "@playwright/test";
import { expect } from "./fixtures";

// The checks views.spec.ts runs on every view of the site and the apps, at the
// sizes of the project running: the mobile project's 390x844 phone and a 375x812
// one, or the desktop project's 1280x800.

const phoneSizes = [{ width: 390, height: 844 }, { width: 375, height: 812 }];
const desktopSize = { width: 1280, height: 800 };

/** The home indicator of an iPhone without a home button: what the bottom bar and sheets stay clear of. */
const homeIndicator = 34;

/** Gives the phone a home indicator (CDP emulates the safe area insets, which env() then reads). */
export async function emulateHomeIndicator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, right: 0, bottom: homeIndicator, left: 0 } });
}

/**
 * What is wrong with the layout showing now, as sentences. Everywhere: nothing
 * scrolls sideways, the page or an open dialog. On a phone also: tap targets are
 * at least 44px both ways, text fields have 16px text (smaller makes iOS zoom in
 * on focus), and the bottom bar, sheets and toasts keep clear of the home
 * indicator. Runs in the page, so it can't use anything from outside.
 */
function layoutProblems({ phone, bottomInset }: { phone: boolean; bottomInset: number }): string[] {
  const problems: string[] = [];
  const name = (el: Element) => {
    const label = el.getAttribute("aria-label") ?? el.textContent?.trim().replace(/\s+/g, " ").slice(0, 40);
    const className = typeof el.className === "string" && el.className ? `.${el.className.split(" ")[0]}` : "";
    return `<${el.tagName.toLowerCase()}${className}> "${label}"`;
  };
  const root = document.documentElement;
  if (root.scrollWidth > root.clientWidth) problems.push(`the page is ${root.scrollWidth}px wide in a ${root.clientWidth}px window`);
  // Dialogs are modal: what is under the top one can't be used.
  const dialog = [...document.querySelectorAll("dialog[open]")].at(-1);
  if (dialog) {
    if (dialog.scrollWidth > dialog.clientWidth + 1) problems.push(`${name(dialog)} is cut off: ${dialog.scrollWidth}px wide in ${dialog.clientWidth}px`);
    for (const el of dialog.querySelectorAll("*")) {
      if (["auto", "scroll"].includes(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1) {
        problems.push(`${name(el)} scrolls sideways: ${el.scrollWidth}px wide in ${el.clientWidth}px`);
      }
    }
  }
  if (!phone) return problems;

  // Not shown (display: none, a hidden view), or only there for screen readers.
  const shown = (el: Element) => { const box = el.getBoundingClientRect(); return box.width > 1 && box.height > 1; };
  const scope = dialog ?? document;
  const targets = [...scope.querySelectorAll<HTMLElement>(
    "a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex='-1'])",
  )].filter((el) => shown(el) && getComputedStyle(el).visibility !== "hidden" && (dialog || !el.closest("dialog")));
  for (const el of targets) {
    // A link or button within a sentence is as tall as the line (WCAG 2.5.8's inline exception).
    const inSentence = [...el.parentElement!.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim());
    if (el.matches("a, button") && inSentence) continue;
    let box = el.getBoundingClientRect();
    // Checkboxes and radios are tapped through their label.
    const label = el.matches("input[type=checkbox], input[type=radio]") ? el.closest("label") : null;
    if (label) box = label.getBoundingClientRect();
    // A link stretched over its card by an ::after.
    const after = getComputedStyle(el, "::after");
    if (after.content !== "none" && after.position === "absolute" && el.offsetParent) box = el.offsetParent.getBoundingClientRect();
    if (box.width < 43.5 || box.height < 43.5) problems.push(`${name(el)} is ${Math.round(box.width)}x${Math.round(box.height)}px, under 44x44`);
  }
  for (const el of scope.querySelectorAll<HTMLElement>("input:not([type=checkbox], [type=radio], [type=hidden]), select, textarea")) {
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 16 && shown(el)) problems.push(`${name(el)} has ${size}px text, under 16px`);
  }

  // The safe area: whatever is fixed to the bottom (the bottom bar's tabs, a toast)
  // and the last control of a sheet or full-screen panel, scrolled to its end.
  const limit = innerHeight - bottomInset;
  const fixed = [...document.querySelectorAll<HTMLElement>("body *")].filter((el) =>
    getComputedStyle(el).position === "fixed" && shown(el) && !el.closest("dialog"));
  for (const el of fixed) {
    const inside = [...el.querySelectorAll("a[href], button")];
    for (const target of inside.length ? inside : [el]) {
      if (target.getBoundingClientRect().bottom > limit + 0.5) problems.push(`${name(target)} is under the home indicator`);
    }
  }
  if (dialog && dialog.getBoundingClientRect().bottom >= innerHeight - 1) {
    for (const el of [dialog, ...dialog.querySelectorAll("*")]) {
      if (["auto", "scroll"].includes(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight;
    }
    const last = Math.max(...targets.map((el) => el.getBoundingClientRect().bottom));
    if (last > limit + 0.5) problems.push(`the end of ${name(dialog)} is under the home indicator`);
  }
  return problems;
}

/** axe's serious and critical findings, other than in Next.js's dev tools. */
async function seriousAxeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).exclude("nextjs-portal").analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((node) => node.target.join(" ")).join("\n    ")}`);
}

/** Shows an app in a theme without saving it: every color comes from the shell's data-theme. */
async function showTheme(page: Page, theme: string) {
  await page.locator("[data-theme]").evaluate((shell, value) => shell.setAttribute("data-theme", value), theme);
}

/**
 * Checks what is showing now: its layout at each of the project's sizes, then
 * axe, in both themes inside the apps (the site's pages are always black).
 */
export async function checkView(page: Page, view: string) {
  await test.step(`check ${view}`, async () => {
    const phone = !!test.info().project.use.isMobile;
    const sizes = phone ? phoneSizes : [desktopSize];
    for (const size of sizes) {
      await page.setViewportSize(size);
      const problems = await page.evaluate(layoutProblems, { phone, bottomInset: homeIndicator });
      expect(problems, `${view} at ${size.width}x${size.height}`).toEqual([]);
    }
    await page.setViewportSize(sizes[0]);

    const shell = page.locator("[data-theme]");
    if (!await shell.count()) {
      expect(await seriousAxeViolations(page), view).toEqual([]);
      return;
    }
    const saved = (await shell.getAttribute("data-theme"))!;
    for (const theme of ["light", "dark"]) {
      await showTheme(page, theme);
      expect(await seriousAxeViolations(page), `${view}, ${theme} theme`).toEqual([]);
    }
    await showTheme(page, saved);
  });
}

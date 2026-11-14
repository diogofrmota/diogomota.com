import type { Page } from "@playwright/test";
import { expect, newUser, signUp, test } from "./fixtures";

// The motion system (lib/motion.ts, components/common/motion.tsx, Dialog.tsx),
// with motion on: every other spec runs with reduced motion (playwright.config.ts),
// so nothing is caught half way. What is checked here is what can be measured
// without racing the clock: where a popup grows from, that its exit is played by
// a copy that then goes, that a segmented control's thumb is one object that
// moves (and stretches), and that reduced motion turns all of it off.

async function sharedCalendar(page: Page) {
  await signUp(page, newUser(), "/signup?next=/shared");
  await page.getByRole("button", { name: "Create space" }).click();
  await expect(page.getByRole("region", { name: "month calendar" })).toBeVisible();
}

/** Starts recording the leaving copies (Dialog.tsx, leavingCopy) put on the page from now on. */
async function watchLeavingCopies(page: Page) {
  await page.evaluate(() => {
    const seen: { added: number; removed: number } = { added: 0, removed: 0 };
    Object.assign(window, { leavingCopies: seen });
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes)
          if (node instanceof HTMLElement && node.matches("[popover][inert][aria-hidden]")) seen.added++;
        for (const node of record.removedNodes)
          if (node instanceof HTMLElement && node.matches("[popover][inert][aria-hidden]")) seen.removed++;
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}
const leavingCopies = (page: Page) =>
  page.evaluate(() => (window as unknown as { leavingCopies: { added: number; removed: number } }).leavingCopies);

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("a popup grows from 0.95 out of what opened it, and leaves back into it as a copy that then goes", async ({
    page,
  }) => {
    await sharedCalendar(page);
    const add = page.getByRole("button", { name: "Add event", exact: true });
    const widthBefore = await page.evaluate(() => document.documentElement.clientWidth);
    await add.click();
    const dialog = page.getByRole("dialog", { name: "Create a new event" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS("animation-name", /popup-in/);
    // Its origin is the middle of the button that opened it (measured once it has grown in).
    const origin = await dialog.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
      const [x, y] = getComputedStyle(element).transformOrigin.split(" ").map(parseFloat);
      const box = element.getBoundingClientRect();
      return { x: box.left + x, y: box.top + y };
    });
    const button = (await add.boundingBox())!;
    expect(Math.abs(origin.x - (button.x + button.width / 2))).toBeLessThan(2);
    expect(Math.abs(origin.y - (button.y + button.height / 2))).toBeLessThan(2);
    // The page behind keeps its width while it can't scroll (no layout shift).
    expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(widthBefore);

    await watchLeavingCopies(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    // A copy played the exit, hidden from screen readers and taking no taps, then went.
    await expect.poll(() => leavingCopies(page)).toEqual({ added: 1, removed: 1 });
    await expect(add).toBeFocused();
  });

  test("a segmented control's thumb is one object that slides (and stretches) to the option chosen", async ({
    page,
  }) => {
    await sharedCalendar(page);
    const group = page.getByRole("group", { name: "Calendar view" });
    const thumb = group.locator("[aria-hidden=true]:not(:has(*))").filter({ hasNotText: /./ });
    await expect(group.getByRole("button", { name: "Month", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(thumb).toHaveCount(1);
    // Pressed and checked in one go, in the page, so the move is seen while it runs.
    const move = await group.evaluate(async (element) => {
      element.querySelector<HTMLButtonElement>("button[aria-pressed=false]")!.click();
      await new Promise(requestAnimationFrame);
      const thumbs = element.querySelectorAll("button > span[aria-hidden=true]:empty");
      const animation = [...thumbs].flatMap((span) => span.getAnimations()).find((a) => a.id === "layout");
      const keyframes = (animation?.effect as KeyframeEffect | undefined)?.getKeyframes() ?? [];
      // Half way, it is in its track, though Agenda's toolbar is laid out elsewhere than Month's.
      if (animation) animation.currentTime = 130;
      const [track, at] = [element.getBoundingClientRect(), thumbs[0].getBoundingClientRect()];
      return {
        inTrack: at.left >= track.left - 8 && at.right <= track.right + 8 && at.top >= track.top - 1,
        thumbs: thumbs.length,
        inside: thumbs[0]?.parentElement?.textContent,
        moving: !!animation,
        // Three poses: where it was, stretched at the middle, where it is.
        stretched: keyframes.length === 3 && keyframes[1].offset === 0.5,
      };
    });
    expect(move).toEqual({
      inTrack: true,
      thumbs: 1,
      inside: expect.stringContaining("Agenda"),
      moving: true,
      stretched: true,
    });
    await expect(group.getByRole("button", { name: "Agenda", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
});

test("with reduced motion, nothing moves: no copy plays a popup's exit, and a thumb jumps", async ({ page }) => {
  await sharedCalendar(page);
  await watchLeavingCopies(page);
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create a new event" });
  await expect(dialog).toHaveCSS("animation-name", "none");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  expect(await leavingCopies(page)).toEqual({ added: 0, removed: 0 });

  const group = page.getByRole("group", { name: "Calendar view" });
  const moving = await group.evaluate(async (element) => {
    element.querySelector<HTMLButtonElement>("button[aria-pressed=false]")!.click();
    await new Promise(requestAnimationFrame);
    return [...element.querySelectorAll("span")].some((span) => span.getAnimations().some((a) => a.id === "layout"));
  });
  expect(moving).toBe(false);
});

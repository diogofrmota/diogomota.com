"use client";
import { useLayoutEffect, useRef } from "react";
import { exitMs, motion } from "@/lib/motion";
import { reducedMotion } from "./motion";
import styles from "./Dialog.module.css";

/**
 * Whether a popup can start with its text field focused: with a mouse, yes; on
 * a touch screen, no, since the keyboard would come up over the popup before
 * it's seen (the field is a tap away). False on the server.
 */
export function typesFirst(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
}

type Box = Pick<DOMRect, "left" | "top" | "width" | "height">;
/**
 * What a popup came out of: the element pressed or focused to open it (and its
 * box then), or a point. `zoom`: it grows out of the element from the
 * element's size, and shrinks back into it (a folder's tile), rather than
 * from 0.95 of its own.
 */
export type Trigger = { element?: Element; box: Box; zoom?: boolean };

// The last press anywhere (a click or a tap starts with one): what a popup
// opened by it comes out of, and goes back into. Its box is kept too, for one
// that is gone by then (an option of the popup before).
let lastPress: (Trigger & { at: number }) | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const element = target?.closest("button, a, label, [role=button], [role=option], li") ?? target;
      if (element) lastPress = { element, box: element.getBoundingClientRect(), at: performance.now() };
    },
    { capture: true, passive: true },
  );
}

/**
 * What opened `popup` just now: the element pressed (within the last moment),
 * or the one focused (the keyboard), or nothing (a link, Back): then it comes
 * out of its own middle.
 */
export function triggerOf(popup: Element, focused: Element | null): Trigger | null {
  if (lastPress && performance.now() - lastPress.at < 1500 && !popup.contains(lastPress.element!)) return lastPress;
  if (focused && focused !== document.body && !popup.contains(focused))
    return { element: focused, box: focused.getBoundingClientRect() };
  return null;
}

/**
 * The trigger's middle, now, from `popup`'s top left: where it grows from and
 * shrinks back to. Measured with its animation held back, so its box is its
 * own and not the 0.95 it starts at.
 */
function placeOrigin(popup: HTMLElement, trigger: Trigger | null) {
  if (!trigger) return popup.style.removeProperty("--origin");
  const at = trigger.element?.isConnected ? trigger.element.getBoundingClientRect() : trigger.box;
  const animation = popup.style.animation;
  popup.style.animation = "none";
  const box = popup.getBoundingClientRect();
  popup.style.animation = animation;
  const x = at.left + at.width / 2 - box.left;
  const y = at.top + at.height / 2 - box.top;
  popup.style.setProperty("--origin", `${Math.round(x)}px ${Math.round(y)}px`);
}

/** Where the trigger is now: its element's box, or the box it had (an element that is gone). */
const boxOf = (trigger: Trigger): Box =>
  trigger.element?.isConnected ? trigger.element.getBoundingClientRect() : trigger.box;

/**
 * The transform that puts `box`, scaled about its middle and keeping its
 * proportions, over `at`: as big as fits inside it, on its middle.
 */
function zoomedInto(box: Box, at: Box): string {
  const scale = Math.min(at.width / box.width, at.height / box.height);
  const dx = at.left + at.width / 2 - (box.left + box.width / 2);
  const dy = at.top + at.height / 2 - (box.top + box.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

/**
 * A popup growing out of its trigger (a folder's tile), as a phone's folder
 * opens: from the trigger's size and place to its own, easing out, and
 * showing in its first moment, so the tile looks to become it. Only transform
 * and opacity, which the compositor runs smoothly whatever the page is doing.
 * Its CSS animation is off (data-zoom, Dialog.module.css). Nothing with
 * reduced motion.
 */
function growFrom(popup: HTMLElement, trigger: Trigger) {
  if (reducedMotion()) return;
  // Measured as itself (Strict Mode opens the same dialog twice).
  stopZoom(popup);
  const from = zoomedInto(popup.getBoundingClientRect(), boxOf(trigger));
  const grow = { id: "zoom", duration: motion.zoom, easing: motion.easeOut };
  popup.animate([{ transform: from }, { transform: "none" }], grow);
  popup.animate([{ opacity: 0 }, { opacity: 1 }], { id: "zoom", duration: motion.zoom * 0.3, easing: "linear" });
}

/**
 * Stops `popup` growing (growFrom), if it still is, so its box is its own
 * again; returns how it looked, to go on from there (closed half way in).
 */
function stopZoom(popup: HTMLElement): Keyframe | null {
  const growing = popup.getAnimations().filter((animation) => animation.id === "zoom");
  if (!growing.length) return null;
  const { transform, opacity } = getComputedStyle(popup);
  for (const animation of growing) animation.cancel();
  return { transform, opacity };
}

/**
 * Opens a modal popup, origin-aware: it grows from 0.95 of its size, from what
 * opened it (Dialog.module.css: --origin), or for a `zoom` trigger, out of it
 * from its size (growFrom). For a <dialog> not made by Dialog (the login
 * prompt).
 */
export function openPopup(popup: HTMLDialogElement, trigger: Trigger | null) {
  // The page stops scrolling under a popup (overflow: hidden). If it had a
  // scrollbar, its room is kept meanwhile, so nothing behind moves sideways (no
  // layout shift); measured before the popup opens, while the scrollbar is there.
  const root = document.documentElement;
  if (innerWidth - root.clientWidth > 0) root.style.setProperty("scrollbar-gutter", "stable");
  popup.showModal();
  if (trigger?.zoom) growFrom(popup, trigger);
  else placeOrigin(popup, trigger);
}

/** Once the last popup has closed, the page's scrollbar takes its room back. */
export function releasePage() {
  if (!document.querySelector("dialog[open]")) document.documentElement.style.removeProperty("scrollbar-gutter");
}

/**
 * A popup leaving: a copy of it, as it is now, over everything (the top layer,
 * so over a dialog under it too), shrinks back to 0.95 towards what opened it
 * and fades, with its backdrop; 20% quicker than it came in. For a `zoom`
 * trigger, it shrinks all the way back into it (a folder's tile), fading in
 * its last 45% as the tile comes back (AppFolders.module.css). Taken while the
 * popup is still on screen; `play` once it is gone. Takes no taps, and is
 * hidden from screen readers. Nothing with reduced motion.
 */
export function leavingCopy(popup: HTMLElement, trigger: Trigger | null): { play: () => void } | null {
  if (reducedMotion() || !popup.isConnected || !popup.matches("[open]")) return null;
  const parent = popup.parentElement;
  // Closed while still growing: measured as itself, and leaving from how it looked.
  const now = stopZoom(popup);
  const box = popup.getBoundingClientRect();
  const menu = popup.dataset.kind === "menu";
  const copy = document.createElement("div");
  copy.className = popup.className;
  copy.setAttribute("style", popup.getAttribute("style") ?? "");
  copy.setAttribute("open", "");
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  for (const node of popup.childNodes) copy.append(node.cloneNode(true));
  // What was typed and how far it was scrolled aren't in the copy's markup.
  const originals = popup.querySelectorAll("*");
  const copies = copy.querySelectorAll("*");
  const scrolled: [Element, number, number][] = [[copy, popup.scrollTop, popup.scrollLeft]];
  originals.forEach((original, i) => {
    const twin = copies[i];
    twin.removeAttribute("id");
    if (original instanceof HTMLInputElement) {
      (twin as HTMLInputElement).value = original.value;
      (twin as HTMLInputElement).checked = original.checked;
    } else if (original instanceof HTMLTextAreaElement || original instanceof HTMLSelectElement) {
      (twin as HTMLTextAreaElement).value = original.value;
    }
    if (original.scrollTop || original.scrollLeft) scrolled.push([twin, original.scrollTop, original.scrollLeft]);
  });
  Object.assign(copy.style, {
    position: "fixed",
    inset: "auto",
    top: `${box.top}px`,
    left: `${box.left}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    maxWidth: "none",
    maxHeight: "none",
    margin: "0",
    overflow: "hidden",
    animation: "none",
    pointerEvents: "none",
  });
  return {
    play() {
      if (!parent?.isConnected) return;
      // Where the popup was in the page, so its module's rules (.tasks .dialog …) still reach it.
      copy.setAttribute("popover", "manual");
      parent.append(copy);
      try {
        copy.showPopover();
      } catch {
        copy.style.zIndex = "2147483647";
      }
      for (const [twin, top, left] of scrolled) twin.scrollTo(left, top);
      if (trigger?.zoom) return zoomBack(copy, box, trigger, now);
      // Towards the trigger as it is now (its class gives it transform-origin: var(--origin)).
      placeOrigin(copy, trigger);
      const duration = exitMs(menu ? motion.dropdown : motion.base);
      const options = { duration, easing: motion.easeOut, fill: "forwards" as const };
      const leave = copy.animate(
        [
          { opacity: 1, transform: "scale(1)" },
          { opacity: 0, transform: `scale(${motion.popoverScale})` },
        ],
        options,
      );
      try {
        copy.animate([{ opacity: 1 }, { opacity: 0 }], { ...options, pseudoElement: "::backdrop" });
      } catch {
        // Its backdrop goes when it does.
      }
      void leave.finished.then(
        () => copy.remove(),
        () => copy.remove(),
      );
    },
  };
}

// A leaving copy (at `box`, where the popup was) shrinking back into its
// trigger as it is now, from how the popup looked (`now`: still growing, or
// itself), and fading in its last 45%, with its backdrop; then gone.
function zoomBack(copy: HTMLElement, box: Box, trigger: Trigger, now: Keyframe | null) {
  const duration = exitMs(motion.zoom);
  copy.style.transformOrigin = "50% 50%";
  const from = { transform: now?.transform ?? "none" };
  const shrink = copy.animate([from, { transform: zoomedInto(box, boxOf(trigger)) }], {
    duration,
    easing: motion.easeOut,
    fill: "forwards",
  });
  const fade = { duration: duration * 0.45, delay: duration * 0.55, easing: "linear", fill: "both" as const };
  copy.animate([{ opacity: now?.opacity ?? 1 }, { opacity: 0 }], fade);
  try {
    copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing: motion.easeOut, pseudoElement: "::backdrop" });
  } catch {
    // Its backdrop goes when it does.
  }
  void shrink.finished.then(
    () => copy.remove(),
    () => copy.remove(),
  );
}

// The apps' modals and panels: a modal <dialog> that is open while it is mounted,
// shown for a useAppView panel. Escape, a click on the backdrop and Back close it
// (onClose goes back in history); closing hands focus back to where it was.
// Focus starts on the element marked data-autofocus, if any (a text field only
// where typesFirst), else on the first focusable one (showModal ignores React's
// autoFocus). Dialogs can stack, and the page behind doesn't scroll while one is
// open (AppShell.module.css).
//
// Origin-aware: it grows in from 0.95 of its size, from what opened it (the
// button or card pressed, `origin` for a menu opened at a point), and leaves
// back into it, 20% quicker (leavingCopy: a copy plays the exit once React has
// taken the dialog away). A `menu` (a short list of actions by its trigger) is
// as quick as a dropdown. With `zoomFrom` (a folder's tile), it grows out of
// that element from its size instead, and shrinks back into it.
export function Dialog({
  className,
  style,
  onClose,
  origin,
  kind = "dialog",
  zoomFrom,
  children,
  ...labelling
}: {
  className: string;
  style?: React.CSSProperties;
  onClose: () => void;
  /** Where it was opened from, when that isn't the element pressed (a right click's point). */
  origin?: Box;
  kind?: "dialog" | "menu";
  /** The element it grows out of, from its size, and shrinks back into (a folder's tile), when there is one. */
  zoomFrom?: () => Element | null;
  children: React.ReactNode;
} & ({ "aria-labelledby": string } | { "aria-label": string })) {
  const ref = useRef<HTMLDialogElement>(null);
  // Only a click that also started on the backdrop closes it: lifting the
  // finger of the long press that opened it lands there too.
  const pressedBackdrop = useRef(false);
  const initialOrigin = useRef(origin);
  const initialZoomFrom = useRef(zoomFrom);
  // Before the first paint, so it never shows still closed, nor in place before growing in.
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const zoomElement = initialZoomFrom.current?.();
    const trigger: Trigger | null = zoomElement
      ? { element: zoomElement, box: zoomElement.getBoundingClientRect(), zoom: true }
      : initialOrigin.current
        ? { box: initialOrigin.current }
        : triggerOf(dialog, previous);
    openPopup(dialog, trigger);
    const first = dialog.querySelector<HTMLElement>("[data-autofocus]");
    if (first && (typesFirst() || !first.matches("input, textarea"))) first.focus();
    return () => {
      // Still on the page here (React takes it away after): copied as it looks now.
      const leaving = leavingCopy(dialog, trigger);
      dialog.close();
      releasePage();
      previous?.focus();
      // Played only once it has really gone (Strict Mode closes and reopens the same dialog).
      if (leaving) queueMicrotask(() => !dialog.isConnected && leaving.play());
    };
  }, []);
  // The content fills the dialog, so only a click on the backdrop lands on the dialog itself.
  return (
    <dialog
      ref={ref}
      className={`${className} ${styles.popup}`}
      style={style}
      data-kind={kind}
      data-zoom={zoomFrom ? "" : undefined}
      {...labelling}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedBackdrop.current) onClose();
      }}
    >
      {children}
    </dialog>
  );
}

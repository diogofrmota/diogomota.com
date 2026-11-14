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
/** What a popup came out of: the element pressed or focused to open it (and its box then), or a point. */
export type Trigger = { element?: Element; box: Box };

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

/**
 * Opens a modal popup, origin-aware: it grows from 0.95 of its size, from what
 * opened it (Dialog.module.css: --origin). For a <dialog> not made by Dialog
 * (the login prompt).
 */
export function openPopup(popup: HTMLDialogElement, trigger: Trigger | null) {
  // The page stops scrolling under a popup (overflow: hidden). If it had a
  // scrollbar, its room is kept meanwhile, so nothing behind moves sideways (no
  // layout shift); measured before the popup opens, while the scrollbar is there.
  const root = document.documentElement;
  if (innerWidth - root.clientWidth > 0) root.style.setProperty("scrollbar-gutter", "stable");
  popup.showModal();
  placeOrigin(popup, trigger);
}

/** Once the last popup has closed, the page's scrollbar takes its room back. */
export function releasePage() {
  if (!document.querySelector("dialog[open]")) document.documentElement.style.removeProperty("scrollbar-gutter");
}

/**
 * A popup leaving: a copy of it, as it is now, over everything (the top layer,
 * so over a dialog under it too), shrinks back to 0.95 towards what opened it
 * and fades, with its backdrop; 20% quicker than it came in. Taken while the
 * popup is still on screen; `play` once it is gone. Takes no taps, and is
 * hidden from screen readers. Nothing with reduced motion.
 */
export function leavingCopy(popup: HTMLElement, trigger: Trigger | null): { play: () => void } | null {
  if (reducedMotion() || !popup.isConnected || !popup.matches("[open]")) return null;
  const parent = popup.parentElement;
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
// as quick as a dropdown.
export function Dialog({
  className,
  style,
  onClose,
  origin,
  kind = "dialog",
  children,
  ...labelling
}: {
  className: string;
  style?: React.CSSProperties;
  onClose: () => void;
  /** Where it was opened from, when that isn't the element pressed (a right click's point). */
  origin?: Box;
  kind?: "dialog" | "menu";
  children: React.ReactNode;
} & ({ "aria-labelledby": string } | { "aria-label": string })) {
  const ref = useRef<HTMLDialogElement>(null);
  // Only a click that also started on the backdrop closes it: lifting the
  // finger of the long press that opened it lands there too.
  const pressedBackdrop = useRef(false);
  const initialOrigin = useRef(origin);
  // Before the first paint, so it never shows still closed, nor in place before growing in.
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const trigger = initialOrigin.current ? { box: initialOrigin.current } : triggerOf(dialog, previous);
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

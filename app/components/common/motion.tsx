"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { motion, staggerMs } from "@/lib/motion";
import { CheckIcon, CopyIcon } from "./icons";
import styles from "./Motion.module.css";

// The motion system's parts that need script; its numbers are lib/motion.ts
// (and the shell's CSS tokens, AppShell.module.css). Everything here stands
// still with reduced motion.

/** Whether the user asked for less motion (the system setting). True on the server: nothing to animate there. */
export function reducedMotion(): boolean {
  return typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Box = Pick<DOMRect, "left" | "top" | "width" | "height">;

// The last box of each layoutId's element, taken as it went: the next one with
// that id (mounted in the same update: the option pressed) takes over from it.
// Kept from the top left of its frame (frameOf), not of the screen.
const lastBoxes = new Map<string, { box: Box; at: number }>();
const handoverMs = 400;

/**
 * What a shared element moves within: its control (a group of options) or its
 * tab bar. Its move is measured from there, so when the whole control moves
 * too (Agenda's toolbar is narrower than Month's), the element moves along its
 * track rather than across the screen.
 */
const frameOf = (element: Element) => element.closest('[role="group"], nav') ?? document.documentElement;

function boxInFrame(element: Element): Box {
  const box = element.getBoundingClientRect();
  const frame = frameOf(element).getBoundingClientRect();
  return { left: box.left - frame.left, top: box.top - frame.top, width: box.width, height: box.height };
}

/**
 * Moves `element` from `from` to where it is (FLIP: it is already laid out
 * there; a transform takes it back and lets go), easing in and out. With
 * `stretch`, it stretches along the way, most at the middle and about its own
 * middle, as a knob does.
 */
function slide(element: HTMLElement, from: Box, stretch: boolean) {
  const to = element.getBoundingClientRect();
  if (!to.width || !to.height || !from.width || !from.height) return;
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
  const pose = (x: number, y: number, w: number, h: number) => ({
    transformOrigin: "0 0",
    transform: `translate(${x}px, ${y}px) scale(${w}, ${h})`,
  });
  const halfway: Keyframe[] = [];
  if (stretch) {
    const across = Math.abs(dx) >= Math.abs(dy);
    const [w, h] = [(sx + 1) / 2, (sy + 1) / 2];
    const [sw, sh] = across ? [w * motion.stretch, h] : [w, h * motion.stretch];
    halfway.push({
      ...pose(dx / 2 - ((sw - w) * to.width) / 2, dy / 2 - ((sh - h) * to.height) / 2, sw, sh),
      offset: 0.5,
    });
  }
  element.animate([pose(dx, dy, sx, sy), ...halfway, pose(0, 0, 1, 1)], {
    id: "layout",
    duration: motion.move,
    easing: motion.easeInOut,
  });
}

/**
 * A shared element, as Framer Motion's layoutId: the elements with one id are
 * one object on screen. When one goes and another with its id comes in the same
 * update (the thumb of a segmented control, from the option that was on to the
 * one pressed; a tab's underline), the new one starts where the old one was
 * and moves to its own place and size. Interruptible: a move cut short by the
 * next starts that one from where it had got to (the box is measured as seen).
 * The ref callback is stable per id, so a re-render doesn't restart it.
 */
export function useLayoutId<T extends HTMLElement>(layoutId: string, { stretch = false } = {}) {
  return useCallback(
    (element: T | null) => {
      if (!element) return;
      const before = lastBoxes.get(layoutId);
      lastBoxes.delete(layoutId);
      for (const animation of element.getAnimations()) if (animation.id === "layout") animation.cancel();
      if (before && performance.now() - before.at < handoverMs && !reducedMotion()) {
        // Where it was in its frame, wherever the frame is now.
        const frame = frameOf(element).getBoundingClientRect();
        slide(element, { ...before.box, left: frame.left + before.box.left, top: frame.top + before.box.top }, stretch);
      }
      return () => {
        lastBoxes.set(layoutId, { box: boxInFrame(element), at: performance.now() });
      };
    },
    [layoutId, stretch],
  );
}

/**
 * The raised thumb of a segmented control (Agenda | Month, TV Shows | Movies,
 * a title's status) or a tab's underline: put one in the option that is on,
 * every option of a control with the same `layoutId`, and it slides from one
 * to the other, stretching on the way. Decorative. `className` is its look.
 */
export function SegmentThumb({ layoutId, className = "" }: { layoutId: string; className?: string }) {
  const ref = useLayoutId<HTMLSpanElement>(layoutId, { stretch: true });
  return <span ref={ref} className={`${styles.thumb} ${className}`} aria-hidden="true" />;
}

type Layer = { key: string; node: ReactNode; leaving: boolean; first: boolean };

/**
 * An icon that changes (+ to a tick, Copy to Copied, an icon to a spinner): the
 * new one comes in as the old one goes, both at once and on top of each other,
 * each scaling from a quarter of its size and out of a blur, so neither pops.
 * `swapKey` says which icon it is; a new key swaps. The first one is just there.
 */
export function IconSwap({
  swapKey,
  children,
  className = "",
}: {
  swapKey: string;
  children: ReactNode;
  className?: string;
}) {
  const [layers, setLayers] = useState<Layer[]>(() => [{ key: swapKey, node: children, leaving: false, first: true }]);
  if (layers[layers.length - 1].key !== swapKey) {
    // The one showing leaves (one leaving before it is dropped); this one comes in.
    setLayers([
      ...layers
        .filter((layer) => !layer.leaving && layer.key !== swapKey)
        .map((layer) => ({ ...layer, leaving: true })),
      { key: swapKey, node: children, leaving: false, first: false },
    ]);
  }
  return (
    <span className={`${styles.swap} ${className}`}>
      {layers.map((layer) => (
        <span
          key={layer.key}
          className={styles.layer}
          data-leaving={layer.leaving || undefined}
          data-first={(layer.first && !layer.leaving) || undefined}
          onAnimationEnd={
            layer.leaving
              ? (event) => {
                  if (event.target !== event.currentTarget) return;
                  setLayers((current) => current.filter((other) => !(other.key === layer.key && other.leaving)));
                }
              : undefined
          }
        >
          {layer.leaving ? layer.node : children}
        </span>
      ))}
    </span>
  );
}

/** True for a moment (`ms`) after `show()`: a Copied tick, for one. */
export function useBriefly(ms = 2000): [boolean, () => void] {
  const [until, setUntil] = useState(0);
  useEffect(() => {
    if (!until) return;
    const timer = setTimeout(() => setUntil(0), Math.max(0, until - Date.now()));
    return () => clearTimeout(timer);
  }, [until]);
  const show = useCallback(() => setUntil(Date.now() + ms), [ms]);
  return [until > 0, show];
}

/** Copy's icon, which turns into a tick for a moment once copied (crossfading both ways). */
export function CopiedIcon({ copied }: { copied: boolean }) {
  return <IconSwap swapKey={copied ? "copied" : "copy"}>{copied ? <CheckIcon /> : <CopyIcon />}</IconSwap>;
}

/**
 * Keeps what went (`value` back to null) on screen while its exit plays, for
 * `ms`: render `shown`, and mark it `leaving` (its exit animation, and no taps).
 * A new value while it leaves takes its place at once. With reduced motion, it
 * goes at once.
 */
export function usePresence<T>(value: T | null, ms: number): { shown: T | null; leaving: boolean } {
  const [shown, setShown] = useState(value);
  const [leaving, setLeaving] = useState(false);
  if (value !== null && (value !== shown || leaving)) {
    setShown(value);
    setLeaving(false);
  } else if (value === null && shown !== null && !leaving) {
    if (reducedMotion()) setShown(null);
    else setLeaving(true);
  }
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => {
      setShown(null);
      setLeaving(false);
    }, ms);
    return () => clearTimeout(timer);
  }, [leaving, ms]);
  return { shown, leaving };
}

/**
 * A list's rows come in one after another (`--i`, 30 ms apart) the first time
 * they show; rows added after that come in at once. False until `ready` (the
 * rows are there) and they have had the time to come in.
 */
export function useSettled(ready = true, ms = 700) {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setSettled(true), ms);
    return () => clearTimeout(timer);
  }, [ready, ms]);
  return settled;
}

/** The style of the `index`th row of a staggered list: its `--delay`, none once the list has settled. */
export function stagger(index: number, settled: boolean): CSSProperties {
  return { "--delay": `${settled ? 0 : staggerMs(index)}ms` } as CSSProperties;
}

/** Puts `element` over everything (the top layer, above an open dialog) where the browser can, else on the page. */
function overEverything(element: HTMLElement) {
  element.setAttribute("popover", "manual");
  document.body.append(element);
  try {
    element.showPopover();
  } catch {
    element.style.zIndex = "2147483647";
  }
}

/**
 * Something added flies from `from` into `to` (Shows: a poster into the
 * Library tab), along an arc: across, easing in and out, and up
 * or down on a curve of its own, so its path bends; first a little the other
 * way (a wind-up), then on. It shrinks and fades as it lands, and `to` pulses
 * as it takes it. A copy, over everything, that takes no taps.
 */
export function flyTo(from: Element, to: Element) {
  if (reducedMotion()) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (!a.width || !a.height || !b.width || !b.height) return;
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const reset = "margin:0;padding:0;border:0;background:none;overflow:visible;pointer-events:none;";
  const across = document.createElement("div");
  across.style.cssText = `${reset}position:fixed;inset:auto;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;`;
  const upDown = document.createElement("div");
  upDown.style.cssText = `${reset}width:100%;height:100%;`;
  const copy = from.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  copy.style.cssText = `display:block;width:100%;height:100%;margin:0;object-fit:cover;border-radius:${getComputedStyle(from).borderRadius};box-shadow:0 12px 32px oklch(0 0 0 / 0.35);`;
  upDown.append(copy);
  across.append(upDown);
  overEverything(across);
  const duration = 460;
  const land = Math.max(0.12, Math.min(b.width, b.height) / Math.max(a.width, a.height));
  across.animate([{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }], {
    duration,
    easing: motion.easeInOut,
  });
  upDown.animate([{ transform: "translateY(0)" }, { transform: `translateY(${dy}px)` }], {
    duration,
    // Down: up a little first, then falling into it. Up: rising fast, then settling into it.
    easing: dy > 0 ? "cubic-bezier(0.45, -0.45, 0.75, 0.6)" : "cubic-bezier(0.25, 0.65, 0.4, 1)",
  });
  const flight = copy.animate(
    [
      { transform: "scale(1)", opacity: 1 },
      { transform: "scale(0.85)", opacity: 1, offset: 0.25 },
      { transform: `scale(${land})`, opacity: 0.35 },
    ],
    { duration, easing: motion.easeInOut, fill: "forwards" },
  );
  void flight.finished
    .then(() => {
      across.remove();
      pulse(to.querySelector("svg") ?? to);
    })
    .catch(() => across.remove());
}

/**
 * Success, said once: a ring of the accent (the shell's --pulse, in OKLCH)
 * spreads out from `element` and fades. For what an action just did (a title
 * added, a favourite), not for what was already so when it showed.
 */
export function successPulse(element: Element | null | undefined) {
  if (!element || reducedMotion()) return;
  const color = getComputedStyle(element).getPropertyValue("--pulse").trim() || "rgb(0 0 0 / 0.25)";
  element.animate([{ boxShadow: `0 0 0 0 ${color}` }, { boxShadow: "0 0 0 0.625rem transparent" }], {
    duration: 600,
    easing: motion.easeOut,
  });
}

/** A beat on `element`: it grows a little and back, to say something reached it. */
export function pulse(element: Element) {
  if (reducedMotion()) return;
  element.animate([{ transform: "scale(1)" }, { transform: "scale(1.22)", offset: 0.35 }, { transform: "scale(1)" }], {
    duration: 320,
    easing: motion.easeOut,
  });
}

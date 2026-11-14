/**
 * The motion system's numbers, for what moves from script (the Web Animations
 * API: popups leaving, shared elements, a title flying to the library). The
 * same as the CSS tokens on the app shell (components/common/AppShell.module.css,
 * "Motion"): change both together.
 *
 * - Entrances and exits ease out: they start at once, and settle.
 * - What moves from one place on screen to another eases in and out.
 * - Menus and dropdowns take 150-200 ms, dialogs a little longer; an exit is
 *   20% shorter than its entrance (`exit`): once it's asked to go, it goes.
 * - Popups start at 0.95 of their size (never from nothing), from what opened them.
 * - No bounce (overshoot) on the everyday parts; only a celebration has one.
 */
export const motion = {
  easeOut: "cubic-bezier(0.23, 1, 0.32, 1)",
  easeInOut: "cubic-bezier(0.645, 0.045, 0.355, 1)",
  /** A press, a hover, an icon swapping. */
  fast: 150,
  /** Menus, dropdowns, a list of suggestions. */
  dropdown: 180,
  /** Dialogs, messages, the Undo message. */
  base: 220,
  /** Something moving across the screen: a tab's underline, a switch's thumb. */
  move: 260,
  /** An exit's length, as a share of its entrance's. */
  exit: 0.8,
  /** Between one row of a list coming in and the next. */
  stagger: 30,
  /** How far a knob stretches as it moves (and as it's pressed). */
  stretch: 1.12,
  /** The size a popup starts at, and goes back to as it leaves. */
  popoverScale: 0.95,
} as const;

/** An exit's length for an entrance of `ms`: 20% shorter. */
export const exitMs = (ms: number) => Math.round(ms * motion.exit);

/**
 * How far something dragged `overshoot` pixels past where it can go moves
 * (iOS's rubber band): almost all of it at first, less and less the further it
 * goes, never more than `dimension` (the size of what is dragged, or of its frame).
 */
export function rubberBand(overshoot: number, dimension: number, constant = 0.55): number {
  if (!overshoot || dimension <= 0) return 0;
  const distance = Math.abs(overshoot);
  return Math.sign(overshoot) * (1 - 1 / ((distance * constant) / dimension + 1)) * dimension;
}

/** `value` as dragged: itself between `min` and `max`, rubber-banded past either. */
export function elastic(value: number, min: number, max: number, dimension: number): number {
  if (value < min) return min + rubberBand(value - min, dimension);
  if (value > max) return max + rubberBand(value - max, dimension);
  return value;
}

/**
 * The delay of the `index`th row of a list coming in, one after another, `motion.stagger`
 * apart: capped, so a long list doesn't keep its last rows waiting.
 */
export const staggerMs = (index: number, cap = 10) => Math.min(Math.max(index, 0), cap) * motion.stagger;

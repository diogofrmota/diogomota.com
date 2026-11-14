# 0013 — One motion system, with rules

**Decided:** unreleased (after v1.2.0), 2026-11-14.

**Why:** motion had grown one curve and one duration at a time: three overshooting "spring" curves on everyday parts, keyframes per module (each app had its own dead `dialog-in` and `sheet-in`, overridden by `Dialog.module.css`), staggers of 25, 45 and 70 ms, a press of 0.92 in one place and 0.97 in another. Popups had just lost their animation entirely, because sliding up on a phone moved them out from under the finger. Motion that follows rules reads as one app, and tells the user where things come from and go.

**What it is:** the tokens on `.shell` (`components/common/AppShell.module.css`, Motion) and the same numbers in `lib/motion.ts` for what moves from script:

- Entrances ease out (`--ease-out`); what moves on screen eases in and out (`--ease-in-out`); no overshoot on everyday parts, only on the Shows guide's celebration (`--ease-celebrate`).
- 150 ms for a press or an icon, 180 ms for a dropdown (150-200), 220 ms for a dialog or a message, 260 ms for something crossing the screen, all under 400 ms (the Doherty threshold). The more often something is seen, the quicker and quieter (switching tabs: 220 ms, 0.75 rem).
- Exits are 20% shorter than entrances (`--exit: 0.8`, `exitMs`).
- A list's rows come in 30 ms apart, ten deep at most, the first time only (`useSettled`, `stagger`).
- A press scales to 0.97 (the `scale` property, on every button of the shell); a wide row to 0.99.
- Popups and dropdowns start at 0.95, from what opened them (`--origin`, `Dialog.tsx`), and leave back into it. A dialog unmounted by React plays its exit on a copy in the top layer (`leavingCopy`), hidden from screen readers and taking no taps.
- The same object in two places is one object: a segmented control's thumb and the tab bar's underline are `SegmentThumb`s sharing a layoutId per control (`useLayoutId`, FLIP), stretching 12% as they move. The switch's knob stretches 12% when pressed.
- Nothing tweens while held (a swipe, a drag, the avatar crop, a slider); past its bounds it rubber-bands (`rubberBand`, `elastic`) and eases back when let go.
- Icons that change crossfade with a blur (`IconSwap`); a success is confirmed with a pulse (`successPulse`, `success-pulse`), a color change or a reveal with a mask (clip-path, mask-image), something added flies along an arc (`flyTo`).
- Everything stops with reduced motion; the e2e tests run with it, and `e2e/motion.spec.ts` checks the system with motion on.

**Costs:** every new animation should take its numbers from the tokens (and `lib/motion.ts` and the CSS must change together). The exit copy is a clone of the dialog's DOM for 176 ms: a canvas in it would show blank, and a dialog under a closing one shows its copy above it. `::details-content`, `@starting-style` and `interpolate-size` are recent: older browsers open and close those parts at once.

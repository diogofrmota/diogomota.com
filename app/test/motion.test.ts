import { describe, expect, test } from "vitest";
import { elastic, exitMs, motion, rubberBand, staggerMs } from "@/lib/motion";

describe("the motion system's numbers", () => {
  test("an exit is 20% shorter than its entrance", () => {
    expect(exitMs(motion.base)).toBe(176);
    expect(exitMs(motion.dropdown)).toBe(144);
  });

  test("dropdowns take 150-200 ms, and everything stays under the Doherty threshold", () => {
    expect(motion.dropdown).toBeGreaterThanOrEqual(150);
    expect(motion.dropdown).toBeLessThanOrEqual(200);
    for (const ms of [motion.fast, motion.dropdown, motion.base, motion.move]) expect(ms).toBeLessThan(400);
  });

  test("a list's rows come in 30 ms apart, ten deep at most", () => {
    expect([0, 1, 2, 10, 25].map((i) => staggerMs(i))).toEqual([0, 30, 60, 300, 300]);
    expect(staggerMs(-1)).toBe(0);
  });
});

describe("rubber-banding past a bound", () => {
  test("follows closely at first, less and less the further it goes, never past the dimension", () => {
    const side = 300;
    const near = rubberBand(10, side);
    const far = rubberBand(1000, side);
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThan(10);
    expect(near / 10).toBeGreaterThan(far / 1000);
    expect(rubberBand(1e9, side)).toBeLessThan(side);
    expect(rubberBand(-10, side)).toBeCloseTo(-near);
    expect(rubberBand(0, side)).toBe(0);
  });

  test("leaves a value inside its bounds as it is", () => {
    expect(elastic(50, 0, 100, 300)).toBe(50);
    expect(elastic(120, 0, 100, 300)).toBeGreaterThan(100);
    expect(elastic(120, 0, 100, 300)).toBeLessThan(120);
    expect(elastic(-20, 0, 100, 300)).toBeLessThan(0);
    expect(elastic(-20, 0, 100, 300)).toBeGreaterThan(-20);
  });
});

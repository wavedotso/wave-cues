import { describe, expect, it } from "vitest";

import {
  levelFor,
  LIMIT_CEILING,
  LIMIT_FROM,
  LIMIT_HEADROOM,
  limiterCurve,
  panFor,
  QUIETEST,
} from "./mix";

describe("levelFor", () => {
  it("runs from soft to full on a square curve", () => {
    expect(levelFor(0)).toBe(QUIETEST);
    expect(levelFor(1)).toBe(1);
    expect(levelFor(0.5)).toBeCloseTo(QUIETEST + (1 - QUIETEST) * 0.25);
  });

  it("keeps a strength out of range, or not a number, sensible", () => {
    expect(levelFor(-3)).toBe(QUIETEST);
    expect(levelFor(7)).toBe(1);
    expect(levelFor(Number.NaN)).toBe(1);
  });
});

describe("panFor", () => {
  it("puts the middle of the window in the middle", () => {
    expect(panFor(500, 1000, 0.6)).toBe(0);
  });

  it("reaches as far as the stereo width allows", () => {
    expect(panFor(0, 1000, 0.6)).toBeCloseTo(-0.6);
    expect(panFor(1000, 1000, 0.6)).toBeCloseTo(0.6);
    expect(panFor(1000, 1000, 1)).toBe(1);
    expect(panFor(1000, 1000, 0)).toBe(0);
  });

  it("stays within the speakers, and in the middle without a window", () => {
    expect(panFor(-400, 1000, 1)).toBe(-1);
    expect(panFor(5000, 1000, 1)).toBe(1);
    expect(panFor(300, 0, 1)).toBe(0);
    expect(panFor(Number.NaN, 1000, 1)).toBe(0);
  });
});

describe("limiterCurve", () => {
  const curve = limiterCurve(8193);
  /** The curve's output for an input `size` times full scale. */
  const at = (size: number) =>
    curve[Math.round(((size / LIMIT_HEADROOM + 1) / 2) * (curve.length - 1))] ??
    0;

  it("changes nothing below where it starts", () => {
    for (const size of [0, 0.1, 0.5, -0.5, LIMIT_FROM]) {
      expect(at(size)).toBeCloseTo(size, 3);
    }
  });

  it("bends what is louder towards its ceiling, and never passes it", () => {
    expect(at(1)).toBeLessThan(LIMIT_CEILING);
    expect(at(1)).toBeGreaterThan(LIMIT_FROM);
    // The curve is 32-bit, so the ceiling is too.
    const ceiling = Math.fround(LIMIT_CEILING);
    expect(at(LIMIT_HEADROOM)).toBeLessThanOrEqual(ceiling);
    expect(at(-LIMIT_HEADROOM)).toBeGreaterThanOrEqual(-ceiling);
    for (let index = 1; index < curve.length; index += 1) {
      expect(curve[index] ?? 0).toBeGreaterThanOrEqual(curve[index - 1] ?? 0);
    }
  });
});

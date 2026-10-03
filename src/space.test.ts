import { describe, expect, it } from "vitest";

import { impulseSamples } from "./space";

describe("impulseSamples", () => {
  it("is the same room every time, and another for another seed", () => {
    expect(impulseSamples(4800, 3)).toEqual(impulseSamples(4800, 3));
    expect(impulseSamples(4800, 3)).not.toEqual(impulseSamples(4800, 4));
  });

  it("fades from loud to nothing, never past full scale", () => {
    const samples = impulseSamples(48_000);
    const loudest = (from: number, to: number) =>
      Math.max(...samples.subarray(from, to).map(Math.abs));
    expect(loudest(0, 48_000)).toBeLessThanOrEqual(1);
    expect(loudest(0, 2400)).toBeGreaterThan(0.8);
    expect(loudest(24_000, 26_400)).toBeLessThan(loudest(0, 2400) / 4);
    expect(loudest(47_520, 48_000)).toBeLessThan(0.001);
  });
});

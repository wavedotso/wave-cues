import { describe, expect, it } from "vitest";

import { randomFrom } from "./random";

const take = (next: () => number, count: number) =>
  Array.from({ length: count }, () => next());

describe("randomFrom", () => {
  it("gives the same numbers for the same seed", () => {
    expect(take(randomFrom(42), 5)).toEqual(take(randomFrom(42), 5));
    expect(take(randomFrom(42), 5)).not.toEqual(take(randomFrom(43), 5));
  });

  it("stays between 0 and 1, spread evenly", () => {
    const numbers = take(randomFrom(7), 20_000);
    expect(Math.min(...numbers)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...numbers)).toBeLessThan(1);
    const mean =
      numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
  });
});

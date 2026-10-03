import { describe, expect, it } from "vitest";

import { noiseSamples } from "./noise";

/** The energy in the change from one sample to the next, against the energy in the samples: how bright it is. */
function brightness(samples: Float32Array): number {
  let level = 0;
  let change = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const now = samples[index] ?? 0;
    level += now * now;
    change += (now - (samples[index - 1] ?? 0)) ** 2;
  }
  return change / level;
}

describe("noiseSamples", () => {
  it("is the same noise every time, at the same peak in every colour", () => {
    for (const color of ["white", "pink", "brown"] as const) {
      const samples = noiseSamples(color, 48_000);
      expect(samples).toEqual(noiseSamples(color, 48_000));
      const peak = Math.max(...samples.map(Math.abs));
      expect(peak, color).toBeCloseTo(0.95, 5);
    }
  });

  it("is darker from white to pink to brown", () => {
    const white = brightness(noiseSamples("white", 48_000));
    const pink = brightness(noiseSamples("pink", 48_000));
    const brown = brightness(noiseSamples("brown", 48_000));
    expect(pink).toBeLessThan(white);
    expect(brown).toBeLessThan(pink);
  });
});

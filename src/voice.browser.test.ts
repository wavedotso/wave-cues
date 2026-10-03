import { describe, expect, it } from "vitest";

import type { Layer, Recipe } from "./recipe";
import { measure, renderSound, toSprite } from "./render";

const RATE = 48_000;

const recipeOf = (...layers: Layer[]): Recipe => ({
  gain: 0.5,
  vary: 0,
  layers,
});

const tone = (
  overrides: Partial<Extract<Layer, { type: "tone" }>> = {},
): Layer => ({
  type: "tone",
  wave: "sine",
  from: 440,
  gain: 1,
  attack: 0.005,
  decay: 0.2,
  ...overrides,
});

async function record(recipe: Recipe) {
  const recording = await renderSound(recipe, { sampleRate: RATE });
  return recording.getChannelData(0);
}

/** Times it crosses zero going up, between two times. */
function crossings(samples: Float32Array, from: number, to: number): number {
  let count = 0;
  for (let index = Math.round(from * RATE) + 1; index < to * RATE; index += 1) {
    if ((samples[index - 1] ?? 0) < 0 && (samples[index] ?? 0) >= 0) count += 1;
  }
  return count;
}

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

/** Four grains, 50 ms apart, at pitches picked by `seed`. */
const grains = (seed: number): Layer => ({
  type: "grains",
  count: 4,
  step: 0.05,
  from: 1500,
  to: 4000,
  gain: 1,
  decay: 0.03,
  seed,
});

describe("a voice", () => {
  it("starts a layer at its offset", async () => {
    const samples = await record(recipeOf(tone({ at: 0.1 })));
    expect(measure(samples, RATE).startsAt).toBeCloseTo(0.1, 2);
  });

  it("glides its pitch from `from` to `to`", async () => {
    const samples = await record(
      recipeOf(tone({ from: 200, to: 800, decay: 0.4 })),
    );
    // An exponential glide: the second half is the higher.
    expect(crossings(samples, 0.25, 0.35)).toBeGreaterThan(
      crossings(samples, 0.05, 0.15) * 1.5,
    );
  });

  it("holds its peak for `hold`", async () => {
    const short = measure(await record(recipeOf(tone())), RATE);
    const held = measure(await record(recipeOf(tone({ hold: 0.15 }))), RATE);
    expect(held.audibleSeconds - short.audibleSeconds).toBeCloseTo(0.15, 1);
  });

  it("darkens noise through a low-pass filter", async () => {
    const noise: Layer = {
      type: "noise",
      color: "white",
      gain: 1,
      attack: 0.002,
      decay: 0.2,
    };
    const open = await record(recipeOf(noise));
    const dark = await record(
      recipeOf({ ...noise, filter: { type: "lowpass", from: 400 } }),
    );
    expect(brightness(dark)).toBeLessThan(brightness(open) / 4);
  });

  it("brightens a tone with frequency modulation", async () => {
    const plain = await record(recipeOf(tone()));
    const bell = await record(recipeOf(tone({ fm: { ratio: 3.5, depth: 2 } })));
    expect(brightness(bell)).toBeGreaterThan(brightness(plain) * 2);
  });

  it("scatters grains the same way for the same seed", async () => {
    const samples = await record(recipeOf(grains(3)));
    // Four grains, 50 ms apart, each over before the next.
    for (const start of [0, 0.05, 0.1, 0.15]) {
      const grain = samples.subarray(start * RATE, (start + 0.03) * RATE);
      expect(
        Math.max(...grain.map(Math.abs)),
        `grain at ${start}`,
      ).toBeGreaterThan(0.3);
    }
    expect(await record(recipeOf(grains(3)))).toEqual(samples);
    expect(await record(recipeOf(grains(4)))).not.toEqual(samples);
  });

  it("leaves a tail in the room for what it sends there, the same every time", async () => {
    const dry = await renderSound(recipeOf(tone()), { sampleRate: RATE });
    const wet = await renderSound(recipeOf(tone({ send: 0.8 })), {
      sampleRate: RATE,
    });
    expect(dry.numberOfChannels).toBe(1);
    expect(wet.numberOfChannels).toBe(2);
    expect(wet.duration).toBeGreaterThan(dry.duration + 1);
    const tail = wet.getChannelData(0).subarray(0.4 * RATE, 1.2 * RATE);
    expect(Math.max(...tail.map(Math.abs))).toBeGreaterThan(0.0005);
    // A seeded room: the same recording, sample for sample.
    const again = await renderSound(recipeOf(tone({ send: 0.8 })), {
      sampleRate: RATE,
    });
    expect(again.getChannelData(1)).toEqual(wet.getChannelData(1));
    // And none of it when the room is turned off.
    const off = await renderSound(recipeOf(tone({ send: 0.8 })), {
      sampleRate: RATE,
      space: 0,
    });
    expect(off.numberOfChannels).toBe(1);
  });

  it("joins a set into one sprite, with where each sound is", async () => {
    const sounds = {
      one: recipeOf(tone()),
      two: recipeOf(tone({ decay: 0.1 })),
    };
    const { wav, map } = await toSprite(sounds, { sampleRate: RATE, gap: 0.1 });
    expect(map.one.start).toBe(0);
    expect(map.two.start).toBeCloseTo(map.one.duration + 0.1, 3);
    const frames = Math.round((map.two.start + map.two.duration + 0.1) * RATE);
    expect(wav.length).toBe(44 + frames * 2);
  });

  it("plays layers together, each at its share", async () => {
    const one = measure(await record(recipeOf(tone({ gain: 0.5 }))), RATE);
    const both = measure(
      await record(recipeOf(tone({ gain: 0.5 }), tone({ gain: 0.5 }))),
      RATE,
    );
    expect(both.peakDb - one.peakDb).toBeCloseTo(20 * Math.log10(2), 0);
  });
});

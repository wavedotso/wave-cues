import { describe, expect, it } from "vitest";

import { lengthOf, problemsOf, type SoundSet, usesRoom } from "./recipe";
import { measure, renderSound } from "./render";
import { glass } from "./sets/glass";
import { mechanical } from "./sets/mechanical";
import { soft } from "./sets/soft";
import { ROOM_SECONDS } from "./space";

// Every set the library ships, every sound in it, recorded in each browser
// engine and held to the same bar.

const SETS: Record<string, SoundSet> = { soft, glass, mechanical };
const RATE = 48_000;

/**
 * The shares of its energy from `highFrom` Hz up and under `lowUnder` Hz: a
 * plain DFT of its first 60 ms, every sample counted alike, so a click that
 * is over in two milliseconds counts in full. (Under a window, which is
 * nearly shut over those milliseconds, only its tail would.)
 */
function balance(
  samples: Float32Array,
  highFrom: number,
  lowUnder: number,
): { high: number; low: number } {
  const length = Math.round(RATE * 0.06);
  let high = 0;
  let low = 0;
  let all = 0;
  for (let bin = 1; bin < length / 2; bin += 1) {
    let re = 0;
    let im = 0;
    const step = (2 * Math.PI * bin) / length;
    for (let index = 0; index < length; index += 1) {
      const value = samples[index] ?? 0;
      re += value * Math.cos(step * index);
      im -= value * Math.sin(step * index);
    }
    const energy = re ** 2 + im ** 2;
    const hertz = (bin * RATE) / length;
    all += energy;
    if (hertz >= highFrom) high += energy;
    if (hertz < lowUnder) low += energy;
  }
  return { high: high / all, low: low / all };
}

/** Milliseconds from its loudest 2 ms to the first 2 ms a tenth as loud. */
function tenthAfter(samples: Float32Array): number {
  const slice = Math.round(RATE * 0.002);
  const levels: number[] = [];
  for (let from = 0; from + slice <= samples.length; from += slice) {
    let sum = 0;
    for (let index = from; index < from + slice; index += 1) {
      sum += (samples[index] ?? 0) ** 2;
    }
    levels.push(Math.sqrt(sum / slice));
  }
  const loudest = levels.indexOf(Math.max(...levels));
  const tenth = levels.findIndex(
    (level, index) => index > loudest && level < (levels[loudest] ?? 0) / 10,
  );
  return (tenth - loudest) * 2;
}

describe.each(Object.entries(SETS))("the %s set", (_, sounds) => {
  it.each(Object.entries(sounds))(
    "%s is sound, quiet enough to stack, and ends in silence",
    async (_name, recipe) => {
      expect(problemsOf(recipe)).toEqual([]);
      const recording = await renderSound(recipe, { sampleRate: RATE });
      const measured = measure(recording.getChannelData(0), RATE);
      // Room for a dozen at once under the limiter, and never too faint to hear.
      expect(measured.peakDb).toBeLessThan(-12);
      expect(measured.peakDb).toBeGreaterThan(-60);
      expect(measured.tailDb).toBeLessThan(-90);
      expect(measured.startsAt + measured.audibleSeconds).toBeLessThanOrEqual(
        // What it sends to the room rings on after it.
        lengthOf(recipe) + (usesRoom(recipe) ? ROOM_SECONDS : 0) + 0.005,
      );
    },
  );

  it("keeps its sounds within 24 dB of each other", async () => {
    const loudness = await Promise.all(
      Object.values(sounds).map(async (recipe) => {
        const recording = await renderSound(recipe, { sampleRate: RATE });
        return measure(recording.getChannelData(0), RATE).loudnessDb;
      }),
    );
    expect(Math.max(...loudness) - Math.min(...loudness)).toBeLessThan(24);
  });
});

describe("the soft tick and knock", () => {
  // The recording both were measured from, with every sample counted alike:
  // 93% of its energy above 6.5 kHz, 3% under 1 kHz, a tenth as loud 8 ms
  // after its loudest 2 ms. The knock is the same recording at 0.8 times the
  // speed: every frequency 0.8 times as high, every time 1.25 times as long.
  // Close enough to that, in every browser, is the bar.
  it.each([
    ["tick", soft.tick, 1],
    ["knock", soft.knock, 0.8],
  ] as const)(
    "%s stays close to the recording it was measured from",
    async (_, recipe, speed) => {
      const recording = await renderSound(recipe, { sampleRate: RATE });
      const samples = recording.getChannelData(0);
      const { high, low } = balance(samples, 6500 * speed, 1000 * speed);
      expect(high).toBeGreaterThan(0.85);
      expect(low).toBeLessThan(0.06);
      expect(tenthAfter(samples) * speed).toBeGreaterThanOrEqual(4);
      expect(tenthAfter(samples) * speed).toBeLessThanOrEqual(12);
    },
  );
});

import { describe, expect, it } from "vitest";

import { defineSounds, problemsOf, type Recipe } from "./recipe";
import { soft } from "./sets/soft";
import { transformRecipe, transformSounds } from "./transform";

const CLICK: Recipe = {
  gain: 0.2,
  every: 25,
  layers: [
    {
      type: "noise",
      color: "pink",
      gain: 0.5,
      attack: 0.001,
      decay: 0.02,
      filter: { type: "bandpass", from: 2000, to: 4000, q: 1 },
    },
    {
      type: "tone",
      wave: "sine",
      from: 440,
      to: 220,
      gain: 1,
      attack: 0.004,
      hold: 0.01,
      decay: 0.1,
      send: 0.2,
    },
    {
      type: "grains",
      count: 4,
      step: 0.03,
      from: 1000,
      to: 2000,
      gain: 0.3,
      decay: 0.05,
    },
  ],
};

describe("transformRecipe", () => {
  it("changes nothing when it is asked for nothing", () => {
    expect(transformRecipe(CLICK, {})).toEqual(CLICK);
  });

  it("moves every frequency with the pitch, and noise filters further", () => {
    const [noise, tone, grains] = transformRecipe(CLICK, {
      pitch: 2,
      noisePitch: 1.5,
    }).layers;
    expect(noise).toMatchObject({ filter: { from: 6000, to: 12_000 } });
    expect(tone).toMatchObject({ from: 880, to: 440 });
    expect(grains).toMatchObject({ from: 2000, to: 4000 });
  });

  it("reshapes envelopes, levels, resonance and the room, within their limits", () => {
    const shaped = transformRecipe(CLICK, {
      attack: 0.1,
      decay: 2,
      gain: 0.5,
      noise: 3,
      resonance: 2,
      send: 0.5,
      room: 0.3,
    });
    const [noise, tone, grains] = shaped.layers;
    expect(shaped.gain).toBeCloseTo(0.1);
    expect(shaped.every).toBe(25);
    // The shortest attack a recipe may have, and no louder than full.
    expect(noise).toMatchObject({ attack: 0.0005, decay: 0.04, gain: 1 });
    expect(noise).toMatchObject({ filter: { q: 2 } });
    expect(noise).not.toHaveProperty("send");
    expect(tone).toMatchObject({ attack: 0.0005, hold: 0.02, decay: 0.2 });
    expect(tone).toMatchObject({ send: 0.2 * 0.5 + 0.3 });
    expect(grains).toMatchObject({ decay: 0.1, send: 0.3 });
  });

  it("leaves a sound made only of noise at its level", () => {
    const breath: Recipe = { gain: 0.3, layers: CLICK.layers.slice(0, 1) };
    expect(transformRecipe(breath, { noise: 0.25 }).layers[0]).toMatchObject({
      gain: 0.5,
    });
    expect(transformRecipe(CLICK, { noise: 0.25 }).layers[0]).toMatchObject({
      gain: 0.125,
    });
  });

  it("swaps waves, and rings a partial above every tone", () => {
    const { layers } = transformRecipe(CLICK, {
      wave: { sine: "triangle" },
      partial: { ratio: 3, gain: 0.25 },
    });
    expect(layers).toHaveLength(4);
    expect(layers[1]).toMatchObject({ wave: "triangle", from: 440 });
    expect(layers[2]).toMatchObject({
      type: "tone",
      wave: "sine",
      from: 1320,
      to: 660,
      gain: 0.25,
      decay: expect.closeTo(0.08),
    });
  });

  it("leaves the recipe it was given as it was", () => {
    const before = JSON.stringify(CLICK);
    transformRecipe(CLICK, { pitch: 3, partial: { ratio: 2, gain: 0.5 } });
    expect(JSON.stringify(CLICK)).toBe(before);
  });
});

describe("transformSounds", () => {
  const sounds = defineSounds({ click: CLICK, other: CLICK });

  it("reshapes every sound, keeping its names", () => {
    const next = transformSounds(sounds, { pitch: 2 });
    expect(Object.keys(next)).toEqual(["click", "other"]);
    expect(next.click.layers[1]).toMatchObject({ from: 880 });
  });

  it("takes a recipe of its own for the sounds that need one", () => {
    const own: Recipe = { gain: 0.3, layers: CLICK.layers.slice(0, 1) };
    const next = transformSounds(sounds, { pitch: 2 }, { other: own });
    expect(next.other).toBe(own);
    expect(next.click.layers[1]).toMatchObject({ from: 880 });
  });

  it("makes sound recipes of the whole soft set, however hard it is pushed", () => {
    const pushed = transformSounds(soft, {
      pitch: 6,
      attack: 0.01,
      decay: 0.01,
      gain: 9,
      noise: 9,
      noisePitch: 9,
      resonance: 400,
      send: 9,
      room: 2,
      partial: { ratio: 5, gain: 4 },
    });
    for (const [name, recipe] of Object.entries(pushed)) {
      expect(problemsOf(recipe), name).toEqual([]);
    }
  });
});

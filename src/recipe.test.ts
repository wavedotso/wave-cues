import { describe, expect, it } from "vitest";

import {
  checkSounds,
  defineSounds,
  endOf,
  lengthOf,
  problemsOf,
  type Recipe,
  usesRoom,
} from "./recipe";
import { soft } from "./sets/soft";

const TICK: Recipe = {
  gain: 0.2,
  layers: [
    {
      type: "tone",
      wave: "sine",
      from: 440,
      gain: 1,
      attack: 0.005,
      decay: 0.1,
    },
  ],
};

describe("problemsOf", () => {
  it("finds nothing wrong with every sound in the soft set", () => {
    for (const [name, recipe] of Object.entries(soft)) {
      expect(problemsOf(recipe), name).toEqual([]);
    }
  });

  it("names each problem and where it is", () => {
    const problems = problemsOf({
      gain: 2,
      group: "loud",
      voices: 1.5,
      layers: [
        { type: "tone", wave: "buzz", from: 5, gain: 1, attack: 0, decay: 0.1 },
        { type: "noise", color: "green", gain: 1, attack: 0.01, decay: 0.1 },
        {
          type: "noise",
          color: "pink",
          gain: 1,
          attack: 0.01,
          decay: 0.1,
          filter: { type: "notch", from: 900_000 },
        },
        { type: "chord" },
      ],
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        "gain must be a number from 0 to 1.",
        "group must be one of ui, feedback, alert.",
        "voices must be a whole number, at least 1.",
        "layers[0].attack must be a number from 0.0005 to 10.",
        "layers[0].wave must be sine, triangle, square or sawtooth.",
        "layers[0].from must be a number from 20 to 20000.",
        "layers[1].color must be white, pink or brown.",
        "layers[2].filter.type must be lowpass, highpass or bandpass.",
        "layers[2].filter.from must be a number from 20 to 20000.",
        'layers[3].type must be "tone", "noise" or "grains".',
      ]),
    );
  });

  it("checks a scatter of grains, and what a layer sends to the room", () => {
    expect(
      problemsOf({
        gain: 0.1,
        layers: [
          {
            type: "grains",
            count: 6,
            step: 0.03,
            from: 1600,
            to: 4600,
            gain: 1,
            decay: 0.1,
            send: 0.5,
          },
        ],
      }),
    ).toEqual([]);
    expect(
      problemsOf({
        gain: 0.1,
        layers: [
          {
            type: "grains",
            count: 0,
            step: 4,
            from: 5,
            to: 4600,
            gain: 1,
            decay: 0.1,
            send: 3,
          },
        ],
      }),
    ).toEqual([
      "layers[0].send must be a number from 0 to 1.",
      "layers[0].count must be a whole number from 1 to 32.",
      "layers[0].step must be a number from 0 to 1.",
      "layers[0].from must be a number from 20 to 20000.",
    ]);
  });

  it("wants at least one layer", () => {
    expect(problemsOf({ gain: 0.5, layers: [] })).toEqual([
      "layers must list at least one layer.",
    ]);
    expect(problemsOf("tick")).toEqual(["The recipe is not an object."]);
  });
});

describe("checkSounds", () => {
  it("takes a set that arrived as data, when it is sound", () => {
    const parsed: unknown = JSON.parse(JSON.stringify({ tick: TICK }));
    expect(checkSounds(parsed)).toEqual({ tick: TICK });
  });

  it("refuses one that is not, naming the sound", () => {
    expect(() => checkSounds({ tick: { ...TICK, gain: -1 } })).toThrow(
      "tick: gain must be a number from 0 to 1.",
    );
    expect(() => checkSounds([TICK])).toThrow(TypeError);
  });
});

describe("lengthOf", () => {
  it("lasts until its last layer has faded", () => {
    expect(lengthOf(TICK)).toBeCloseTo(0.105);
    expect(
      lengthOf({
        gain: 1,
        layers: [
          { type: "noise", color: "white", gain: 1, attack: 0.01, decay: 0.05 },
          {
            type: "tone",
            wave: "sine",
            from: 300,
            gain: 1,
            at: 0.2,
            attack: 0.01,
            hold: 0.1,
            decay: 0.2,
          },
        ],
      }),
    ).toBeCloseTo(0.51);
  });
});

describe("endOf and usesRoom", () => {
  it("ends a scatter of grains when its last grain has faded", () => {
    expect(
      endOf({
        type: "grains",
        count: 5,
        step: 0.03,
        from: 2000,
        to: 4000,
        gain: 1,
        decay: 0.1,
        at: 0.2,
      }),
    ).toBeCloseTo(0.2 + 4 * 0.03 + 0.004 + 0.1);
  });

  it("knows whether any of a sound goes to the room", () => {
    expect(usesRoom(TICK)).toBe(false);
    const [layer] = TICK.layers;
    expect(
      layer && usesRoom({ ...TICK, layers: [{ ...layer, send: 0.2 }] }),
    ).toBe(true);
  });
});

describe("defineSounds", () => {
  it("returns the set as written", () => {
    const sounds = defineSounds({ tick: TICK });
    expect(sounds.tick).toBe(TICK);
  });
});

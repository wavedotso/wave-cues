import { describe, expect, it } from "vitest";

import { problemsOf } from "./recipe";
import { glass } from "./sets/glass";
import { mechanical } from "./sets/mechanical";
import { soft } from "./sets/soft";
import { families, vocabulary } from "./vocabulary";

const SETS = { soft, glass, mechanical };

describe("the vocabulary", () => {
  it("gives every name a family and a sentence", () => {
    for (const [name, meaning] of Object.entries(vocabulary)) {
      expect(Object.keys(families), name).toContain(meaning.family);
      expect(meaning.about.length, name).toBeGreaterThan(8);
    }
  });

  it("uses every family", () => {
    const used = new Set(
      Object.values(vocabulary).map((meaning) => meaning.family),
    );
    expect([...used].toSorted()).toEqual(Object.keys(families).toSorted());
  });

  it.each(Object.entries(SETS))(
    "is what the %s set has: every name, and no other",
    (_, sounds) => {
      expect(Object.keys(sounds).toSorted()).toEqual(
        Object.keys(vocabulary).toSorted(),
      );
      for (const [name, recipe] of Object.entries(sounds)) {
        expect(problemsOf(recipe), name).toEqual([]);
      }
    },
  );
});

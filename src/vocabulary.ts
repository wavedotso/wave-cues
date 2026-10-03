/**
 * The vocabulary: the names the sets shipped here share, the family each
 * belongs to, and what it is for. A set says how they sound; this says what
 * they mean. Your own set can use any names at all: this is only what the
 * library's sets agree on, and what the studio and the docs show. It is
 * kept apart from the recipes, so an app that plays sounds does not carry
 * these words.
 */

export type Family =
  | "object"
  | "pointer"
  | "press"
  | "toggle"
  | "feedback"
  | "notify"
  | "motion"
  | "state";

export const families: Readonly<Record<Family, string>> = {
  object: "Things you pick up, drag and throw.",
  pointer: "The pointer arriving, barely there.",
  press: "The weight of a press, and of a key.",
  toggle: "Two states, a pair of sounds.",
  feedback: "A verdict: it worked, it did not, careful.",
  notify: "Something arrived that you did not ask for.",
  motion: "A surface opening, closing, passing.",
  state: "Waiting, ready, done.",
};

export interface Meaning {
  family: Family;
  about: string;
}

export const vocabulary = {
  tick: {
    family: "object",
    about: "Something dragged passes a dot of the grid.",
  },
  lift: { family: "object", about: "Picked up." },
  drop: { family: "object", about: "Put down, as heavy as it was thrown." },
  knock: {
    family: "object",
    about: "A thrown thing hits an edge, as hard as the hit.",
  },
  snap: {
    family: "object",
    about: "It locks onto the grid, or into its place.",
  },

  hover: {
    family: "pointer",
    about: "The pointer, or the focus, arrives on something.",
  },
  pop: {
    family: "pointer",
    about: "A small thing appears under the pointer: a tooltip, a menu.",
  },

  press: { family: "press", about: "The down-stroke of a button." },
  release: { family: "press", about: "The up-stroke, lighter." },
  tap: { family: "press", about: "A plain click, with no weight to it." },
  type: { family: "press", about: "A key, while writing." },

  on: { family: "toggle", about: "Switched on: two notes, stepping up." },
  off: {
    family: "toggle",
    about: "Switched off: the same two, stepping down.",
  },
  switch: { family: "toggle", about: "One of several chosen: a tab, a mode." },

  success: { family: "feedback", about: "It worked." },
  error: {
    family: "feedback",
    about: "It did not: said plainly, without alarm.",
  },
  warning: { family: "feedback", about: "Careful: the same note, twice." },
  denied: {
    family: "feedback",
    about:
      "Not allowed, or the end of the list: a soft thud against the limit.",
  },

  notify: { family: "notify", about: "Something arrived: a struck bell." },
  ping: { family: "notify", about: "A small, bright point of attention." },
  message: { family: "notify", about: "A message surfaces." },
  land: {
    family: "notify",
    about:
      "Something of yours arrived from elsewhere: three notes, one after the other.",
  },

  open: { family: "motion", about: "A surface opens: two steps up." },
  close: { family: "motion", about: "It closes: one step down." },
  slide: { family: "motion", about: "A panel slides into place." },
  swoosh: { family: "motion", about: "Something passes, or is sent away." },

  loading: {
    family: "state",
    about: "Waiting: three patient notes. Made to loop.",
  },
  ready: { family: "state", about: "Ready for you: a warm, open chord." },
  complete: { family: "state", about: "Done: an arpeggio, then a shimmer." },
  sparkle: {
    family: "state",
    about: "A small celebration: a handful of glitter.",
  },
} as const satisfies Record<string, Meaning>;

/** The names every set shipped here has. */
export type VocabularyName = keyof typeof vocabulary;

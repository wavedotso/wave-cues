/**
 * What a sound is made of. A recipe is a few numbers, played through Web
 * Audio at the moment the sound is needed: no file is loaded, so nothing
 * arrives late, the whole library weighs a few kilobytes, and any sound can
 * be retuned.
 *
 * A recipe is layers that start together (or `at` an offset): tones, noise,
 * their filters, scatters of grains, each with its own envelope and its own
 * `send` to the room (the engine's reverb). Every frequency in a recipe is
 * multiplied by the pitch it plays at, so it can be played higher or lower
 * without getting shorter or longer.
 *
 * A set of sounds is a plain object of recipes, in a file of its own: write
 * it with `defineSounds` and TypeScript checks every recipe and knows every
 * name; load one from JSON with `checkSounds`.
 */

/** The mixer channel a sound plays in, each with a volume of its own. */
export type Group = "ui" | "feedback" | "alert";

export type Wave = "sine" | "triangle" | "square" | "sawtooth";

/** White is bright and even; pink, softer; brown, a low rumble. */
export type NoiseColor = "white" | "pink" | "brown";

/**
 * How a layer's level moves, in seconds: up to its peak over `attack`, held
 * there for `hold`, then down over `decay`, the time it takes to fall 60 dB
 * (as RT60 measures a room), out of hearing. Rises and falls are exponential,
 * as the ear hears them, and shaped the same at any strength. The attack is
 * never zero: a jump to full volume clicks.
 */
export interface Envelope {
  attack: number;
  hold?: number;
  decay: number;
}

export interface Filter {
  type: "lowpass" | "highpass" | "bandpass";
  /** Hz when the layer starts, and where it glides to by its end. */
  from: number;
  to?: number;
  /** Resonance. The default, 0.707, is flat. */
  q?: number;
}

interface LayerBase extends Envelope {
  /** Its share of the recipe's level, 0 to 1. */
  gain: number;
  /** Seconds after the sound starts. */
  at?: number;
  filter?: Filter;
  /** How much of it also goes to the room, 0 to 1: a tail of space after it. */
  send?: number;
}

/** An oscillator: a pitch that may glide. */
export interface ToneLayer extends LayerBase {
  type: "tone";
  wave: Wave;
  /** Hz when the layer starts, and where it glides to by its end. */
  from: number;
  to?: number;
  /**
   * Frequency modulation, for bells, glass and metal: a sine at `ratio`
   * times the tone moves its pitch by up to `depth` times the tone, fading
   * as the layer does, the way a struck thing loses its brightness.
   */
  fm?: { ratio: number; depth: number };
}

/** Noise through its filter: clicks, taps, breath and texture. */
export interface NoiseLayer extends LayerBase {
  type: "noise";
  color: NoiseColor;
}

/**
 * A scatter of short sine grains, each at a pitch picked between `from` and
 * `to` by a seed: sparkle, glitter, rain. The same seed scatters the same way.
 */
export interface GrainsLayer {
  type: "grains";
  /** How many grains. */
  count: number;
  /** Seconds from one grain to the next. */
  step: number;
  /** Each grain's pitch falls somewhere between these, in Hz. */
  from: number;
  to: number;
  /** Each grain's share of the recipe's level, 0 to 1. */
  gain: number;
  /** Seconds each grain takes to fall 60 dB. */
  decay: number;
  /** Seconds after the sound starts. */
  at?: number;
  /** Picks the grains' pitches. Default: 1. */
  seed?: number;
  send?: number;
}

export type Layer = ToneLayer | NoiseLayer | GrainsLayer;

export interface Recipe {
  /**
   * Its level at full strength and volume, 0 to 1: the peak of its layers
   * before their filters, which take some away. Match sounds by measuring
   * them (render.ts), not by this number.
   */
  gain: number;
  layers: readonly Layer[];
  /** The mixer group it plays in. Default: "ui". */
  group?: Group;
  /** How far each play's pitch may wander, as a share: 0.05 is ±5%. Default: 0.03. */
  vary?: number;
  /** Milliseconds: asked to play again sooner than this, it does not. Default: 0. */
  every?: number;
  /** At most this many play at once; one more stops the oldest. Default: 6. */
  voices?: number;
}

export type SoundSet<Name extends string = string> = Readonly<
  Record<Name, Recipe>
>;

export const GROUPS: readonly Group[] = ["ui", "feedback", "alert"];
export const DEFAULT_VARY = 0.03;
export const DEFAULT_VOICES = 6;
/** Seconds a grain takes to reach its peak. */
export const GRAIN_ATTACK = 0.004;

/**
 * A set of sounds, typed: every recipe is checked as you write it, and
 * `play` takes only these names.
 */
export function defineSounds<const Name extends string>(
  sounds: Record<Name, Recipe>,
): SoundSet<Name> {
  return sounds;
}

/** When a layer has faded out, in seconds from the start of the sound. */
export function endOf(layer: Layer): number {
  if (layer.type === "grains") {
    const last = Math.max(0, layer.count - 1) * layer.step;
    return (layer.at ?? 0) + last + GRAIN_ATTACK + layer.decay;
  }
  return (layer.at ?? 0) + layer.attack + (layer.hold ?? 0) + layer.decay;
}

/** Whether any of it goes to the room: then a tail of space follows it. */
export function usesRoom(recipe: Recipe): boolean {
  return recipe.layers.some((layer) => (layer.send ?? 0) > 0);
}

/** How long the sound lasts, in seconds: until its last layer has faded. */
export function lengthOf(recipe: Recipe): number {
  return Math.max(0, ...recipe.layers.map(endOf));
}

const GROUP_NAMES: ReadonlySet<unknown> = new Set(GROUPS);
const WAVES: ReadonlySet<unknown> = new Set([
  "sine",
  "triangle",
  "square",
  "sawtooth",
]);
const COLORS: ReadonlySet<unknown> = new Set(["white", "pink", "brown"]);
const FILTERS: ReadonlySet<unknown> = new Set([
  "lowpass",
  "highpass",
  "bandpass",
]);
/** What people hear: below and above this, a frequency is a mistake. */
const HEARD = { low: 20, high: 20_000 } as const;
/** Long enough for any sound an interface makes. */
const LONGEST_SECONDS = 10;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * What is wrong with a recipe, each as a sentence naming where; an empty
 * list when nothing is. For recipes that arrive as data (JSON, a tuning
 * tool), which TypeScript cannot check.
 */
export function problemsOf(recipe: unknown): string[] {
  const problems: string[] = [];
  if (!isRecord(recipe)) return ["The recipe is not an object."];

  const between = (
    where: string,
    value: unknown,
    min: number,
    max: number,
    optional = false,
  ) => {
    if (optional && value === undefined) return;
    if (!isNumber(value) || value < min || value > max) {
      problems.push(`${where} must be a number from ${min} to ${max}.`);
    }
  };
  const hertz = (where: string, value: unknown, optional = false) =>
    between(where, value, HEARD.low, HEARD.high, optional);

  between("gain", recipe.gain, 0, 1);
  if (recipe.group !== undefined && !GROUP_NAMES.has(recipe.group)) {
    problems.push(`group must be one of ${GROUPS.join(", ")}.`);
  }
  between("vary", recipe.vary, 0, 1, true);
  between("every", recipe.every, 0, 60_000, true);
  if (
    recipe.voices !== undefined &&
    (!Number.isInteger(recipe.voices) || (recipe.voices as number) < 1)
  ) {
    problems.push("voices must be a whole number, at least 1.");
  }
  if (!Array.isArray(recipe.layers) || recipe.layers.length === 0) {
    problems.push("layers must list at least one layer.");
    return problems;
  }

  recipe.layers.forEach((layer: unknown, index) => {
    const at = `layers[${index}]`;
    if (!isRecord(layer)) {
      problems.push(`${at} is not an object.`);
      return;
    }
    between(`${at}.gain`, layer.gain, 0, 1);
    between(`${at}.at`, layer.at, 0, LONGEST_SECONDS, true);
    between(`${at}.send`, layer.send, 0, 1, true);
    between(`${at}.decay`, layer.decay, 0.002, LONGEST_SECONDS);
    if (layer.type === "grains") {
      if (
        !Number.isInteger(layer.count) ||
        (layer.count as number) < 1 ||
        (layer.count as number) > 32
      ) {
        problems.push(`${at}.count must be a whole number from 1 to 32.`);
      }
      between(`${at}.step`, layer.step, 0, 1);
      hertz(`${at}.from`, layer.from);
      hertz(`${at}.to`, layer.to);
      between(`${at}.seed`, layer.seed, 0, 4_294_967_295, true);
      return;
    }
    // Never zero: a jump to full volume, or straight down to nothing, clicks.
    between(`${at}.attack`, layer.attack, 0.0005, LONGEST_SECONDS);
    between(`${at}.hold`, layer.hold, 0, LONGEST_SECONDS, true);
    if (layer.type === "tone") {
      if (!WAVES.has(layer.wave)) {
        problems.push(`${at}.wave must be sine, triangle, square or sawtooth.`);
      }
      hertz(`${at}.from`, layer.from);
      hertz(`${at}.to`, layer.to, true);
      if (layer.fm !== undefined) {
        if (!isRecord(layer.fm)) {
          problems.push(`${at}.fm must have a ratio and a depth.`);
        } else {
          between(`${at}.fm.ratio`, layer.fm.ratio, 0.01, 32);
          between(`${at}.fm.depth`, layer.fm.depth, 0, 32);
        }
      }
    } else if (layer.type === "noise") {
      if (!COLORS.has(layer.color)) {
        problems.push(`${at}.color must be white, pink or brown.`);
      }
    } else {
      problems.push(`${at}.type must be "tone", "noise" or "grains".`);
    }
    if (layer.filter !== undefined) {
      if (!isRecord(layer.filter)) {
        problems.push(`${at}.filter is not an object.`);
      } else {
        if (!FILTERS.has(layer.filter.type)) {
          problems.push(
            `${at}.filter.type must be lowpass, highpass or bandpass.`,
          );
        }
        hertz(`${at}.filter.from`, layer.filter.from);
        hertz(`${at}.filter.to`, layer.filter.to, true);
        between(`${at}.filter.q`, layer.filter.q, 0.0001, 100, true);
      }
    }
  });
  return problems;
}

/**
 * A set of sounds that arrived as data, checked: every recipe in it is
 * sound, or this throws, naming each problem.
 */
export function checkSounds(sounds: unknown): SoundSet {
  if (!isRecord(sounds)) {
    throw new TypeError("A set of sounds must be an object of recipes.");
  }
  const problems = Object.entries(sounds).flatMap(([name, recipe]) =>
    problemsOf(recipe).map((problem) => `${name}: ${problem}`),
  );
  if (problems.length > 0) {
    throw new TypeError(
      `This set of sounds has problems:\n${problems.join("\n")}`,
    );
  }
  return sounds as SoundSet;
}

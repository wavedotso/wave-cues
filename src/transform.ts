/**
 * A set derived from another. One transform reshapes every sound in a set,
 * so a new character (glass, mechanical) is a few numbers, not every
 * recipe written again; then name the sounds that need a recipe of their
 * own. The result is a plain set, in a file of its own, like any other.
 */
import type { Layer, Recipe, SoundSet, ToneLayer, Wave } from "./recipe";

export interface Transform {
  /** Multiplies every frequency: above 1 is brighter and smaller. */
  pitch?: number;
  /** Multiplies every attack: above 1 is softer. */
  attack?: number;
  /** Multiplies every decay and hold: above 1 rings longer. */
  decay?: number;
  /** Multiplies every sound's level. */
  gain?: number;
  /**
   * The balance of noise against tone: multiplies the level of noise layers
   * in sounds that also have tones. A sound made only of noise keeps its
   * level, since there is nothing to balance it against.
   */
  noise?: number;
  /** Multiplies noise layers' filter frequencies, on top of `pitch`. */
  noisePitch?: number;
  /** Multiplies every filter's resonance. */
  resonance?: number;
  /** Multiplies what every layer sends to the room. */
  send?: number;
  /** Added to what every tone and grain sends to the room: space, for a dry set. */
  room?: number;
  /** Swaps waves: `{ sine: "triangle" }` plays every sine as a triangle. */
  wave?: Partial<Record<Wave, Wave>>;
  /**
   * A quiet partial above every tone, at `ratio` times its pitch and `gain`
   * of its level: the ring of glass, when the ratio is not a whole number.
   */
  partial?: { ratio: number; gain: number };
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** The limits a recipe keeps (recipe.ts checks the same ones). */
const hertz = (value: number): number => clamp(value, 20, 20_000);
const share = (value: number): number => clamp(value, 0, 1);
const SHORTEST_ATTACK = 0.0005;
const SHORTEST_DECAY = 0.002;
const HIGHEST = 20_000;

/** The layer with what it sends to the room, when it sends anything. */
const withSend = <Kind extends Layer>(next: Kind, send: number | undefined) =>
  send === undefined ? next : { ...next, send };

function transformLayer(
  layer: Layer,
  transform: Transform,
  noiseLevel: number,
): Layer[] {
  const pitch = transform.pitch ?? 1;
  const decay = transform.decay ?? 1;
  const sent = (
    send: number | undefined,
    extra: number,
  ): number | undefined => {
    const value = (send ?? 0) * (transform.send ?? 1) + extra;
    return value > 0 ? share(value) : undefined;
  };
  if (layer.type === "grains") {
    const { send: _, ...rest } = layer;
    return [
      withSend(
        {
          ...rest,
          from: hertz(layer.from * pitch),
          to: hertz(layer.to * pitch),
          decay: Math.max(SHORTEST_DECAY, layer.decay * decay),
        },
        sent(layer.send, transform.room ?? 0),
      ),
    ];
  }

  const { send: _, filter, ...rest } = layer;
  const noisePitch = layer.type === "noise" ? (transform.noisePitch ?? 1) : 1;
  const shaped = {
    ...rest,
    attack: Math.max(SHORTEST_ATTACK, layer.attack * (transform.attack ?? 1)),
    decay: Math.max(SHORTEST_DECAY, layer.decay * decay),
    ...(layer.hold === undefined ? {} : { hold: layer.hold * decay }),
    ...(filter === undefined
      ? {}
      : {
          filter: {
            ...filter,
            from: hertz(filter.from * pitch * noisePitch),
            ...(filter.to === undefined
              ? {}
              : { to: hertz(filter.to * pitch * noisePitch) }),
            ...(filter.q === undefined && transform.resonance === undefined
              ? {}
              : {
                  q: clamp(
                    (filter.q ?? Math.SQRT1_2) * (transform.resonance ?? 1),
                    0.0001,
                    100,
                  ),
                }),
          },
        }),
  };

  if (shaped.type === "noise") {
    return [
      withSend(
        { ...shaped, gain: share(shaped.gain * noiseLevel) },
        sent(layer.send, 0),
      ),
    ];
  }

  const tone: ToneLayer = withSend(
    {
      ...shaped,
      wave: transform.wave?.[shaped.wave] ?? shaped.wave,
      from: hertz(shaped.from * pitch),
      ...(shaped.to === undefined ? {} : { to: hertz(shaped.to * pitch) }),
    },
    sent(layer.send, transform.room ?? 0),
  );
  const partial = transform.partial;
  if (!partial || tone.from * partial.ratio > HIGHEST) return [tone];
  // The partial is a plain sine: no modulation or filter of its own.
  const { fm: _fm, filter: _filter, ...plain } = tone;
  return [
    tone,
    {
      ...plain,
      wave: "sine",
      from: hertz(tone.from * partial.ratio),
      ...(tone.to === undefined ? {} : { to: hertz(tone.to * partial.ratio) }),
      gain: share(tone.gain * partial.gain),
      decay: Math.max(SHORTEST_DECAY, tone.decay * 0.8),
    },
  ];
}

/** One recipe, reshaped. */
export function transformRecipe(recipe: Recipe, transform: Transform): Recipe {
  const onlyNoise = recipe.layers.every((layer) => layer.type === "noise");
  const noiseLevel = onlyNoise ? 1 : (transform.noise ?? 1);
  return {
    ...recipe,
    gain: share(recipe.gain * (transform.gain ?? 1)),
    layers: recipe.layers.flatMap((layer) =>
      transformLayer(layer, transform, noiseLevel),
    ),
  };
}

/**
 * Every sound of `sounds`, reshaped by `transform`; then `overrides` replace
 * the ones that need their own recipe. The names stay the same, so an app
 * changes character by changing which set it imports.
 */
export function transformSounds<Name extends string>(
  sounds: SoundSet<Name>,
  transform: Transform,
  overrides: Partial<Record<Name, Recipe>> = {},
): SoundSet<Name> {
  const next: Partial<Record<Name, Recipe>> = {};
  for (const name of Object.keys(sounds) as Name[]) {
    next[name] = overrides[name] ?? transformRecipe(sounds[name], transform);
  }
  return next as Record<Name, Recipe>;
}

/**
 * Noise for noise layers: a second of it in each colour, made once per
 * audio context from a fixed seed. Each play starts at a different place in
 * it, so two clicks in a row are never the same click.
 */
import type { NoiseColor } from "./recipe";
import { randomFrom } from "./random";

const SEED = 0x51_6e_61_6c;
const SECONDS = 1;
const PEAK = 0.95;

/**
 * Samples of noise: white is even across every frequency, pink falls by 3 dB
 * an octave (Paul Kellet's filter), brown by 6 dB (white, summed with a leak).
 * Each is scaled to the same peak.
 */
export function noiseSamples(
  color: NoiseColor,
  length: number,
  seed = SEED,
): Float32Array<ArrayBuffer> {
  const random = randomFrom(seed);
  const samples = new Float32Array(length);
  let [b0, b1, b2, b3, b4, b5, b6] = [0, 0, 0, 0, 0, 0, 0];
  let brown = 0;
  for (let index = 0; index < length; index += 1) {
    const white = random() * 2 - 1;
    if (color === "white") {
      samples[index] = white;
    } else if (color === "pink") {
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      samples[index] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
    } else {
      brown = (brown + 0.02 * white) / 1.02;
      samples[index] = brown;
    }
  }
  let loudest = 0;
  for (const sample of samples) loudest = Math.max(loudest, Math.abs(sample));
  if (loudest > 0) {
    for (let index = 0; index < length; index += 1) {
      samples[index] = ((samples[index] ?? 0) / loudest) * PEAK;
    }
  }
  return samples;
}

const made = new WeakMap<BaseAudioContext, Map<NoiseColor, AudioBuffer>>();

/** A second of noise in `color`, for this context, made the first time it is asked for. */
export function noiseBuffer(
  context: BaseAudioContext,
  color: NoiseColor,
): AudioBuffer {
  let colors = made.get(context);
  if (!colors) {
    colors = new Map();
    made.set(context, colors);
  }
  const known = colors.get(color);
  if (known) return known;
  const length = Math.round(context.sampleRate * SECONDS);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  buffer.copyToChannel(noiseSamples(color, length), 0);
  colors.set(color, buffer);
  return buffer;
}

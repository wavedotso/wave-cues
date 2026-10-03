/**
 * The room: a short, soft reverb that layers `send` themselves to, so a
 * sound can leave a tail of space behind it. Its impulse response is noise
 * fading to nothing, made from a fixed seed: the same room every time, in
 * every browser, so a recording of a sound is always the same recording.
 */
import { randomFrom } from "./random";

/** How long the room rings, in seconds. */
export const ROOM_SECONDS = 1.4;
/** How steeply it fades: higher is a smaller, drier room. */
const ROOM_FADE = 3.2;
/** The room's level when the engine is not told one, 0 to 1. */
export const DEFAULT_SPACE = 0.25;
const SEED = 0x52_6f_6f_6d;

/** One channel of the room's impulse: seeded noise under a curve that ends in silence. */
export function impulseSamples(
  length: number,
  seed = SEED,
): Float32Array<ArrayBuffer> {
  const random = randomFrom(seed);
  const samples = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    samples[index] = (random() * 2 - 1) * (1 - index / length) ** ROOM_FADE;
  }
  return samples;
}

const rooms = new WeakMap<BaseAudioContext, AudioBuffer>();

/** The room's impulse response for this context: two channels, a little different, so it has width. */
export function roomImpulse(context: BaseAudioContext): AudioBuffer {
  const known = rooms.get(context);
  if (known) return known;
  const length = Math.round(context.sampleRate * ROOM_SECONDS);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  impulse.copyToChannel(impulseSamples(length, SEED), 0);
  impulse.copyToChannel(impulseSamples(length, SEED + 1), 1);
  rooms.set(context, impulse);
  return impulse;
}

/** The room as nodes: send into `input`; its tail comes out of `output` at `level`. */
export function createRoom(
  context: BaseAudioContext,
  level: number,
): { input: AudioNode; output: GainNode } {
  const room = context.createConvolver();
  room.buffer = roomImpulse(context);
  const output = context.createGain();
  output.gain.value = level;
  room.connect(output);
  return { input: room, output };
}

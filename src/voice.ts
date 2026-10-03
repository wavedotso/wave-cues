/**
 * One play of a recipe: its layers built as Web Audio nodes and scheduled
 * on a context. The live engine and offline recording both use this, so
 * what is recorded is exactly what plays.
 */
import { noiseBuffer } from "./noise";
import { randomFrom } from "./random";
import {
  endOf,
  GRAIN_ATTACK,
  type GrainsLayer,
  type Layer,
  type NoiseLayer,
  type Recipe,
  type ToneLayer,
} from "./recipe";

/** An exponential ramp can neither reach nor leave zero: this is silence. */
export const SILENT = 0.0001;
/**
 * Where a layer's level rises from and falls to: 60 dB under its own peak,
 * out of hearing. Relative to the peak, so a soft play has the same shape as
 * a hard one; `decay` is then the time to fall 60 dB, as RT60 is.
 */
const RAMP_FLOOR = 0.001;
/** Seconds a stopped voice takes to fade, so it stops without a click. */
const STOP_FADE = 0.006;
/** Seconds after the last ramp before sources stop. */
const TAIL = 0.02;
/** A filter's flattest resonance. */
const FLAT_Q = Math.SQRT1_2;

export interface VoiceOptions {
  /** When it starts, in the context's seconds. */
  start: number;
  /** Multiplies every frequency in the recipe. */
  pitch: number;
  /** Its peak level, after strength and volume. */
  level: number;
  /** -1 (left) to 1 (right). */
  pan: number;
  /** Where in the noise its noise layers start, 0 to 1. */
  noiseAt: number;
}

export interface Voice {
  /** When it has faded out, in the context's seconds (its tail in the room comes after). */
  end: number;
  /** Fades it out quickly from `at` (context seconds), and stops it. */
  stop: (at: number) => void;
}

/** Where a voice's layers go: straight out, and to the room. */
interface Buses {
  dry: AudioNode;
  room: AudioNode | undefined;
}

/** A frequency the context can play: above zero, below half its sample rate. */
function playable(context: BaseAudioContext, hertz: number): number {
  return Math.min(Math.max(hertz, 1), context.sampleRate / 2 - 1);
}

/** A value gliding from `from` to `to` (exponentially, as pitch is heard) between two times. */
function glide(
  param: AudioParam,
  from: number,
  to: number | undefined,
  start: number,
  end: number,
): void {
  param.setValueAtTime(from, start);
  if (to !== undefined && to !== from) {
    param.exponentialRampToValueAtTime(to, end);
  }
}

/** A grains layer as the tones it is: each grain a short sine at its seeded pitch. */
function grainsOf(layer: GrainsLayer): ToneLayer[] {
  const random = randomFrom(layer.seed ?? 1);
  return Array.from({ length: layer.count }, (_, index) => ({
    type: "tone" as const,
    wave: "sine" as const,
    from: layer.from + random() * (layer.to - layer.from),
    gain: layer.gain,
    at: (layer.at ?? 0) + index * layer.step,
    attack: GRAIN_ATTACK,
    decay: layer.decay,
    ...(layer.send === undefined ? {} : { send: layer.send }),
  }));
}

/** Builds and schedules one tone or noise layer; returns its sources, to stop and clean up. */
function scheduleLayer(
  context: BaseAudioContext,
  layer: ToneLayer | NoiseLayer,
  buses: Buses,
  options: VoiceOptions,
): AudioScheduledSourceNode[] {
  const peak = options.level * layer.gain;
  if (!(peak > 0)) return [];
  const begin = options.start + (layer.at ?? 0);
  const peakAt = begin + layer.attack;
  const holdUntil = peakAt + (layer.hold ?? 0);
  const end = options.start + endOf(layer);
  const hertz = (value: number) => playable(context, value * options.pitch);

  const amp = context.createGain();
  amp.gain.setValueAtTime(0, 0);
  amp.gain.setValueAtTime(peak * RAMP_FLOOR, begin);
  amp.gain.exponentialRampToValueAtTime(peak, peakAt);
  if (holdUntil > peakAt) amp.gain.setValueAtTime(peak, holdUntil);
  amp.gain.exponentialRampToValueAtTime(peak * RAMP_FLOOR, end);
  // Then truly silent, before its sources stop.
  amp.gain.linearRampToValueAtTime(0, end + TAIL / 2);
  amp.connect(buses.dry);
  if (buses.room && layer.send !== undefined && layer.send > 0) {
    const send = context.createGain();
    send.gain.value = Math.min(1, layer.send);
    amp.connect(send).connect(buses.room);
  }

  let into: AudioNode = amp;
  if (layer.filter) {
    const filter = context.createBiquadFilter();
    filter.type = layer.filter.type;
    filter.Q.setValueAtTime(layer.filter.q ?? FLAT_Q, begin);
    glide(
      filter.frequency,
      hertz(layer.filter.from),
      layer.filter.to === undefined ? undefined : hertz(layer.filter.to),
      begin,
      end,
    );
    filter.connect(amp);
    into = filter;
  }

  const sources: AudioScheduledSourceNode[] = [];
  if (layer.type === "tone") {
    const tone = context.createOscillator();
    tone.type = layer.wave;
    const from = hertz(layer.from);
    const to = layer.to === undefined ? undefined : hertz(layer.to);
    glide(tone.frequency, from, to, begin, end);
    if (layer.fm && layer.fm.depth > 0) {
      const modulator = context.createOscillator();
      const depth = context.createGain();
      glide(
        modulator.frequency,
        playable(context, from * layer.fm.ratio),
        to === undefined ? undefined : playable(context, to * layer.fm.ratio),
        begin,
        end,
      );
      // Its brightness fades with it, as a struck bell's does.
      depth.gain.setValueAtTime(from * layer.fm.depth, begin);
      depth.gain.exponentialRampToValueAtTime(
        Math.max(SILENT, from * layer.fm.depth * 0.05),
        end,
      );
      modulator.connect(depth).connect(tone.frequency);
      sources.push(modulator);
    }
    tone.connect(into);
    sources.push(tone);
  } else {
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer(context, layer.color);
    noise.loop = true;
    noise.connect(into);
    sources.push(noise);
  }

  for (const source of sources) {
    if (source instanceof AudioBufferSourceNode && source.buffer) {
      source.start(begin, options.noiseAt * source.buffer.duration);
    } else {
      source.start(begin);
    }
    source.stop(end + TAIL);
  }
  return sources;
}

/**
 * Plays `recipe` into `output` as `options` say, and what its layers send
 * into `room`, if there is one. Returns the voice, to stop it early.
 */
export function scheduleVoice(
  context: BaseAudioContext,
  recipe: Recipe,
  output: AudioNode,
  options: VoiceOptions,
  room?: AudioNode,
): Voice {
  const dry = context.createGain();
  const outputs: AudioNode[] = [dry];
  if (options.pan !== 0) {
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, options.pan)), 0);
    dry.connect(panner).connect(output);
    outputs.push(panner);
  } else {
    dry.connect(output);
  }
  // The room stays in the middle: a room does not move with what sounds in it.
  let toRoom: GainNode | undefined;
  if (room) {
    toRoom = context.createGain();
    toRoom.connect(room);
    outputs.push(toRoom);
  }
  const buses: Buses = { dry, room: toRoom };

  const sources = recipe.layers.flatMap((layer: Layer) =>
    layer.type === "grains"
      ? grainsOf(layer).flatMap((grain) =>
          scheduleLayer(context, grain, buses, options),
        )
      : scheduleLayer(context, layer, buses, options),
  );
  const end =
    options.start + Math.max(0, ...recipe.layers.map((layer) => endOf(layer)));

  // Once the last source has stopped, the whole voice is let go.
  const letGo = () => {
    for (const node of outputs) node.disconnect();
  };
  let playing = sources.length;
  for (const source of sources) {
    source.addEventListener("ended", () => {
      playing -= 1;
      if (playing === 0) letGo();
    });
  }
  if (playing === 0) letGo();

  return {
    end,
    stop: (at) => {
      const from = Math.max(at, options.start);
      for (const bus of [dry, toRoom]) {
        if (!bus) continue;
        bus.gain.cancelScheduledValues(from);
        bus.gain.setValueAtTime(1, from);
        bus.gain.exponentialRampToValueAtTime(SILENT, from + STOP_FADE);
      }
      for (const source of sources) {
        try {
          source.stop(from + STOP_FADE + 0.001);
        } catch {
          // Already stopped: nothing to do.
        }
      }
    },
  };
}

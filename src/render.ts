/**
 * Recording and measuring sounds: a recipe rendered offline is exactly what
 * plays (the same voice builds both), so it can be saved as a WAV file for
 * places that cannot run code, drawn, and measured. Its tests hold every
 * sound in a set to the same loudness, and to ending in silence.
 */
import { levelFor } from "./mix";
import { randomFrom } from "./random";
import { lengthOf, type Recipe, type SoundSet, usesRoom } from "./recipe";
import { createRoom, DEFAULT_SPACE, ROOM_SECONDS } from "./space";
import { scheduleVoice } from "./voice";

export interface RenderOptions {
  /** Default: 48000. */
  sampleRate?: number;
  /** 0 to 1. Default: 1. */
  strength?: number;
  /** Default: 1. */
  pitch?: number;
  /** -1 to 1; anything but 0 records two channels. Default: 0. */
  pan?: number;
  /** How much of the room is heard, 0 to 1, as the engine's `space`. Default: 0.25. */
  space?: number;
  /** Picks where its noise starts, as a play would. */
  seed?: number;
}

/** Seconds of silence kept after the sound, so its tail is recorded whole. */
const AFTER = 0.05;

/**
 * Records `recipe` as it plays, its tail in the room included. Two channels
 * when it is panned or uses the room, one otherwise. Needs Web Audio: a
 * browser, not Node.
 */
export function renderSound(
  recipe: Recipe,
  options: RenderOptions = {},
): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate ?? 48_000;
  const pan = options.pan ?? 0;
  const space = options.space ?? DEFAULT_SPACE;
  const inRoom = usesRoom(recipe) && space > 0;
  const seconds = lengthOf(recipe) + (inRoom ? ROOM_SECONDS : 0) + AFTER;
  const context = new OfflineAudioContext({
    numberOfChannels: pan === 0 && !inRoom ? 1 : 2,
    length: Math.ceil(seconds * sampleRate),
    sampleRate,
  });
  let room: AudioNode | undefined;
  if (inRoom) {
    const made = createRoom(context, space);
    made.output.connect(context.destination);
    room = made.input;
  }
  scheduleVoice(
    context,
    recipe,
    context.destination,
    {
      start: 0,
      pitch: options.pitch ?? 1,
      level: recipe.gain * levelFor(options.strength ?? 1),
      pan,
      noiseAt: randomFrom(options.seed ?? 1)(),
    },
    room,
  );
  return context.startRendering();
}

/** What `toWav` needs of a recording: an AudioBuffer has it. */
export interface Recording {
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  getChannelData: (channel: number) => Float32Array;
}

/** A recording as a 16-bit PCM WAV file. */
export function toWav(recording: Recording): Uint8Array<ArrayBuffer> {
  const channels = recording.numberOfChannels;
  const bytesPerSample = 2;
  const dataBytes = recording.length * channels * bytesPerSample;
  const file = new DataView(new ArrayBuffer(44 + dataBytes));
  const text = (at: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      file.setUint8(at + index, value.charCodeAt(index));
    }
  };
  text(0, "RIFF");
  file.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  file.setUint32(16, 16, true);
  file.setUint16(20, 1, true); // PCM
  file.setUint16(22, channels, true);
  file.setUint32(24, recording.sampleRate, true);
  file.setUint32(28, recording.sampleRate * channels * bytesPerSample, true);
  file.setUint16(32, channels * bytesPerSample, true);
  file.setUint16(34, 8 * bytesPerSample, true);
  text(36, "data");
  file.setUint32(40, dataBytes, true);

  const data = Array.from({ length: channels }, (_, channel) =>
    recording.getChannelData(channel),
  );
  let at = 44;
  for (let index = 0; index < recording.length; index += 1) {
    for (const samples of data) {
      const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
      file.setInt16(
        at,
        Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff),
        true,
      );
      at += bytesPerSample;
    }
  }
  return new Uint8Array(file.buffer);
}

/** Where each sound is in a sprite, in seconds. */
export type SpriteMap<Name extends string> = Record<
  Name,
  { start: number; duration: number }
>;

/**
 * Recordings joined end to end into one, with `gap` seconds of silence
 * between them, and where each one starts: an audio sprite. In two channels
 * if any of them has two.
 */
export function joinRecordings<Name extends string>(
  recordings: Record<Name, Recording>,
  gap = 0.05,
): { recording: Recording; map: SpriteMap<Name> } {
  const names = Object.keys(recordings) as Name[];
  const first = names[0] === undefined ? undefined : recordings[names[0]];
  const sampleRate = first?.sampleRate ?? 48_000;
  const channels = names.some((name) => recordings[name].numberOfChannels > 1)
    ? 2
    : 1;
  const between = Math.round(gap * sampleRate);
  const length = names.reduce(
    (total, name) => total + recordings[name].length + between,
    0,
  );
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  const map = {} as SpriteMap<Name>;
  let at = 0;
  for (const name of names) {
    const recording = recordings[name];
    data.forEach((samples, channel) => {
      // One channel plays on both sides.
      samples.set(
        recording.getChannelData(
          Math.min(channel, recording.numberOfChannels - 1),
        ),
        at,
      );
    });
    map[name] = {
      start: at / sampleRate,
      duration: recording.length / sampleRate,
    };
    at += recording.length + between;
  }
  return {
    recording: {
      numberOfChannels: channels,
      sampleRate,
      length,
      getChannelData: (channel) => data[channel] ?? new Float32Array(length),
    },
    map,
  };
}

/**
 * A whole set as one WAV file and a map of where each sound is in it: for
 * places that play files, not recipes. Needs Web Audio, as `renderSound`.
 */
export async function toSprite<Name extends string>(
  sounds: SoundSet<Name>,
  options: RenderOptions & { gap?: number } = {},
): Promise<{ wav: Uint8Array<ArrayBuffer>; map: SpriteMap<Name> }> {
  const names = Object.keys(sounds) as Name[];
  const rendered = await Promise.all(
    names.map((name) => renderSound(sounds[name], options)),
  );
  const recordings = {} as Record<Name, Recording>;
  names.forEach((name, index) => {
    const recording = rendered[index];
    if (recording) recordings[name] = recording;
  });
  const { recording, map } = joinRecordings(recordings, options.gap);
  return { wav: toWav(recording), map };
}

export interface Measurement {
  /** The loudest sample, in dB below full scale. */
  peakDb: number;
  /** Its loudest 30 ms, as RMS in dB below full scale: how loud it sounds. */
  loudnessDb: number;
  /** Seconds from when it is first heard (40 dB under its peak) to when it last is. */
  audibleSeconds: number;
  /** Seconds before it is first heard. */
  startsAt: number;
  /** Its last 10 ms, as RMS in dB below full scale: silence, if it ends cleanly. */
  tailDb: number;
}

const decibels = (level: number): number =>
  level > 0 ? 20 * Math.log10(level) : -Infinity;

/** How loud a recording is, how long it is heard, and whether it ends in silence. */
export function measure(
  samples: Float32Array,
  sampleRate: number,
): Measurement {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));

  const rms = (from: number, to: number) => {
    let sum = 0;
    for (let index = from; index < to; index += 1) {
      sum += (samples[index] ?? 0) ** 2;
    }
    return Math.sqrt(sum / Math.max(1, to - from));
  };
  const window = Math.max(1, Math.round(sampleRate * 0.03));
  const hop = Math.max(1, Math.round(sampleRate * 0.005));
  let loudest = 0;
  for (let from = 0; from < samples.length; from += hop) {
    loudest = Math.max(
      loudest,
      rms(from, Math.min(samples.length, from + window)),
    );
  }

  const heard = peak * 0.01;
  let first = -1;
  let last = -1;
  for (let index = 0; index < samples.length; index += 1) {
    if (Math.abs(samples[index] ?? 0) >= heard && heard > 0) {
      if (first < 0) first = index;
      last = index;
    }
  }
  const tail = Math.max(1, Math.round(sampleRate * 0.01));
  return {
    peakDb: decibels(peak),
    loudnessDb: decibels(loudest),
    audibleSeconds: first < 0 ? 0 : (last - first) / sampleRate,
    startsAt: first < 0 ? 0 : first / sampleRate,
    tailDb: decibels(rms(Math.max(0, samples.length - tail), samples.length)),
  };
}

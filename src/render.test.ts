import { describe, expect, it } from "vitest";

import { joinRecordings, measure, type Recording, toWav } from "./render";

const RATE = 48_000;

/** A 1 kHz sine that starts `delay` seconds in, peaks at `peak` and fades over `seconds`. */
function ping(delay: number, peak: number, seconds: number, total: number) {
  const samples = new Float32Array(Math.round(total * RATE));
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / RATE - delay;
    if (time < 0 || time > seconds) continue;
    samples[index] =
      peak *
      Math.exp((-5 * time) / seconds) *
      Math.sin(2 * Math.PI * 1000 * time);
  }
  return samples;
}

const recordingOf = (channels: Float32Array[]): Recording => ({
  numberOfChannels: channels.length,
  sampleRate: RATE,
  length: channels[0]?.length ?? 0,
  getChannelData: (channel) => channels[channel] ?? new Float32Array(),
});

describe("measure", () => {
  it("reads its peak, when it starts, and that it ends in silence", () => {
    const measured = measure(ping(0.02, 0.5, 0.1, 0.2), RATE);
    expect(measured.peakDb).toBeCloseTo(20 * Math.log10(0.5), 0);
    expect(measured.startsAt).toBeCloseTo(0.02, 2);
    expect(measured.audibleSeconds).toBeGreaterThan(0.07);
    expect(measured.audibleSeconds).toBeLessThan(0.1);
    expect(measured.tailDb).toBe(-Infinity);
    // A sine's RMS is 3 dB under its peak, less for one that fades.
    expect(measured.loudnessDb).toBeLessThan(measured.peakDb - 3);
  });

  it("hears silence as silence", () => {
    const measured = measure(new Float32Array(4800), RATE);
    expect(measured.peakDb).toBe(-Infinity);
    expect(measured.audibleSeconds).toBe(0);
  });
});

describe("toWav", () => {
  it("writes a 16-bit PCM WAV file", () => {
    const left = new Float32Array([0, 1, -1, 0.5]);
    const right = new Float32Array([0, -0.5, 2, -2]);
    const file = toWav(recordingOf([left, right]));
    const view = new DataView(file.buffer);
    const text = (at: number) =>
      String.fromCharCode(...file.subarray(at, at + 4));

    expect(text(0)).toBe("RIFF");
    expect(text(8)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(4 * 2 * 2);
    expect(file.length).toBe(44 + 16);
    // Interleaved, left then right; past full scale is held at full scale.
    const samples = Array.from({ length: 8 }, (_, index) =>
      view.getInt16(44 + index * 2, true),
    );
    expect(samples).toEqual([
      0, 0, 32767, -16384, -32768, 32767, 16384, -32768,
    ]);
  });
});

describe("joinRecordings", () => {
  it("lays recordings end to end with a gap, and says where each one is", () => {
    const one = recordingOf([new Float32Array([0.1, 0.2, 0.3, 0.4])]);
    const two = recordingOf([
      new Float32Array([0.5, 0.6]),
      new Float32Array([-0.5, -0.6]),
    ]);
    // A gap of two samples.
    const { recording, map } = joinRecordings({ one, two }, 2 / RATE);

    expect(map.one).toEqual({ start: 0, duration: 4 / RATE });
    expect(map.two).toEqual({ start: 6 / RATE, duration: 2 / RATE });
    expect(recording.numberOfChannels).toBe(2);
    expect(recording.length).toBe(4 + 2 + 2 + 2);
    // One channel plays on both sides; two keep their own.
    expect([...recording.getChannelData(0)].map((v) => +v.toFixed(1))).toEqual([
      0.1, 0.2, 0.3, 0.4, 0, 0, 0.5, 0.6, 0, 0,
    ]);
    expect([...recording.getChannelData(1)].map((v) => +v.toFixed(1))).toEqual([
      0.1, 0.2, 0.3, 0.4, 0, 0, -0.5, -0.6, 0, 0,
    ]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { createCues, type Cues, type CuesOptions } from "./engine";
import { defineSounds, type Layer, type Recipe } from "./recipe";
import { measure } from "./render";

// Each test gives the engine an OfflineAudioContext, plays into it, then
// records it: what is heard is measured, not assumed.

const RATE = 48_000;

const TONE = {
  type: "tone",
  wave: "sine",
  from: 440,
  gain: 1,
  attack: 0.005,
  decay: 0.1,
} satisfies Layer;

const BEEP = {
  gain: 0.2,
  vary: 0,
  layers: [TONE],
} satisfies Recipe;

const sounds = defineSounds({
  beep: BEEP,
  quick: { ...BEEP, every: 50 },
  pair: { ...BEEP, voices: 2 },
  loud: { ...BEEP, gain: 1, voices: 40 },
  bell: { ...BEEP, group: "feedback" },
  wobbly: { ...BEEP, vary: 0.2 },
  long: { ...BEEP, layers: [{ ...TONE, decay: 0.3 }] },
  roomy: { ...BEEP, layers: [{ ...TONE, send: 1 }] },
  roomyBell: {
    ...BEEP,
    group: "feedback",
    layers: [{ ...TONE, send: 1 }],
  },
});
type Name = keyof typeof sounds;

const made: Cues<Name>[] = [];
afterEach(() => {
  for (const cues of made.splice(0)) cues.destroy();
  localStorage.clear();
});

/** An engine that plays into a recorder, already unlocked. */
function recorded(
  options: Partial<CuesOptions<Name>> = {},
  { seconds = 0.4, channels = 1 } = {},
) {
  let context: OfflineAudioContext | undefined;
  const cues = createCues<Name>({
    sounds,
    storageKey: false,
    ...options,
    context: () => {
      context = new OfflineAudioContext({
        numberOfChannels: channels,
        length: Math.round(seconds * RATE),
        sampleRate: RATE,
      });
      return context;
    },
  });
  made.push(cues);
  cues.unlock();
  const record = async () => {
    if (!context) throw new Error("Audio never unlocked.");
    return context.startRendering();
  };
  return { cues, record };
}

const peakOf = (recording: AudioBuffer, channel = 0) =>
  Math.max(...recording.getChannelData(channel).map(Math.abs));

const rmsOf = (recording: AudioBuffer, channel: number) => {
  const samples = recording.getChannelData(channel);
  return Math.sqrt(
    samples.reduce((sum, value) => sum + value * value, 0) / samples.length,
  );
};

/** Times it crosses zero going up: its frequency, over a stretch of known length. */
const risingCrossings = (recording: AudioBuffer) => {
  const samples = recording.getChannelData(0);
  let count = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if ((samples[index - 1] ?? 0) < 0 && (samples[index] ?? 0) >= 0) count += 1;
  }
  return count;
};

/** The loudest sample after a played beep has itself ended: what the room left. */
const tailOf = async (options: Partial<CuesOptions<Name>>, name: Name) => {
  const { cues, record } = recorded(options, { seconds: 0.8, channels: 2 });
  cues.play(name);
  const samples = (await record()).getChannelData(0);
  // After the beep itself has ended (105 ms).
  return Math.max(...samples.subarray(0.2 * RATE, 0.7 * RATE).map(Math.abs));
};

describe("createCues", () => {
  it("is silent until audio unlocks", async () => {
    let context: OfflineAudioContext | undefined;
    const cues = createCues<Name>({
      sounds,
      storageKey: false,
      context: () => {
        context = new OfflineAudioContext({
          length: RATE / 4,
          sampleRate: RATE,
        });
        return context;
      },
    });
    made.push(cues);
    cues.play("beep");
    expect(cues.context()).toBeUndefined();
    cues.unlock();
    const recording = await context?.startRendering();
    expect(recording && peakOf(recording)).toBe(0);
  });

  it("plays a sound once audio has unlocked, at its level", async () => {
    const { cues, record } = recorded();
    cues.play("beep");
    expect(peakOf(await record())).toBeCloseTo(0.2, 2);
  });

  it("plays later when asked to", async () => {
    const { cues, record } = recorded();
    cues.play("beep", { delay: 0.1 });
    const recording = await record();
    expect(measure(recording.getChannelData(0), RATE).startsAt).toBeCloseTo(
      0.1,
      2,
    );
  });

  it("plays nothing while muted, and remembers muting", async () => {
    const heard = vi.fn<() => void>();
    const first = recorded({ storageKey: "test:muted" });
    first.cues.subscribe(heard);
    first.cues.setMuted(true);
    first.cues.setMuted(true);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("test:muted")).toBe("true");

    const second = recorded({ storageKey: "test:muted" });
    expect(second.cues.isMuted()).toBe(true);
    second.cues.play("beep");
    expect(peakOf(await second.record())).toBe(0);
  });

  it("skips a sound asked for again within its `every`", async () => {
    const once = recorded();
    once.cues.play("beep");
    const twiceAllowed = recorded();
    twiceAllowed.cues.play("beep");
    twiceAllowed.cues.play("beep");
    const twiceSkipped = recorded();
    twiceSkipped.cues.play("quick");
    twiceSkipped.cues.play("quick");

    const single = peakOf(await once.record());
    expect(peakOf(await twiceAllowed.record())).toBeCloseTo(single * 2, 2);
    expect(peakOf(await twiceSkipped.record())).toBeCloseTo(single, 3);
  });

  it("stops the oldest past its `voices`", async () => {
    const once = recorded();
    once.cues.play("pair");
    const five = recorded();
    for (let count = 0; count < 5; count += 1) five.cues.play("pair");
    expect(
      peakOf(await five.record()) / peakOf(await once.record()),
    ).toBeCloseTo(2, 1);
  });

  it("never clips, however many play at once", async () => {
    const { cues, record } = recorded();
    for (let count = 0; count < 30; count += 1) cues.play("loud");
    expect(peakOf(await record())).toBeLessThan(1);
  });

  it("plays softer at a lower strength, on its curve", async () => {
    const full = recorded();
    full.cues.play("beep");
    const half = recorded();
    half.cues.play("beep", { strength: 0.5 });
    const ratio = peakOf(await half.record()) / peakOf(await full.record());
    expect(ratio).toBeCloseTo(0.1 + 0.9 * 0.25, 2);
  });

  it("follows the master volume and each group's", async () => {
    const quiet = recorded({ volume: 0.5 });
    quiet.cues.play("beep");
    expect(peakOf(await quiet.record())).toBeCloseTo(0.1, 2);

    const noFeedback = recorded({ groups: { feedback: 0 } });
    noFeedback.cues.play("bell");
    expect(peakOf(await noFeedback.record())).toBe(0);
  });

  it("comes from where it happened", async () => {
    const right = recorded({ stereo: 1 }, { channels: 2 });
    right.cues.play("beep", { x: window.innerWidth });
    const fromRight = await right.record();
    expect(rmsOf(fromRight, 1)).toBeGreaterThan(rmsOf(fromRight, 0) * 10);

    const left = recorded({}, { channels: 2 });
    left.cues.play("beep", { pan: -1 });
    const fromLeft = await left.record();
    expect(rmsOf(fromLeft, 0)).toBeGreaterThan(rmsOf(fromLeft, 1) * 10);
  });

  it("plays at a pitch, without getting longer or shorter", async () => {
    const low = recorded();
    low.cues.play("beep");
    const high = recorded();
    high.cues.play("beep", { pitch: 2 });
    const lowRecording = await low.record();
    const highRecording = await high.record();
    expect(
      risingCrossings(highRecording) / risingCrossings(lowRecording),
    ).toBeCloseTo(2, 1);
    expect(
      measure(highRecording.getChannelData(0), RATE).audibleSeconds,
    ).toBeCloseTo(
      measure(lowRecording.getChannelData(0), RATE).audibleSeconds,
      2,
    );
  });

  it("varies each play, the same way for the same seed", async () => {
    const first = recorded({ seed: 7 });
    const again = recorded({ seed: 7 });
    const other = recorded({ seed: 8 });
    for (const { cues } of [first, again, other]) cues.play("wobbly");
    const [a, b, c] = await Promise.all([
      first.record(),
      again.record(),
      other.record(),
    ]);
    expect(a?.getChannelData(0)).toEqual(b?.getChannelData(0));
    expect(a?.getChannelData(0)).not.toEqual(c?.getChannelData(0));
  });

  it("tells onPlay what played, and a throw there breaks nothing", async () => {
    const onPlay = vi.fn<(event: unknown) => void>(() => {
      throw new Error("analytics down");
    });
    const { cues, record } = recorded({ onPlay });
    cues.play("bell", { strength: 0.4 });
    expect(onPlay).toHaveBeenCalledWith({
      name: "bell",
      group: "feedback",
      strength: 0.4,
    });
    expect(peakOf(await record())).toBeGreaterThan(0);
  });

  it("returns the sound, to stop it", async () => {
    const { cues, record } = recorded();
    cues.play("long").stop();
    expect(peakOf(await record())).toBeLessThan(0.01);
  });

  it("silences what is playing when it is muted", async () => {
    const { cues, record } = recorded();
    cues.play("long");
    cues.setMuted(true);
    expect(peakOf(await record())).toBeLessThan(0.01);
  });

  it("loops on the audio clock, in exact time, until stopped", async () => {
    const looping = recorded({}, { seconds: 1 });
    // A 105 ms beep every 200 ms: scheduled 0.6 s ahead, so three of them.
    looping.cues.play("beep", { loop: 0.2 });
    const samples = (await looping.record()).getChannelData(0);
    const peakBetween = (from: number, to: number) =>
      Math.max(...samples.subarray(from * RATE, to * RATE).map(Math.abs));
    for (const start of [0, 0.2, 0.4]) {
      expect(peakBetween(start, start + 0.1), `repeat at ${start}`).toBeCloseTo(
        0.2,
        2,
      );
      expect(peakBetween(start + 0.12, start + 0.19)).toBeLessThan(0.001);
    }
    expect(peakBetween(0.6, 1)).toBe(0);

    const stopped = recorded({}, { seconds: 1 });
    stopped.cues.play("beep", { loop: 0.2 }).stop();
    expect(peakOf(await stopped.record())).toBeLessThan(0.01);
  });

  it("knows which names it has", () => {
    const { cues } = recorded();
    expect(cues.has("beep")).toBe(true);
    expect(cues.has("boop")).toBe(false);
    expect(cues.has("toString")).toBe(false);
  });

  it("leaves a tail in the room for what a layer sends there", async () => {
    expect(await tailOf({}, "roomy")).toBeGreaterThan(0.0005);
    expect(await tailOf({ space: 0 }, "roomy")).toBe(0);
    expect(await tailOf({}, "beep")).toBe(0);
    // A group turned down takes its room with it.
    expect(await tailOf({ groups: { feedback: 0 } }, "roomyBell")).toBe(0);
  });

  it("does nothing once destroyed", async () => {
    const { cues, record } = recorded();
    cues.destroy();
    expect(cues.play("beep", { loop: true }).stop()).toBeUndefined();
    cues.setMuted(true);
    expect(cues.isMuted()).toBe(false);
    expect(cues.context()).toBeUndefined();
    await expect(record()).resolves.toBeDefined();
  });
});

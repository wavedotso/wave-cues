/**
 * The engine: plays a set of sounds by name.
 *
 * Browsers start audio only after a press or a key, so the engine waits for
 * one (listening before any handler can stop it) and is silent until then,
 * without a warning each time. Every sound goes through its group's volume,
 * the master volume and a soft limiter (mix.ts), so twenty ticks at once
 * never clip, and one tick alone plays at exactly its level. What a layer
 * sends to the room (space.ts) comes back as a tail of space. A sound asked
 * for again too soon is skipped (`every`), and too many at once stop the
 * oldest (`voices`). A sound can loop until it is stopped. Muting is
 * remembered. Nothing here throws: a sound is never worth breaking the page
 * for.
 */
import { levelFor, LIMIT_HEADROOM, limiterCurve, panFor } from "./mix";
import { randomFrom } from "./random";
import {
  DEFAULT_VARY,
  DEFAULT_VOICES,
  GROUPS,
  type Group,
  lengthOf,
  type Recipe,
  type SoundSet,
} from "./recipe";
import { createRoom, DEFAULT_SPACE } from "./space";
import { scheduleVoice, type Voice } from "./voice";

export interface PlayOptions {
  /** How hard, 0 to 1, on a curve the ear hears as even. Default: 1. */
  strength?: number;
  /** Multiplies its pitch: 2 is an octave up. Default: 1. */
  pitch?: number;
  /** Where it comes from, -1 (left) to 1 (right). Wins over `x`. */
  pan?: number;
  /** Or where it happened, in CSS pixels from the window's left edge: panned by `stereo`. */
  x?: number;
  /** Seconds from now: two sounds a moment apart are heard as two. */
  delay?: number;
  /**
   * Repeats until its `stop()`: `true` leaves a breath between repeats, a
   * number is the seconds from one start to the next. For states that last
   * (loading, waiting). Quiet while muted or in a hidden tab.
   */
  loop?: boolean | number;
}

/** A sound that was asked for: `stop()` fades it out at once, and ends its loop. */
export interface Playing {
  stop: () => void;
}

export interface PlayEvent<Name extends string> {
  name: Name;
  group: Group;
  strength: number;
}

export interface CuesOptions<Name extends string> {
  sounds: SoundSet<Name>;
  /** The master volume, 0 to 1. Default: 1. */
  volume?: number;
  /** Each group's volume, 0 to 1. Default: 1 each. */
  groups?: Partial<Record<Group, number>>;
  /** How much of the room is heard, 0 to 1: 0 is dry. Default: 0.25. */
  space?: number;
  /**
   * Where muting is remembered, in localStorage; `false` remembers nothing.
   * Default: "wave-cues:muted".
   */
  storageKey?: string | false;
  /** Muted at first, when nothing is remembered. Default: false. */
  muted?: boolean;
  /** How far `x` pans: 0 keeps every sound in the middle, 1 reaches the edges. Default: 0.6. */
  stereo?: number;
  /** Seeds the small differences between plays. */
  seed?: number;
  /**
   * The audio context to play into, made when audio unlocks: your own, or
   * an OfflineAudioContext to record. Default: a new AudioContext. A context
   * you give is never closed by `destroy`.
   */
  context?: () => BaseAudioContext;
  /** Told of every sound that plays (a loop, once). A throw in it is ignored. */
  onPlay?: (event: PlayEvent<Name>) => void;
}

export interface Cues<Name extends string> {
  /**
   * Plays a sound; returns it, to stop it. Silent while muted, before audio
   * unlocks, or in a hidden tab: then what it returns stops nothing.
   */
  play: (name: Name, options?: PlayOptions) => Playing;
  /** Whether the set has a sound of this name: for names that arrive as text. */
  has: (name: string) => name is Name;
  /** Starts audio now. Call it from a press or a key; the engine also does, by itself. */
  unlock: () => void;
  isMuted: () => boolean;
  /** Muting also silences what is playing. */
  setMuted: (muted: boolean) => void;
  /** Hears every change to muting; returns how to stop. Fits React's useSyncExternalStore. */
  subscribe: (listener: () => void) => () => void;
  setVolume: (volume: number) => void;
  setGroupVolume: (group: Group, volume: number) => void;
  setSpace: (space: number) => void;
  /** The audio context, once audio has unlocked. */
  context: () => BaseAudioContext | undefined;
  /** Stops everything, stops listening and lets go of the audio context. Every call after it does nothing. */
  destroy: () => void;
}

const DEFAULT_STORAGE_KEY = "wave-cues:muted";
const DEFAULT_STEREO = 0.6;
const DEFAULT_SEED = 0x57_61_76_65;
/** Seconds a volume change takes, so it does not click. */
const VOLUME_GLIDE = 0.015;
/** Seconds of silence between a loop's repeats, when it is not told its period. */
const LOOP_BREATH = 0.06;
/** A loop's repeats are scheduled this far ahead, on the audio clock, so they keep exact time. */
const LOOP_AHEAD = 0.6;
/** How often a loop checks whether more repeats are due, in milliseconds. */
const LOOP_CHECK_MS = 200;
/** The presses and keys that may start audio (iOS takes some only on release). */
const UNLOCKING = ["pointerdown", "pointerup", "keydown", "touchend"] as const;

const NOTHING: Playing = Object.freeze({ stop: () => {} });

const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

const hidden = (): boolean =>
  typeof document !== "undefined" && document.visibilityState === "hidden";

function remembered(key: string | false): boolean | undefined {
  if (key === false || typeof localStorage === "undefined") return undefined;
  try {
    const value = localStorage.getItem(key);
    return value === null ? undefined : value === "true";
  } catch {
    return undefined;
  }
}

function remember(key: string | false, muted: boolean): void {
  if (key === false || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, String(muted));
  } catch {
    // Private windows and full disks: muting lasts this visit only.
  }
}

interface Mixer {
  context: BaseAudioContext;
  master: GainNode;
  /** Each group's volume, for what plays straight out. */
  groups: Record<Group, GainNode>;
  /** Each group's volume again, for what it sends to the room. */
  sends: Record<Group, GainNode>;
  /** The room's level. */
  room: GainNode;
  owned: boolean;
}

export function createCues<Name extends string>(
  options: CuesOptions<Name>,
): Cues<Name> {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
  const stereo = options.stereo ?? DEFAULT_STEREO;
  const random = randomFrom(options.seed ?? DEFAULT_SEED);
  const volumes: Record<Group, number> = { ui: 1, feedback: 1, alert: 1 };
  for (const group of GROUPS) {
    volumes[group] = clamp01(options.groups?.[group] ?? 1);
  }
  let volume = clamp01(options.volume ?? 1);
  let space = clamp01(options.space ?? DEFAULT_SPACE);
  let muted = remembered(storageKey) ?? options.muted ?? false;
  let mixer: Mixer | undefined;
  let destroyed = false;
  const listeners = new Set<() => void>();
  /** When each sound last played, in context seconds. */
  const lastPlayed = new Map<Name, number>();
  const playing = new Map<Name, Voice[]>();
  /** How to stop each loop that is running. */
  const loops = new Set<() => void>();

  const browser = typeof window !== "undefined";
  const unlockOnGesture = () => unlock();
  const listen = (on: boolean) => {
    if (!browser) return;
    for (const type of UNLOCKING) {
      if (on) {
        window.addEventListener(type, unlockOnGesture, {
          capture: true,
          passive: true,
        });
      } else {
        window.removeEventListener(type, unlockOnGesture, { capture: true });
      }
    }
  };

  /** Group → master → limiter → speakers; and group → room → master. */
  function mix(context: BaseAudioContext, owned: boolean): Mixer {
    const headroom = context.createGain();
    headroom.gain.value = 1 / LIMIT_HEADROOM;
    const limiter = context.createWaveShaper();
    limiter.curve = limiterCurve();
    const master = context.createGain();
    master.gain.value = volume;
    master.connect(headroom).connect(limiter).connect(context.destination);
    const room = createRoom(context, space);
    room.output.connect(master);
    const channel = (group: Group, into: AudioNode): GainNode => {
      const gain = context.createGain();
      gain.gain.value = volumes[group];
      gain.connect(into);
      return gain;
    };
    return {
      context,
      master,
      groups: {
        ui: channel("ui", master),
        feedback: channel("feedback", master),
        alert: channel("alert", master),
      },
      sends: {
        ui: channel("ui", room.input),
        feedback: channel("feedback", room.input),
        alert: channel("alert", room.input),
      },
      room: room.output,
      owned,
    };
  }

  function unlock(): void {
    if (destroyed) return;
    try {
      if (!mixer) {
        const given = options.context?.();
        const context =
          given ?? new AudioContext({ latencyHint: "interactive" });
        mixer = mix(context, given === undefined);
        if (context instanceof AudioContext) {
          // Suspended again (a call, a locked phone): the next press starts it.
          context.addEventListener("statechange", () => {
            if (destroyed) return;
            listen(context.state !== "running" && context.state !== "closed");
          });
        }
      }
      const { context } = mixer;
      if (context instanceof AudioContext) {
        if (context.state === "running") {
          listen(false);
        } else if (context.state !== "closed") {
          void context.resume().catch(() => {});
        }
      } else {
        listen(false);
      }
    } catch {
      // No Web Audio here: every play stays silent.
    }
  }

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const glideTo = (param: AudioParam, value: number) => {
    if (!mixer) return;
    param.setTargetAtTime(value, mixer.context.currentTime, VOLUME_GLIDE / 3);
  };

  /** Fades out everything that is sounding; a loop keeps its place, to pick up again. */
  const silence = () => {
    const now = mixer?.context.currentTime ?? 0;
    for (const voices of playing.values()) {
      for (const voice of voices) voice.stop(now);
    }
    playing.clear();
  };

  /** One voice of `recipe`, starting at `start`: past its limit, the oldest stops. */
  function voiceOf(
    active: Mixer,
    name: Name,
    recipe: Recipe,
    start: number,
    playOptions: PlayOptions,
  ): Voice {
    const { context } = active;
    const voices = (playing.get(name) ?? []).filter(
      (voice) => voice.end > context.currentTime,
    );
    while (voices.length >= (recipe.voices ?? DEFAULT_VOICES)) {
      voices.shift()?.stop(start);
    }
    const group = recipe.group ?? "ui";
    const vary = recipe.vary ?? DEFAULT_VARY;
    const pan =
      playOptions.pan ??
      (playOptions.x !== undefined && browser
        ? panFor(playOptions.x, window.innerWidth, stereo)
        : 0);
    const voice = scheduleVoice(
      context,
      recipe,
      active.groups[group],
      {
        start,
        pitch: (playOptions.pitch ?? 1) * (1 + (random() * 2 - 1) * vary),
        level: recipe.gain * levelFor(clamp01(playOptions.strength ?? 1)),
        pan,
        noiseAt: random(),
      },
      space > 0 ? active.sends[group] : undefined,
    );
    voices.push(voice);
    playing.set(name, voices);
    return voice;
  }

  /** Repeats on the audio clock, a little ahead of time, until stopped. */
  function loopOf(
    active: Mixer,
    name: Name,
    recipe: Recipe,
    first: number,
    playOptions: PlayOptions,
  ): Playing {
    const period =
      typeof playOptions.loop === "number"
        ? Math.max(0.05, playOptions.loop)
        : lengthOf(recipe) + LOOP_BREATH;
    const voices: Voice[] = [];
    let next = first;
    const fill = () => {
      const now = active.context.currentTime;
      if (muted || hidden()) {
        // Nothing sounds; it picks up in time when it may again.
        while (next < now) next += period;
        return;
      }
      while (next < now + LOOP_AHEAD) {
        voices.push(voiceOf(active, name, recipe, next, playOptions));
        next += period;
      }
    };
    fill();
    const timer = setInterval(fill, LOOP_CHECK_MS);
    const stop = () => {
      if (!loops.delete(stop)) return;
      clearInterval(timer);
      const now = active.context.currentTime;
      for (const voice of voices) voice.stop(now);
    };
    loops.add(stop);
    return { stop };
  }

  function play(name: Name, playOptions: PlayOptions = {}): Playing {
    if (destroyed || muted || !mixer || hidden()) return NOTHING;
    const active = mixer;
    const recipe = options.sounds[name];
    const { context } = active;
    if (!recipe || context.state === "closed") return NOTHING;
    try {
      const start = context.currentTime + Math.max(0, playOptions.delay ?? 0);
      const last = lastPlayed.get(name);
      if (
        recipe.every !== undefined &&
        last !== undefined &&
        (start - last) * 1000 < recipe.every
      ) {
        return NOTHING;
      }
      lastPlayed.set(name, start);

      let sound: Playing;
      if (playOptions.loop === undefined || playOptions.loop === false) {
        const voice = voiceOf(active, name, recipe, start, playOptions);
        sound = { stop: () => voice.stop(context.currentTime) };
      } else {
        sound = loopOf(active, name, recipe, start, playOptions);
      }
      try {
        options.onPlay?.({
          name,
          group: recipe.group ?? "ui",
          strength: clamp01(playOptions.strength ?? 1),
        });
      } catch {
        // Whatever listens is never allowed to break the sound.
      }
      return sound;
    } catch {
      // Silence is the fallback.
      return NOTHING;
    }
  }

  listen(true);

  return {
    play,
    has: (name): name is Name => Object.hasOwn(options.sounds, name),
    unlock,
    isMuted: () => muted,
    setMuted: (next) => {
      if (destroyed || next === muted) return;
      muted = next;
      if (muted) silence();
      remember(storageKey, muted);
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setVolume: (next) => {
      volume = clamp01(next);
      if (mixer) glideTo(mixer.master.gain, volume);
    },
    setGroupVolume: (group, next) => {
      volumes[group] = clamp01(next);
      if (!mixer) return;
      glideTo(mixer.groups[group].gain, volumes[group]);
      glideTo(mixer.sends[group].gain, volumes[group]);
    },
    setSpace: (next) => {
      space = clamp01(next);
      if (mixer) glideTo(mixer.room.gain, space);
    },
    context: () => mixer?.context,
    destroy: () => {
      if (destroyed) return;
      for (const stop of loops) stop();
      silence();
      destroyed = true;
      listen(false);
      listeners.clear();
      if (mixer?.owned && mixer.context instanceof AudioContext) {
        void mixer.context.close().catch(() => {});
      }
      mixer = undefined;
    },
  };
}

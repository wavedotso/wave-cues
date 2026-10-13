# Wave Cues

How the interface answers you. Today in sound, synthesized as it plays; touch
and light come next.

A sound here is a recipe: a few numbers that Web Audio turns into sound at
the moment it is needed. No file is downloaded, so no sound arrives late; the
engine and a set of thirty-one sounds weigh under 6 KB gzipped; and every sound
can be tuned, by ear, in the studio. Recipes are measured, not guessed: a
sound modelled on a recording says what was measured, so the next person can
check.

- **Thirty sounds, three characters**: one vocabulary (tick, tap, success,
  notify, open, loading and the rest) in three sets: soft, glass, mechanical.
  A set is a file; a new character is a few numbers.
- **Layers**: tones that glide, filtered noise, frequency modulation for
  bells, scatters of grains for sparkle, each with its own envelope and its
  own send to the room.
- **A mixer**: groups with their own volume, a master volume, a room, and a
  soft limiter, so twenty sounds at once never clip and one alone plays at
  exactly its level, with no delay added.
- **Made for interfaces**: a sound asked for again too soon is skipped, too
  many at once stop the oldest, each play varies a little, a hit plays as hard
  as it was, a sound comes from where it happened on screen, and a sound can
  loop until you stop it.
- **From code or from markup**: `cues.play("tap")`, or `data-cue-click`.
- **Polite**: silent until the page is pressed or typed into, silent in a
  hidden tab, muting remembered, and it never throws.
- **The same every time**: nothing in it is random, so a recording of a sound
  is always the same recording, in Chromium, Firefox and WebKit, where every
  sound is recorded and measured by the tests.

## Install

```sh
pnpm add @waveso/cues
```

## Play

```ts
// sounds.ts: one engine for the app.
import { createCues } from "@waveso/cues/engine";
import { soft } from "@waveso/cues/sets/soft";

export const cues = createCues({ sounds: soft });
```

```ts
import { cues } from "./sounds";

cues.play("tap");
// As hard as the hit, and from where it happened.
cues.play("knock", { strength: 0.7, x: event.clientX });
// Until it is done.
const waiting = cues.play("loading", { loop: true });
await save();
waiting.stop();
cues.play("success");
```

`play` takes only the names in your set: `cues.play("tpa")` does not
compile. It returns the sound, to `stop()` it. Every import names its file;
there is no index.

| Option     | What it does                                                       |
| ---------- | ------------------------------------------------------------------ |
| `strength` | 0 to 1, louder on a curve the ear hears as even. Default 1.        |
| `pitch`    | Multiplies every frequency; 2 is an octave up. Same length.        |
| `x`        | CSS pixels from the window's left: pans by the engine's `stereo`.  |
| `pan`      | -1 (left) to 1 (right), instead of `x`.                            |
| `delay`    | Seconds from now.                                                  |
| `loop`     | `true`, or the seconds from one start to the next, until `stop()`. |

## The vocabulary

The sets shipped here share thirty-one names, in eight families. What each one
means is in `@waveso/cues/vocabulary`, for your docs and the studio.

| Family   | Sounds                                        |
| -------- | --------------------------------------------- |
| object   | `tick` `lift` `drop` `knock` `snap`           |
| pointer  | `hover` `pop`                                 |
| press    | `press` `release` `tap` `type`                |
| toggle   | `on` `off` `switch`                           |
| feedback | `success` `error` `warning` `denied`          |
| notify   | `notify` `ping` `message` `land`              |
| motion   | `open` `close` `slide` `swoosh`               |
| state    | `step` `loading` `ready` `complete` `sparkle` |

## Sets

- **soft**: quiet, rounded sounds for an interface you live in all day.
- **glass**: bright and crystalline, with a little room.
- **mechanical**: switches, relays, firm detents.

Change character by changing one import: `@waveso/cues/sets/glass`.

## Write a set

A set is a file of recipes. Yours can use any names. Write it with
`defineSounds`, and TypeScript checks every recipe and knows every name.

```ts
import { defineSounds } from "@waveso/cues/recipe";

export const mine = defineSounds({
  chime: {
    gain: 0.1,
    group: "feedback",
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 1760,
        gain: 1,
        attack: 0.002,
        decay: 0.6,
        fm: { ratio: 3.5, depth: 0.8 },
        send: 0.4,
      },
    ],
  },
});
```

| Recipe   | What it does                                                          |
| -------- | --------------------------------------------------------------------- |
| `gain`   | Its level at full strength, 0 to 1 (filters take some away).          |
| `layers` | Tones, noise and grains, played together, each `at` its offset.       |
| `group`  | `"ui"`, `"feedback"` or `"alert"`: the mixer channel. Default `"ui"`. |
| `vary`   | How far each play's pitch wanders: 0.05 is ±5%. Default 0.03.         |
| `every`  | Milliseconds: asked again sooner, it does not play.                   |
| `voices` | At most this many at once; one more stops the oldest. Default 6.      |

A `tone` has a `wave` and a pitch `from`, gliding `to`, and may have `fm`. A
`noise` has a `color` (white, pink or brown). Both have a `gain` (their
share), an `attack`, an optional `hold`, a `decay` (the seconds it takes to
fall 60 dB, as RT60 measures a room), and may have a `filter` that glides
too. `grains` are a scatter of short sines at seeded pitches. Any layer can
`send` some of itself to the room.

Or derive a set from another. One transform reshapes every sound; then name
the ones that need their own recipe:

```ts
import { transformSounds } from "@waveso/cues/transform";
import { soft } from "@waveso/cues/sets/soft";

export const wood = transformSounds(
  soft,
  { pitch: 0.75, decay: 0.7, noise: 1.3, wave: { sine: "triangle" } },
  { notify: myOwnBell },
);
```

A set that arrives as data, from JSON or a tool, is checked with
`checkSounds(data)`, which throws naming every problem.

## The engine

```ts
const cues = createCues({
  sounds: soft,
  volume: 0.8,
  groups: { ui: 0.6 },
  space: 0.25, // how much of the room is heard; 0 is dry
  stereo: 0.6, // how far `x` pans
  storageKey: "my-app:muted", // or false
  onPlay: ({ name, group, strength }) => analytics.track(name),
});

cues.setMuted(true); // and silences what is playing
cues.setGroupVolume("ui", 0.4);
cues.setSpace(0.4);
cues.has("tap"); // for names that arrive as text
cues.destroy();
```

Audio starts on the first press or key, by itself. To play into your own
`AudioContext`, or record into an `OfflineAudioContext`, pass `context`.

## From markup

```ts
import { bindCues } from "@waveso/cues/dom";

bindCues(cues, { observe: true });
```

```html
<button data-cue-press data-cue-release>Save</button>
<a data-cue-hover href="/docs">Docs</a>
<button data-cue-toggle aria-pressed="false">Bold</button>
<input data-cue-type />
<div data-cue-enter data-cue-exit role="status">Saved</div>
```

The listeners are on the root, so what is rendered later sounds too, and
each sound comes from where its element is. An attribute's value names
another sound: `data-cue-click="snap"`. With `observe`, elements that appear,
leave or change state (`aria-expanded`, `open`, `data-state` and the like)
sound as well.

## React

```tsx
import { useMuted } from "@waveso/cues/react";

function SoundSwitch() {
  const [muted, setMuted] = useMuted(cues);
  return <Switch checked={!muted} onCheckedChange={(on) => setMuted(!on)} />;
}
```

There is no provider: import your engine from the module that made it, and
its names stay typed.

## Record and measure

```ts
import { measure, renderSound, toSprite, toWav } from "@waveso/cues/render";

const recording = await renderSound(soft.knock, { strength: 0.8 });
const file = new Blob([toWav(recording)], { type: "audio/wav" });
const { peakDb, loudnessDb } = measure(recording.getChannelData(0), 48_000);

// A whole set as one file, and where each sound is in it.
const { wav, map } = await toSprite(soft);
```

A recording is exactly what plays: one voice builds both.

## The studio

```sh
pnpm dev
```

It opens at http://localhost:5300 (the terminal prints the address). Every
sound in every set: hear it, loop it, see it, measure it, tune each
number, copy the recipe, download a WAV or the whole set as a sprite.

## Develop

```sh
pnpm install
pnpm dev          # the studio, at http://localhost:5300
pnpm build:watch  # rebuilds dist/ as you edit, for an app that links this folder
pnpm browsers     # once: Chromium, Firefox and WebKit for the tests
pnpm test
pnpm lint && pnpm format:check && pnpm typecheck
pnpm build && pnpm check:package
```

## License

MIT

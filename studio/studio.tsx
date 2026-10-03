/**
 * Cues Studio: every sound in a set, heard, measured, drawn and tuned.
 * Change a number and play it; when it sounds right, copy the recipe into
 * the set's file. Each sound's loudness is measured the way the tests
 * measure it, so a set stays in balance while you tune it.
 */
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { createCues, type Playing } from "../src/engine";
import { useMuted } from "../src/react";
import {
  GROUPS,
  type GrainsLayer,
  type Group,
  type Layer,
  lengthOf,
  type NoiseColor,
  type NoiseLayer,
  problemsOf,
  type Recipe,
  type ToneLayer,
  type Wave,
} from "../src/recipe";
import {
  type Measurement,
  measure,
  renderSound,
  toSprite,
  toWav,
} from "../src/render";
import { glass } from "../src/sets/glass";
import { mechanical } from "../src/sets/mechanical";
import { soft } from "../src/sets/soft";
import { DEFAULT_SPACE } from "../src/space";
import { families, type Family, vocabulary } from "../src/vocabulary";

const SETS: Readonly<Record<string, Readonly<Record<string, Recipe>>>> = {
  soft,
  glass,
  mechanical,
};
const SET_NAMES = Object.keys(SETS);
const meanings: Readonly<
  Record<string, { family: Family; about: string } | undefined>
> = vocabulary;

// One engine for the page. The set it plays is this object, which the
// studio edits in place, so a change is heard on the next play.
const live: Record<string, Recipe> = { ...soft };
const cues = createCues<string>({
  sounds: live,
  storageKey: "wave-cues-studio:muted",
});

const WAVES: readonly Wave[] = ["sine", "triangle", "square", "sawtooth"];
const COLORS: readonly NoiseColor[] = ["white", "pink", "brown"];
const FILTER_TYPES = ["lowpass", "highpass", "bandpass"] as const;
const RATE = 48_000;

const without = <Value extends object, Key extends keyof Value>(
  value: Value,
  key: Key,
): Omit<Value, Key> => {
  const { [key]: _, ...rest } = value;
  return rest;
};

/** The layer without its filter, still the kind of layer it was. */
const unfiltered = (layer: ToneLayer | NoiseLayer): ToneLayer | NoiseLayer =>
  layer.type === "tone" ? without(layer, "filter") : without(layer, "filter");

const decibels = (value: number) =>
  Number.isFinite(value) ? `${value.toFixed(1)} dB` : "silent";

function save(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Slide on a log scale: for frequencies and times. */
  log?: boolean;
  unit?: string;
  digits?: number;
  /** In a row of controls: the label takes only the room it needs. */
  compact?: boolean;
  onChange: (value: number) => void;
}

/** A labelled slider with the number beside it, on a log scale where that is how it is heard. */
function NumberField({
  label,
  value,
  min,
  max,
  log = false,
  unit = "",
  digits = 3,
  compact = false,
  onChange,
}: NumberFieldProps) {
  const id = useId();
  const steps = 1000;
  const toSlider = (number: number) =>
    log
      ? (Math.log(number / min) / Math.log(max / min)) * steps
      : ((number - min) / (max - min)) * steps;
  const fromSlider = (position: number) =>
    log
      ? min * (max / min) ** (position / steps)
      : min + (position / steps) * (max - min);
  return (
    <label
      htmlFor={id}
      className={`grid items-center gap-3 text-[12px] ${
        compact
          ? "grid-cols-[auto_1fr_2.5rem]"
          : "grid-cols-[7.5rem_1fr_5.5rem]"
      }`}
    >
      <span className="text-zinc-400">{label}</span>
      <input
        id={id}
        type="range"
        min={0}
        max={steps}
        value={toSlider(Math.min(max, Math.max(min, value)))}
        onChange={(event) =>
          onChange(
            Number(fromSlider(Number(event.target.value)).toPrecision(4)),
          )
        }
        className="h-4 w-full cursor-pointer accent-sky-400"
      />
      <span className="text-right font-mono text-zinc-200 tabular-nums">
        {value.toFixed(digits)}
        {unit}
      </span>
    </label>
  );
}

function Choice<Option extends string>({
  label,
  value,
  options,
  compact = false,
  onChange,
}: {
  label: string;
  value: Option;
  options: readonly Option[];
  compact?: boolean;
  onChange: (value: Option) => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`grid items-center gap-3 text-[12px] ${
        compact ? "grid-cols-[auto_1fr]" : "grid-cols-[7.5rem_1fr]"
      }`}
    >
      <span className="text-zinc-400">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const next = options.find((option) => option === event.target.value);
          if (next) onChange(next);
        }}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-400">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 accent-sky-400"
      />
      {label}
    </label>
  );
}

function Panel({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
          {title}
        </h3>
        {actions}
      </header>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

const BUTTON =
  "cursor-pointer rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[12px] text-zinc-200 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-sky-400";

/** The recording, drawn: each column its loudest and quietest sample. */
function Waveform({ samples }: { samples: Float32Array | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const ratio = devicePixelRatio;
    const width = element.clientWidth;
    const height = element.clientHeight;
    element.width = width * ratio;
    element.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#38bdf8";
    if (!samples || samples.length === 0) return;
    let peak = 0;
    for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
    const scale = peak > 0 ? (height / 2 - 4) / peak : 0;
    const perColumn = samples.length / width;
    for (let x = 0; x < width; x += 1) {
      let low = 0;
      let high = 0;
      for (
        let index = Math.floor(x * perColumn);
        index < Math.floor((x + 1) * perColumn);
        index += 1
      ) {
        const sample = samples[index] ?? 0;
        low = Math.min(low, sample);
        high = Math.max(high, sample);
      }
      context.fillRect(
        x,
        height / 2 - high * scale,
        1,
        Math.max(1, (high - low) * scale),
      );
    }
  }, [samples]);
  return (
    <canvas
      ref={canvas}
      aria-label="The sound's waveform, scaled to its peak"
      className="h-28 w-full rounded-lg bg-zinc-950"
    />
  );
}

/** How much of a layer goes to the room. */
function SendField({
  send,
  onChange,
}: {
  send: number | undefined;
  onChange: (send: number) => void;
}) {
  return (
    <NumberField
      label="Send to room"
      value={send ?? 0}
      min={0}
      max={1}
      digits={2}
      onChange={onChange}
    />
  );
}

function GrainsFields({
  layer,
  onChange,
}: {
  layer: GrainsLayer;
  onChange: (layer: Layer) => void;
}) {
  return (
    <>
      <NumberField
        label="Grains"
        value={layer.count}
        min={1}
        max={32}
        digits={0}
        onChange={(count) => onChange({ ...layer, count: Math.round(count) })}
      />
      <NumberField
        label="Step"
        value={layer.step}
        min={0.005}
        max={0.5}
        log
        unit=" s"
        onChange={(step) => onChange({ ...layer, step })}
      />
      <NumberField
        label="From"
        value={layer.from}
        min={20}
        max={12_000}
        log
        unit=" Hz"
        digits={0}
        onChange={(from) => onChange({ ...layer, from })}
      />
      <NumberField
        label="To"
        value={layer.to}
        min={20}
        max={12_000}
        log
        unit=" Hz"
        digits={0}
        onChange={(to) => onChange({ ...layer, to })}
      />
      <NumberField
        label="Seed"
        value={layer.seed ?? 1}
        min={1}
        max={99}
        digits={0}
        onChange={(seed) => onChange({ ...layer, seed: Math.round(seed) })}
      />
      <NumberField
        label="Gain"
        value={layer.gain}
        min={0}
        max={1}
        onChange={(gain) => onChange({ ...layer, gain })}
      />
      <NumberField
        label="Starts at"
        value={layer.at ?? 0}
        min={0}
        max={2}
        unit=" s"
        onChange={(at) => onChange({ ...layer, at })}
      />
      <NumberField
        label="Decay (−60 dB)"
        value={layer.decay}
        min={0.002}
        max={2}
        log
        unit=" s"
        digits={4}
        onChange={(decay) => onChange({ ...layer, decay })}
      />
      <SendField
        send={layer.send}
        onChange={(send) => onChange({ ...layer, send })}
      />
    </>
  );
}

function ToneFields({
  layer,
  onChange,
}: {
  layer: ToneLayer;
  onChange: (layer: Layer) => void;
}) {
  return (
    <>
      <Choice<Wave>
        label="Wave"
        value={layer.wave}
        options={WAVES}
        onChange={(wave) => onChange({ ...layer, wave })}
      />
      <NumberField
        label="From"
        value={layer.from}
        min={20}
        max={12_000}
        log
        unit=" Hz"
        digits={0}
        onChange={(from) => onChange({ ...layer, from })}
      />
      <Switch
        label="Glides"
        checked={layer.to !== undefined}
        onChange={(on) =>
          onChange(on ? { ...layer, to: layer.from / 2 } : without(layer, "to"))
        }
      />
      {layer.to === undefined ? null : (
        <NumberField
          label="To"
          value={layer.to}
          min={20}
          max={12_000}
          log
          unit=" Hz"
          digits={0}
          onChange={(to) => onChange({ ...layer, to })}
        />
      )}
      <Switch
        label="Frequency modulation (bells, glass)"
        checked={layer.fm !== undefined}
        onChange={(on) =>
          onChange(
            on
              ? { ...layer, fm: { ratio: 3.5, depth: 1 } }
              : without(layer, "fm"),
          )
        }
      />
      {layer.fm ? (
        <>
          <NumberField
            label="FM ratio"
            value={layer.fm.ratio}
            min={0.25}
            max={12}
            log
            digits={2}
            onChange={(ratio) =>
              layer.fm && onChange({ ...layer, fm: { ...layer.fm, ratio } })
            }
          />
          <NumberField
            label="FM depth"
            value={layer.fm.depth}
            min={0}
            max={8}
            digits={2}
            onChange={(depth) =>
              layer.fm && onChange({ ...layer, fm: { ...layer.fm, depth } })
            }
          />
        </>
      ) : null}
    </>
  );
}

/** What a tone and a noise layer share: their level, envelope, filter and send. */
function ShapedFields({
  layer,
  onChange,
}: {
  layer: ToneLayer | NoiseLayer;
  onChange: (layer: Layer) => void;
}) {
  const time = (
    key: "attack" | "hold" | "decay",
    label: string,
    min: number,
  ) => (
    <NumberField
      label={label}
      value={Math.max(min, layer[key] ?? min)}
      min={min}
      max={2}
      log
      unit=" s"
      digits={4}
      onChange={(value) => onChange({ ...layer, [key]: value })}
    />
  );
  const { filter } = layer;
  return (
    <>
      <NumberField
        label="Gain"
        value={layer.gain}
        min={0}
        max={1}
        onChange={(gain) => onChange({ ...layer, gain })}
      />
      <NumberField
        label="Starts at"
        value={layer.at ?? 0}
        min={0}
        max={2}
        unit=" s"
        onChange={(at) => onChange({ ...layer, at })}
      />
      {time("attack", "Attack", 0.0005)}
      {time("hold", "Hold", 0.0001)}
      {time("decay", "Decay (−60 dB)", 0.002)}
      <SendField
        send={layer.send}
        onChange={(send) => onChange({ ...layer, send })}
      />
      <Switch
        label="Filter"
        checked={filter !== undefined}
        onChange={(on) =>
          onChange(
            on
              ? { ...layer, filter: { type: "lowpass", from: 2000 } }
              : unfiltered(layer),
          )
        }
      />
      {filter ? (
        <>
          <Choice
            label="Filter type"
            value={filter.type}
            options={FILTER_TYPES}
            onChange={(type) =>
              onChange({ ...layer, filter: { ...filter, type } })
            }
          />
          <NumberField
            label="Filter from"
            value={filter.from}
            min={20}
            max={20_000}
            log
            unit=" Hz"
            digits={0}
            onChange={(from) =>
              onChange({ ...layer, filter: { ...filter, from } })
            }
          />
          <Switch
            label="Filter glides"
            checked={filter.to !== undefined}
            onChange={(on) =>
              onChange({
                ...layer,
                filter: on
                  ? { ...filter, to: filter.from * 2 }
                  : without(filter, "to"),
              })
            }
          />
          {filter.to === undefined ? null : (
            <NumberField
              label="Filter to"
              value={filter.to}
              min={20}
              max={20_000}
              log
              unit=" Hz"
              digits={0}
              onChange={(to) =>
                onChange({ ...layer, filter: { ...filter, to } })
              }
            />
          )}
          <NumberField
            label="Resonance"
            value={filter.q ?? Math.SQRT1_2}
            min={0.1}
            max={20}
            log
            digits={2}
            onChange={(q) => onChange({ ...layer, filter: { ...filter, q } })}
          />
        </>
      ) : null}
    </>
  );
}

function LayerEditor({
  layer,
  onChange,
  onRemove,
}: {
  layer: Layer;
  onChange: (layer: Layer) => void;
  onRemove: (() => void) | undefined;
}) {
  const title =
    layer.type === "tone"
      ? `Tone · ${layer.wave}`
      : layer.type === "noise"
        ? `Noise · ${layer.color}`
        : `Grains · ${layer.count}`;
  return (
    <Panel
      title={title}
      actions={
        onRemove ? (
          <button type="button" onClick={onRemove} className={BUTTON}>
            Remove
          </button>
        ) : undefined
      }
    >
      {layer.type === "grains" ? (
        <GrainsFields layer={layer} onChange={onChange} />
      ) : (
        <>
          {layer.type === "tone" ? (
            <ToneFields layer={layer} onChange={onChange} />
          ) : (
            <Choice<NoiseColor>
              label="Colour"
              value={layer.color}
              options={COLORS}
              onChange={(color) => onChange({ ...layer, color })}
            />
          )}
          <ShapedFields layer={layer} onChange={onChange} />
        </>
      )}
    </Panel>
  );
}

const NEW_LAYERS: Readonly<Record<Layer["type"], Layer>> = {
  tone: {
    type: "tone",
    wave: "sine",
    from: 440,
    gain: 0.5,
    attack: 0.005,
    decay: 0.15,
  },
  noise: {
    type: "noise",
    color: "pink",
    gain: 0.5,
    attack: 0.001,
    decay: 0.03,
    filter: { type: "highpass", from: 1000 },
  },
  grains: {
    type: "grains",
    count: 5,
    step: 0.03,
    from: 1600,
    to: 4600,
    gain: 0.5,
    decay: 0.1,
  },
};

export function Studio() {
  const [setName, setSetName] = useState("soft");
  const [sounds, setSounds] = useState<Record<string, Recipe>>(() => ({
    ...soft,
  }));
  const names = Object.keys(sounds);
  const [selected, setSelected] = useState(names[0] ?? "");
  const [strength, setStrength] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [pan, setPan] = useState(0);
  const [space, setSpace] = useState(DEFAULT_SPACE);
  const [looping, setLooping] = useState(false);
  const [measured, setMeasured] = useState<Record<string, Measurement>>({});
  const [samples, setSamples] = useState<Float32Array>();
  const [copied, setCopied] = useState(false);
  const [muted, setMuted] = useMuted(cues);
  const sounding = useRef<Playing | undefined>(undefined);
  const recipe = sounds[selected];
  const original: Readonly<Record<string, Recipe>> = SETS[setName] ?? soft;

  // Every sound measured as the tests measure it; the selected one drawn.
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      void Promise.all(
        Object.entries(sounds).map(async ([name, each]) => {
          const recording = await renderSound(each, {
            sampleRate: RATE,
            space,
          });
          return [name, recording.getChannelData(0)] as const;
        }),
      ).then((recordings) => {
        if (!current) return;
        setMeasured(
          Object.fromEntries(
            recordings.map(([name, data]) => [name, measure(data, RATE)]),
          ),
        );
        setSamples(recordings.find(([name]) => name === selected)?.[1]);
      });
    }, 120);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [sounds, selected, space]);

  const stop = () => {
    sounding.current?.stop();
    sounding.current = undefined;
  };
  const play = (name = selected, loop = looping) => {
    stop();
    sounding.current = cues.play(name, { strength, pitch, pan, loop });
  };

  // Space plays the selected sound, unless a field has the keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.key !== " " ||
        (target instanceof HTMLElement &&
          target.closest("input, select, textarea, button"))
      ) {
        return;
      }
      event.preventDefault();
      sounding.current?.stop();
      sounding.current = cues.play(selected, {
        strength,
        pitch,
        pan,
        loop: looping,
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, strength, pitch, pan, looping]);

  const change = (next: Recipe) => {
    live[selected] = next;
    setSounds((before) => ({ ...before, [selected]: next }));
  };

  const choose = (next: string) => {
    const chosen = SETS[next];
    if (!chosen) return;
    stop();
    for (const name of Object.keys(live)) delete live[name];
    Object.assign(live, chosen);
    setSetName(next);
    setSounds({ ...chosen });
    if (!chosen[selected]) setSelected(Object.keys(chosen)[0] ?? "");
  };

  const download = async () => {
    if (!recipe) return;
    const recording = await renderSound(recipe, {
      sampleRate: RATE,
      strength,
      pitch,
      pan,
      space,
    });
    save(`${setName}-${selected}.wav`, toWav(recording), "audio/wav");
  };

  const downloadSprite = async () => {
    const { wav, map } = await toSprite(sounds, { sampleRate: RATE, space });
    save(`${setName}-sprite.wav`, wav, "audio/wav");
    save(
      `${setName}-sprite.json`,
      JSON.stringify(map, null, 2),
      "application/json",
    );
  };

  const copy = () => {
    if (!recipe) return;
    void navigator.clipboard
      .writeText(JSON.stringify(recipe, null, 2))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
  };

  const problems = recipe ? problemsOf(recipe) : [];
  const shown = measured[selected];
  const byFamily = Object.keys(families).map((family) => ({
    family,
    names: names.filter((name) => meanings[name]?.family === family),
  }));
  const unnamed = names.filter((name) => !meanings[name]);
  const groups = [
    ...byFamily,
    ...(unnamed.length > 0 ? [{ family: "other", names: unnamed }] : []),
  ].filter((group) => group.names.length > 0);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-100">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 px-6 py-3">
        <h1 className="text-[15px] font-semibold">Cues Studio</h1>
        <div className="flex flex-wrap items-center gap-5">
          <div className="w-44">
            <Choice
              compact
              label="Set"
              value={setName}
              options={SET_NAMES}
              onChange={choose}
            />
          </div>
          <div className="w-64">
            <NumberField
              compact
              label="Room"
              value={space}
              min={0}
              max={1}
              digits={2}
              onChange={(next) => {
                setSpace(next);
                cues.setSpace(next);
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => void downloadSprite()}
            className={BUTTON}
          >
            Download sprite
          </button>
          <Switch label="Muted" checked={muted} onChange={setMuted} />
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[17rem_1fr]">
        <nav
          aria-label="Sounds"
          className="max-h-[calc(100vh-3.5rem)] overflow-y-auto border-r border-zinc-800 p-3"
        >
          {groups.map((group) => (
            <section key={group.family} className="mb-3">
              <h2 className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">
                {group.family}
              </h2>
              <ul className="flex flex-col gap-0.5">
                {group.names.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      aria-current={name === selected ? "true" : undefined}
                      onClick={() => {
                        setSelected(name);
                        play(name, false);
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-1.5 text-left text-[13px] focus-visible:outline-2 focus-visible:outline-sky-400 ${
                        name === selected
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-300 hover:bg-zinc-900"
                      }`}
                    >
                      {name}
                      <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                        {measured[name]
                          ? decibels(measured[name].loudnessDb)
                          : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="px-3 text-[11px] leading-relaxed text-zinc-500">
            Loudness is each sound's loudest 30 ms. Space plays the selected
            one.
          </p>
        </nav>

        {recipe ? (
          <main className="grid grid-cols-1 content-start gap-4 p-6 xl:grid-cols-[1fr_1fr]">
            <div className="flex flex-col gap-4">
              <Panel
                title={selected}
                actions={
                  <div className="flex gap-2">
                    <button type="button" onClick={copy} className={BUTTON}>
                      {copied ? "Copied" : "Copy recipe"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void download()}
                      className={BUTTON}
                    >
                      Download WAV
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const first = original[selected];
                        if (first) change(first);
                      }}
                      className={BUTTON}
                    >
                      Reset
                    </button>
                  </div>
                }
              >
                {meanings[selected] ? (
                  <p className="text-[13px] text-zinc-300">
                    {meanings[selected].about}
                  </p>
                ) : null}
                <Waveform samples={samples} />
                <dl className="grid grid-cols-4 gap-2 text-[12px]">
                  {[
                    ["Peak", shown ? decibels(shown.peakDb) : ""],
                    ["Loudness", shown ? decibels(shown.loudnessDb) : ""],
                    [
                      "Heard for",
                      shown
                        ? `${(shown.audibleSeconds * 1000).toFixed(0)} ms`
                        : "",
                    ],
                    ["Length", `${(lengthOf(recipe) * 1000).toFixed(0)} ms`],
                  ].map(([term, value]) => (
                    <div
                      key={term}
                      className="rounded-lg bg-zinc-950 px-3 py-2"
                    >
                      <dt className="text-zinc-500">{term}</dt>
                      <dd className="font-mono text-zinc-100 tabular-nums">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => play()}
                    className="flex-1 cursor-pointer rounded-lg bg-sky-400 px-4 py-2 text-[13px] font-semibold text-zinc-950 hover:bg-sky-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                  >
                    Play
                  </button>
                  <button type="button" onClick={stop} className={BUTTON}>
                    Stop
                  </button>
                  <Switch
                    label="Loop"
                    checked={looping}
                    onChange={(on) => {
                      setLooping(on);
                      if (!on) stop();
                    }}
                  />
                </div>
                <NumberField
                  label="Strength"
                  value={strength}
                  min={0}
                  max={1}
                  digits={2}
                  onChange={setStrength}
                />
                <NumberField
                  label="Pitch"
                  value={pitch}
                  min={0.25}
                  max={4}
                  log
                  digits={2}
                  unit="×"
                  onChange={setPitch}
                />
                <NumberField
                  label="Pan"
                  value={pan}
                  min={-1}
                  max={1}
                  digits={2}
                  onChange={setPan}
                />
                {problems.length > 0 ? (
                  <ul className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[12px] text-amber-200">
                    {problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                ) : null}
              </Panel>

              <Panel title="Recipe">
                <NumberField
                  label="Gain"
                  value={recipe.gain}
                  min={0}
                  max={1}
                  onChange={(gain) => change({ ...recipe, gain })}
                />
                <Choice<Group>
                  label="Group"
                  value={recipe.group ?? "ui"}
                  options={GROUPS}
                  onChange={(group) => change({ ...recipe, group })}
                />
                <NumberField
                  label="Vary (pitch)"
                  value={recipe.vary ?? 0.03}
                  min={0}
                  max={0.5}
                  digits={2}
                  onChange={(vary) => change({ ...recipe, vary })}
                />
                <NumberField
                  label="Every"
                  value={recipe.every ?? 0}
                  min={0}
                  max={500}
                  unit=" ms"
                  digits={0}
                  onChange={(every) =>
                    change({ ...recipe, every: Math.round(every) })
                  }
                />
                <NumberField
                  label="Voices"
                  value={recipe.voices ?? 6}
                  min={1}
                  max={16}
                  digits={0}
                  onChange={(voices) =>
                    change({ ...recipe, voices: Math.round(voices) })
                  }
                />
              </Panel>
            </div>

            <div className="flex flex-col gap-4">
              {recipe.layers.map((layer, index) => (
                <LayerEditor
                  // Layers have no names: their place in the recipe is who they are.
                  // oxlint-disable-next-line react/no-array-index-key
                  key={index}
                  layer={layer}
                  onChange={(next) =>
                    change({
                      ...recipe,
                      layers: recipe.layers.map((each, at) =>
                        at === index ? next : each,
                      ),
                    })
                  }
                  onRemove={
                    recipe.layers.length > 1
                      ? () =>
                          change({
                            ...recipe,
                            layers: recipe.layers.filter(
                              (_, at) => at !== index,
                            ),
                          })
                      : undefined
                  }
                />
              ))}
              <div className="flex gap-2">
                {(["tone", "noise", "grains"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={BUTTON}
                    onClick={() =>
                      change({
                        ...recipe,
                        layers: [...recipe.layers, NEW_LAYERS[type]],
                      })
                    }
                  >
                    Add {type === "grains" ? "grains" : `a ${type}`}
                  </button>
                ))}
              </div>
            </div>
          </main>
        ) : null}
      </div>
    </div>
  );
}

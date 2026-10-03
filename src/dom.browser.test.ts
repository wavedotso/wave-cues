import { afterEach, describe, expect, it } from "vitest";

import { bindCues } from "./dom";
import type { PlayOptions } from "./engine";

// What the attributes ask to be played is recorded, not heard: the engine
// has its own tests.

const NAMES = new Set([
  "press",
  "release",
  "tap",
  "hover",
  "type",
  "on",
  "off",
  "open",
  "close",
  "switch",
  "snap",
]);

function recorder() {
  const played: [string, PlayOptions | undefined][] = [];
  return {
    played,
    names: () => played.map(([name]) => name),
    cues: {
      has: (name: string): name is string => NAMES.has(name),
      play: (name: string, options?: PlayOptions) => {
        played.push([name, options]);
        return { stop: () => {} };
      },
    },
  };
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.replaceChildren();
});

function page(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

const fire = (target: Element, type: string, init: PointerEventInit = {}) =>
  target.dispatchEvent(
    type.startsWith("pointer")
      ? new PointerEvent(type, { bubbles: true, pointerType: "mouse", ...init })
      : new MouseEvent(type, { bubbles: true, ...init }),
  );

/** Lets queued microtasks, and the observer's, run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("bindCues", () => {
  it("plays presses, releases and clicks from where they happened", () => {
    const host = page(
      `<button data-cue-press data-cue-release data-cue-click="snap" style="position:fixed;left:100px;top:0;width:60px;height:20px"><b>Save</b></button>`,
    );
    const { cues, played } = recorder();
    cleanups.push(bindCues(cues));
    // The press lands on the bold text inside the button.
    const inside = host.querySelector("b");
    if (!inside) throw new Error("No button.");
    fire(inside, "pointerdown");
    fire(inside, "pointerup");
    fire(inside, "click");
    expect(played).toEqual([
      ["press", { x: 130 }],
      ["release", { x: 130 }],
      ["snap", { x: 130 }],
    ]);
  });

  it("is silent for a name the set does not have", () => {
    const host = page(`<button data-cue-click="trombone">Go</button>`);
    const { cues, played } = recorder();
    cleanups.push(bindCues(cues));
    fire(host.querySelector("button") ?? host, "click");
    expect(played).toEqual([]);
  });

  it("plays a hover once as the pointer arrives, not again across its children, and never for a finger", () => {
    const host = page(
      `<a data-cue-hover href="#one"><i>One</i><u>more</u></a><a data-cue-hover="tap" href="#two">Two</a>`,
    );
    const { cues, names } = recorder();
    cleanups.push(bindCues(cues));
    const [one, two] = host.querySelectorAll("a");
    const [first, second] = one?.children ?? [];
    if (!one || !two || !first || !second) throw new Error("No links.");

    fire(first, "pointerover");
    fire(first, "pointerout", { relatedTarget: second });
    fire(second, "pointerover");
    expect(names()).toEqual(["hover"]);

    fire(second, "pointerout", { relatedTarget: two });
    fire(two, "pointerover");
    expect(names()).toEqual(["hover", "tap"]);

    fire(two, "pointerout", { relatedTarget: null });
    fire(one, "pointerover", { pointerType: "touch" });
    expect(names()).toEqual(["hover", "tap"]);
  });

  it("plays on or off for a toggle, by the state its click left it in", async () => {
    const host = page(
      `<button data-cue-toggle aria-pressed="false">Bold</button>`,
    );
    const button = host.querySelector("button");
    if (!button) throw new Error("No button.");
    button.addEventListener("click", () => {
      const pressed = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", String(!pressed));
    });
    const { cues, names } = recorder();
    cleanups.push(bindCues(cues));
    fire(button, "click");
    await settle();
    fire(button, "click");
    await settle();
    expect(names()).toEqual(["on", "off"]);
  });

  it("plays a key for what is typed in a field, not for an arrow", () => {
    const host = page(`<input data-cue-type aria-label="Name" />`);
    const field = host.querySelector("input");
    if (!field) throw new Error("No field.");
    const { cues, names } = recorder();
    cleanups.push(bindCues(cues));
    for (const key of ["a", "Backspace", "ArrowLeft", "Shift"]) {
      field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }
    expect(names()).toEqual(["type", "type"]);
  });

  it("with observe, plays what appears, changes state and leaves", async () => {
    const host = page(`<section></section>`);
    const { cues, names } = recorder();
    cleanups.push(bindCues(cues, { observe: true }));

    const toast = document.createElement("div");
    toast.innerHTML = `<p data-cue-enter data-cue-exit>Saved</p>`;
    host.append(toast);
    await settle();
    expect(names()).toEqual(["open"]);

    const drawer = document.createElement("div");
    drawer.setAttribute("data-cue-change", "");
    host.append(drawer);
    await settle();
    drawer.setAttribute("aria-expanded", "true");
    drawer.className = "wide";
    await settle();
    expect(names()).toEqual(["open", "switch"]);

    toast.remove();
    await settle();
    expect(names()).toEqual(["open", "switch", "close"]);
  });

  it("stops when it is unbound", async () => {
    const host = page(`<button data-cue-click>Go</button>`);
    const { cues, played } = recorder();
    const unbind = bindCues(cues, { observe: true });
    unbind();
    fire(host.querySelector("button") ?? host, "click");
    host.append(
      Object.assign(document.createElement("p"), {
        innerHTML: `<i data-cue-enter></i>`,
      }),
    );
    await settle();
    expect(played).toEqual([]);
  });
});

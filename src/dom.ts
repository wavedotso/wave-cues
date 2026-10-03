/**
 * Sounds from markup: put an attribute on what should sound, and bind once.
 * The listeners are on the root, not on each element, so what is rendered
 * later (a dialog, a route, a list row) sounds too. Each sound comes from
 * where its element is on screen.
 *
 *   data-cue-press      pointer down        default "press"
 *   data-cue-release    pointer up          default "release"
 *   data-cue-click      click               default "tap"
 *   data-cue-hover      pointer or focus arrives (not a finger)   default "hover"
 *   data-cue-toggle     click: "on" or "off", by its aria-pressed or aria-checked
 *   data-cue-type       a key in a field    default "type"
 *
 * and, with `observe`, what the interface does by itself:
 *
 *   data-cue-enter      the element appears     default "open"
 *   data-cue-exit       the element is removed  default "close"
 *   data-cue-change     its state changes       default "switch"
 *
 * An attribute's value names another sound: `data-cue-click="snap"`. A name
 * the set does not have is silent. This module is apart from the engine, so
 * an app that plays its sounds from code does not carry it.
 */
import type { Cues } from "./engine";

export interface BindOptions {
  /** Where to listen. Default: the document. */
  root?: Document | HTMLElement;
  /**
   * Also sound elements that appear, leave or change state. Off by
   * default: it watches the page for as long as it is bound. Only what
   * changes after binding sounds, so the first render is silent.
   */
  observe?: boolean;
}

/** The attributes that count as a change of state; never `class`, which changes on every hover. */
const STATE = [
  "aria-expanded",
  "aria-selected",
  "aria-checked",
  "aria-pressed",
  "open",
  "data-state",
];

const DEFAULTS = {
  press: "press",
  release: "release",
  click: "tap",
  hover: "hover",
  type: "type",
  enter: "open",
  exit: "close",
  change: "switch",
} as const;

type Action = keyof typeof DEFAULTS;

/** Where an element's middle is across the window, in CSS pixels. */
const middleOf = (element: Element): number => {
  const box = element.getBoundingClientRect();
  return box.left + box.width / 2;
};

/** The nearest element, from the event's target up, that has this action's attribute. */
const hit = (event: Event, action: Action | "toggle"): Element | null =>
  event.target instanceof Element
    ? event.target.closest(`[data-cue-${action}]`)
    : null;

/**
 * Binds the `data-cue-*` attributes under the root to `cues`. Returns how
 * to unbind.
 */
export function bindCues<Name extends string>(
  cues: Pick<Cues<Name>, "has" | "play">,
  options: BindOptions = {},
): () => void {
  if (typeof document === "undefined") return () => {};
  const root = options.root ?? document;
  const bound = new AbortController();
  const { signal } = bound;

  /** Plays `name` if the set has it, from where `element` is; from the middle when it is nowhere. */
  const sound = (name: string, element: Element | undefined) => {
    if (!cues.has(name)) return;
    cues.play(
      name,
      element?.isConnected ? { x: middleOf(element) } : undefined,
    );
  };
  const act = (element: Element, action: Action) =>
    sound(
      element.getAttribute(`data-cue-${action}`) || DEFAULTS[action],
      element,
    );
  const on = (type: string, listener: (event: Event) => void) =>
    root.addEventListener(type, listener, { signal });

  on("pointerdown", (event) => {
    const element = hit(event, "press");
    if (element) act(element, "press");
  });
  on("pointerup", (event) => {
    const element = hit(event, "release");
    if (element) act(element, "release");
  });
  on("click", (event) => {
    const clicked = hit(event, "click");
    if (clicked) act(clicked, "click");
    const toggled = hit(event, "toggle");
    if (!toggled) return;
    // After the click's own handlers have changed its state.
    queueMicrotask(() => {
      const [onName = "on", offName = "off"] = (
        toggled.getAttribute("data-cue-toggle") ?? ""
      )
        .split(/\s+/)
        .filter(Boolean);
      const isOn =
        toggled.getAttribute("aria-pressed") === "true" ||
        toggled.getAttribute("aria-checked") === "true" ||
        (toggled instanceof HTMLInputElement && toggled.checked);
      sound(isOn ? onName : offName, toggled);
    });
  });
  on("keydown", (event) => {
    const element = hit(event, "type");
    if (!element || !(event instanceof KeyboardEvent)) return;
    if (event.key.length === 1 || event.key === "Backspace") {
      act(element, "type");
    }
  });

  // Moving across an element's own children is not arriving again.
  let hovered: Element | null = null;
  on("pointerover", (event) => {
    if (event instanceof PointerEvent && event.pointerType === "touch") return;
    const element = hit(event, "hover");
    if (element === hovered) return;
    hovered = element;
    if (element) act(element, "hover");
  });
  on("pointerout", (event) => {
    const to = event instanceof PointerEvent ? event.relatedTarget : null;
    if (hovered && !(to instanceof Node && hovered.contains(to))) {
      hovered = null;
    }
  });
  // The keyboard arrives too.
  on("focusin", (event) => {
    const element = hit(event, "hover");
    if (element && element.matches(":focus-visible")) act(element, "hover");
  });

  if (options.observe && typeof MutationObserver !== "undefined") {
    /** The elements with this attribute in what was added or removed, itself included. */
    const within = (node: Node, action: Action): Element[] => {
      if (!(node instanceof Element)) return [];
      const selector = `[data-cue-${action}]`;
      return [
        ...(node.matches(selector) ? [node] : []),
        ...node.querySelectorAll(selector),
      ];
    };
    const watching = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") {
          if (
            record.target instanceof Element &&
            record.target.hasAttribute("data-cue-change")
          ) {
            act(record.target, "change");
          }
          continue;
        }
        for (const node of record.addedNodes) {
          for (const element of within(node, "enter")) act(element, "enter");
        }
        for (const node of record.removedNodes) {
          for (const element of within(node, "exit")) act(element, "exit");
        }
      }
    });
    watching.observe(root instanceof Document ? root.documentElement : root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: STATE,
    });
    signal.addEventListener("abort", () => watching.disconnect());
  }

  return () => bound.abort();
}

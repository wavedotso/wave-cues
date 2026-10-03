/**
 * Soft: quiet, rounded sounds for an interface you live in all day. Sines
 * and triangles, pink noise for every click, gentle attacks, and one key
 * (C major pentatonic: C, D, E, G, A) so any two of them sound right
 * together. The tick and the knock are the exception: they are as sharp and
 * as bright as the recording they were measured from. Its names are the
 * vocabulary's (vocabulary.ts).
 *
 * Each recipe says where it came from. "Measured" was modelled on a
 * recording, and says what was measured. "Designed" was written from the
 * idea of the sound, to be tuned by ear in the studio.
 */
import { defineSounds } from "../recipe";

export const soft = defineSounds({
  /* OBJECT */

  /*
   * TICK: something dragged passes a dot of the grid. Measured from a
   * recorded click, band by band over time, with no window laid over it:
   * a click is over in its first two milliseconds, where a window is nearly
   * shut.
   *
   *   spectrum   93% of its energy above 6.5 kHz, 3% under 1 kHz
   *   the spark  a ring at 14.2 kHz: full for half a millisecond, 20 dB
   *              down two milliseconds later
   *   the ring   another at 9.3 kHz, half as loud, lasting about 5 ms
   *   the rest   a breath of noise around them, and a faint tail to 30 ms
   *   played     ±15% pitch each time, never twice within 25 ms
   *
   * So: two short sines where the recording rings, white noise around them,
   * and a little pink noise for the tail. Rendered and measured the same
   * way, this recipe has 94% of its energy above 6.5 kHz and 2% under 1 kHz,
   * and is 5 dB from the recording on average, band by band and millisecond
   * by millisecond: close, not a copy. It is the quietest sound in the set:
   * it plays many times a second.
   */
  tick: {
    gain: 0.063,
    vary: 0.15,
    every: 25,
    voices: 4,
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 14200,
        gain: 1,
        attack: 0.0005,
        hold: 0.00015,
        decay: 0.0048,
      },
      {
        type: "tone",
        wave: "sine",
        from: 9300,
        gain: 0.45,
        attack: 0.0005,
        decay: 0.0125,
      },
      {
        type: "noise",
        color: "white",
        gain: 0.7,
        attack: 0.0005,
        decay: 0.03,
        filter: {
          type: "bandpass",
          from: 8500,
          q: 1,
        },
      },
      {
        type: "noise",
        color: "pink",
        gain: 0.6,
        attack: 0.001,
        decay: 0.08,
        filter: {
          type: "bandpass",
          from: 1100,
          q: 0.7,
        },
      },
    ],
  },
  /* LIFT: picked up. Designed: a short rise. */
  lift: {
    gain: 0.1,
    vary: 0.06,
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 520,
        to: 700,
        gain: 1,
        attack: 0.008,
        decay: 0.062,
      },
    ],
  },
  /* DROP: put down. Designed: a low fall, as heavy as the throw. */
  drop: {
    gain: 0.225,
    vary: 0.06,
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 190,
        to: 84,
        gain: 1,
        attack: 0.008,
        decay: 0.132,
      },
    ],
  },
  /*
   * KNOCK: a thrown thing hits an edge. Measured: the tick's recording,
   * played at 0.8 times the speed. So the tick's recipe at 0.8 times the
   * pitch and 1.25 times the length. Against the recording slowed the same
   * way: 94% of its energy above 5.2 kHz against 90%, a tenth as loud 10 ms
   * after its peak against 12, and 5 dB from it on average, band by band and
   * millisecond by millisecond. Its gain is as high as a set allows (a peak
   * under -12 dB).
   */
  knock: {
    gain: 0.13,
    vary: 0.05,
    every: 30,
    voices: 4,
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 11360,
        gain: 1,
        attack: 0.000625,
        hold: 0.0001875,
        decay: 0.006,
      },
      {
        type: "tone",
        wave: "sine",
        from: 7440,
        gain: 0.45,
        attack: 0.000625,
        decay: 0.015625,
      },
      {
        type: "noise",
        color: "white",
        gain: 0.7,
        attack: 0.000625,
        decay: 0.0375,
        filter: {
          type: "bandpass",
          from: 6800,
          q: 1,
        },
      },
      {
        type: "noise",
        color: "pink",
        gain: 0.6,
        attack: 0.00125,
        decay: 0.1,
        filter: {
          type: "bandpass",
          from: 880,
          q: 0.7,
        },
      },
    ],
  },
  /* SNAP: it locks onto the grid. Designed: a bright click with a small, high note in it. */
  snap: {
    gain: 0.16,
    vary: 0.04,
    every: 40,
    voices: 3,
    layers: [
      {
        type: "noise",
        color: "pink",
        gain: 0.8,
        attack: 0.0006,
        decay: 0.011,
        filter: {
          type: "highpass",
          from: 2400,
        },
      },
      {
        type: "tone",
        wave: "triangle",
        from: 1318.5,
        gain: 0.45,
        attack: 0.001,
        decay: 0.028,
      },
    ],
  },
  /* POINTER */

  /* HOVER: the pointer arrives. Designed: a breath rising a minor third, A to C. */
  hover: {
    gain: 0.05,
    vary: 0.05,
    every: 40,
    voices: 3,
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 880,
        to: 1046.5,
        gain: 1,
        attack: 0.008,
        decay: 0.05,
      },
    ],
  },
  /* POP: a small thing appears. Designed: a quick fall with a puff of air on top. */
  pop: {
    gain: 0.14,
    vary: 0.06,
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 700,
        to: 180,
        gain: 1,
        attack: 0.003,
        decay: 0.05,
      },
      {
        type: "noise",
        color: "pink",
        gain: 0.25,
        attack: 0.001,
        decay: 0.01,
        filter: {
          type: "highpass",
          from: 1800,
        },
      },
    ],
  },
  /* PRESS */

  /* PRESS: the down-stroke. Designed: a low triangle settling from G, under a dull click. */
  press: {
    gain: 0.18,
    vary: 0.04,
    layers: [
      {
        type: "tone",
        wave: "triangle",
        from: 196,
        to: 165,
        gain: 1,
        attack: 0.003,
        decay: 0.05,
      },
      {
        type: "noise",
        color: "pink",
        gain: 0.35,
        attack: 0.001,
        decay: 0.014,
        filter: {
          type: "bandpass",
          from: 1500,
          q: 0.7,
        },
      },
    ],
  },
  /* RELEASE: the up-stroke. Designed: lighter, and it rises a step, C to D. */
  release: {
    gain: 0.12,
    vary: 0.04,
    layers: [
      {
        type: "tone",
        wave: "triangle",
        from: 262,
        to: 294,
        gain: 1,
        attack: 0.003,
        decay: 0.04,
      },
      {
        type: "noise",
        color: "pink",
        gain: 0.3,
        attack: 0.001,
        decay: 0.01,
        filter: {
          type: "bandpass",
          from: 2600,
          q: 0.7,
        },
      },
    ],
  },
  /* TAP: a plain click. Designed: a click with a high C just audible in it. */
  tap: {
    gain: 0.16,
    vary: 0.05,
    layers: [
      {
        type: "noise",
        color: "pink",
        gain: 1,
        attack: 0.0008,
        decay: 0.018,
        filter: {
          type: "bandpass",
          from: 2000,
          q: 1,
        },
      },
      {
        type: "tone",
        wave: "sine",
        from: 1046.5,
        gain: 0.4,
        attack: 0.002,
        decay: 0.022,
      },
    ],
  },
  /* TYPE: a key, while writing. Designed: a low, muffled thock, a little different each time. */
  type: {
    gain: 0.18,
    vary: 0.1,
    every: 18,
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 131,
        to: 104,
        gain: 1,
        attack: 0.002,
        decay: 0.05,
      },
      {
        type: "noise",
        color: "pink",
        gain: 0.5,
        attack: 0.001,
        decay: 0.018,
        filter: {
          type: "lowpass",
          from: 800,
        },
      },
    ],
  },
  /* TOGGLE */

  /* ON: switched on. Designed: E then A, a fourth up. */
  on: {
    gain: 0.11,
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 659.25,
        gain: 1,
        attack: 0.005,
        decay: 0.05,
      },
      {
        type: "tone",
        wave: "sine",
        from: 880,
        gain: 1,
        at: 0.06,
        attack: 0.005,
        decay: 0.09,
        send: 0.12,
      },
    ],
  },
  /* OFF: switched off. Designed: the same two notes, A then E, a fourth down. */
  off: {
    gain: 0.1,
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 880,
        gain: 1,
        attack: 0.005,
        decay: 0.05,
      },
      {
        type: "tone",
        wave: "sine",
        from: 659.25,
        gain: 1,
        at: 0.06,
        attack: 0.005,
        decay: 0.09,
      },
    ],
  },
  /* SWITCH: one of several chosen. Designed: a narrow click, then a short G. */
  switch: {
    gain: 0.13,
    vary: 0.04,
    layers: [
      {
        type: "noise",
        color: "pink",
        gain: 1,
        attack: 0.0008,
        decay: 0.014,
        filter: {
          type: "bandpass",
          from: 2400,
          q: 2.5,
        },
      },
      {
        type: "tone",
        wave: "sine",
        from: 783.99,
        gain: 0.6,
        at: 0.008,
        attack: 0.004,
        decay: 0.045,
      },
    ],
  },
  /* FEEDBACK */

  /* SUCCESS: it worked. Designed: G, C, E rising, the last one left in the room. */
  success: {
    gain: 0.1,
    group: "feedback",
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 783.99,
        gain: 1,
        attack: 0.006,
        decay: 0.1,
      },
      {
        type: "tone",
        wave: "sine",
        from: 1046.5,
        gain: 1,
        at: 0.08,
        attack: 0.006,
        decay: 0.12,
      },
      {
        type: "tone",
        wave: "sine",
        from: 1318.5,
        gain: 1,
        at: 0.16,
        attack: 0.006,
        decay: 0.24,
        send: 0.3,
      },
    ],
  },
  /* ERROR: it did not. Designed: A, then the note just under it: uneasy, not alarming. */
  error: {
    gain: 0.1,
    group: "feedback",
    layers: [
      {
        type: "tone",
        wave: "triangle",
        from: 220,
        gain: 1,
        attack: 0.006,
        decay: 0.1,
      },
      {
        type: "tone",
        wave: "triangle",
        from: 207.65,
        gain: 1,
        at: 0.12,
        attack: 0.006,
        decay: 0.15,
      },
    ],
  },
  /* WARNING: careful. Designed: one note, D, twice. */
  warning: {
    gain: 0.1,
    group: "feedback",
    layers: [
      {
        type: "tone",
        wave: "triangle",
        from: 587.33,
        gain: 1,
        attack: 0.005,
        decay: 0.07,
      },
      {
        type: "tone",
        wave: "triangle",
        from: 587.33,
        gain: 1,
        at: 0.14,
        attack: 0.005,
        decay: 0.11,
      },
    ],
  },
  /* DENIED: against the limit. Designed: a low thud that falls, with a dull knock in it. */
  denied: {
    gain: 0.18,
    group: "feedback",
    vary: 0.04,
    layers: [
      {
        type: "tone",
        wave: "triangle",
        from: 147,
        to: 110,
        gain: 1,
        attack: 0.004,
        decay: 0.09,
      },
      {
        type: "noise",
        color: "pink",
        gain: 0.45,
        attack: 0.001,
        decay: 0.04,
        filter: {
          type: "lowpass",
          from: 380,
        },
      },
    ],
  },
  /* NOTIFY */

  /* NOTIFY: something arrived. Designed: a struck bell on C, with a fifth ringing above it. */
  notify: {
    gain: 0.1,
    group: "feedback",
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 1046.5,
        gain: 1,
        attack: 0.003,
        decay: 0.6,
        fm: {
          ratio: 3.5,
          depth: 0.5,
        },
        send: 0.4,
      },
      {
        type: "tone",
        wave: "sine",
        from: 1568,
        gain: 0.3,
        attack: 0.003,
        decay: 0.35,
        send: 0.4,
      },
    ],
  },
  /* PING: a small, bright point. Designed: a high E, and one a hair above it, so it shimmers. */
  ping: {
    gain: 0.09,
    group: "feedback",
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 1318.5,
        gain: 1,
        attack: 0.004,
        decay: 0.26,
        send: 0.3,
      },
      {
        type: "tone",
        wave: "sine",
        from: 1323,
        gain: 0.35,
        attack: 0.004,
        decay: 0.22,
        send: 0.3,
      },
    ],
  },
  /* MESSAGE: a message surfaces. Designed: a bubble rising from E to the A above the next. */
  message: {
    gain: 0.11,
    group: "feedback",
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 330,
        to: 880,
        gain: 1,
        attack: 0.005,
        decay: 0.11,
        send: 0.2,
      },
    ],
  },
  /* LAND: something of yours arrived from elsewhere. Designed: C, E and G, one after the other. */
  land: {
    gain: 0.0875,
    group: "feedback",
    vary: 0.06,
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 523.25,
        gain: 1,
        attack: 0.008,
        decay: 0.112,
      },
      {
        type: "tone",
        wave: "sine",
        from: 659.25,
        gain: 1,
        at: 0.08,
        attack: 0.008,
        decay: 0.112,
      },
      {
        type: "tone",
        wave: "sine",
        from: 783.99,
        gain: 1,
        at: 0.16,
        attack: 0.008,
        decay: 0.192,
      },
    ],
  },
  /* MOTION */

  /* OPEN: a surface opens. Designed: two steps up. */
  open: {
    gain: 0.0875,
    vary: 0.06,
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 620,
        to: 660,
        gain: 1,
        attack: 0.008,
        decay: 0.042,
      },
      {
        type: "tone",
        wave: "sine",
        from: 880,
        to: 930,
        gain: 0.86,
        at: 0.045,
        attack: 0.008,
        decay: 0.062,
      },
    ],
  },
  /* CLOSE: it closes. Designed: one step down. */
  close: {
    gain: 0.075,
    vary: 0.06,
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 760,
        to: 480,
        gain: 1,
        attack: 0.008,
        decay: 0.072,
      },
    ],
  },
  /* SLIDE: a panel slides into place. Designed: a short breath of air, opening as it moves. */
  slide: {
    gain: 0.45,
    vary: 0.05,
    layers: [
      {
        type: "noise",
        color: "pink",
        gain: 1,
        attack: 0.02,
        decay: 0.13,
        filter: {
          type: "bandpass",
          from: 500,
          to: 1600,
          q: 1,
        },
      },
    ],
  },
  /* SWOOSH: something passes. Designed: a longer breath, low to high, with a little room. */
  swoosh: {
    gain: 0.5,
    vary: 0.05,
    layers: [
      {
        type: "noise",
        color: "pink",
        gain: 1,
        attack: 0.03,
        decay: 0.2,
        filter: {
          type: "bandpass",
          from: 400,
          to: 3000,
          q: 1.4,
        },
        send: 0.2,
      },
    ],
  },
  /* STATE */

  /* LOADING: waiting. Designed: G, A, C, patient and even. Made to loop. */
  loading: {
    gain: 0.07,
    vary: 0,
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 783.99,
        gain: 1,
        attack: 0.005,
        decay: 0.04,
      },
      {
        type: "tone",
        wave: "sine",
        from: 880,
        gain: 1,
        at: 0.12,
        attack: 0.005,
        decay: 0.04,
      },
      {
        type: "tone",
        wave: "sine",
        from: 1046.5,
        gain: 1,
        at: 0.24,
        attack: 0.005,
        decay: 0.04,
      },
    ],
  },
  /* READY: ready for you. Designed: C and the G above it, an open fifth, held in the room. */
  ready: {
    gain: 0.08,
    group: "feedback",
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 523.25,
        gain: 1,
        attack: 0.008,
        decay: 0.3,
        send: 0.25,
      },
      {
        type: "tone",
        wave: "sine",
        from: 783.99,
        gain: 0.9,
        attack: 0.008,
        decay: 0.3,
        send: 0.25,
      },
    ],
  },
  /* COMPLETE: done. Designed: C, E, G, C climbing, then a shimmer two octaves up. */
  complete: {
    gain: 0.1,
    group: "feedback",
    layers: [
      {
        type: "tone",
        wave: "sine",
        from: 523.25,
        gain: 1,
        attack: 0.006,
        decay: 0.15,
        send: 0.3,
      },
      {
        type: "tone",
        wave: "sine",
        from: 659.25,
        gain: 1,
        at: 0.07,
        attack: 0.006,
        decay: 0.19,
        send: 0.3,
      },
      {
        type: "tone",
        wave: "sine",
        from: 783.99,
        gain: 1,
        at: 0.14,
        attack: 0.006,
        decay: 0.23,
        send: 0.3,
      },
      {
        type: "tone",
        wave: "sine",
        from: 1046.5,
        gain: 1,
        at: 0.21,
        attack: 0.006,
        decay: 0.3,
        send: 0.3,
      },
      {
        type: "grains",
        count: 5,
        step: 0.028,
        from: 2093,
        to: 4186,
        gain: 0.2,
        decay: 0.08,
        at: 0.3,
        seed: 5,
        send: 0.5,
      },
    ],
  },
  /* SPARKLE: a small celebration. Designed: seven grains scattered between a high G and a higher D. */
  sparkle: {
    gain: 0.09,
    group: "feedback",
    layers: [
      {
        type: "grains",
        count: 7,
        step: 0.03,
        from: 1568,
        to: 4699,
        gain: 1,
        decay: 0.1,
        seed: 7,
        send: 0.5,
      },
    ],
  },
});

/**
 * How a play's strength and place become a level and a pan. Pure, so the
 * curves can be tested and drawn.
 */

/** The quietest a play gets, as a share of full: soft, never silent. */
export const QUIETEST = 0.1;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * The level for a strength from 0 to 1, on a square curve: a soft tap is
 * near silent, a hard hit rings, and the steps between sound even.
 */
export function levelFor(strength: number): number {
  const share = clamp(Number.isFinite(strength) ? strength : 1, 0, 1);
  return QUIETEST + (1 - QUIETEST) * share * share;
}

/** Below this share of full scale, the limiter changes nothing. */
export const LIMIT_FROM = 0.8;
/** How far past full scale the limiter's curve reaches, before it holds. */
export const LIMIT_HEADROOM = 4;
/** Where the limiter bends towards and never gets past: just under full scale. */
export const LIMIT_CEILING = 0.98;

/**
 * The limiter's curve, for a WaveShaperNode fed `1 / LIMIT_HEADROOM` of the
 * mix: the same as its input up to `LIMIT_FROM`, then bending smoothly
 * towards `LIMIT_CEILING`, which it never passes. Unlike Web Audio's
 * compressor, it adds no gain of its own, so a quiet sound plays at exactly
 * its level, and it behaves the same in every browser.
 */
export function limiterCurve(points = 8193): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  const room = LIMIT_CEILING - LIMIT_FROM;
  for (let index = 0; index < points; index += 1) {
    const input = ((index / (points - 1)) * 2 - 1) * LIMIT_HEADROOM;
    const size = Math.abs(input);
    const output =
      size <= LIMIT_FROM
        ? size
        : LIMIT_FROM + room * Math.tanh((size - LIMIT_FROM) / room);
    curve[index] = Math.sign(input) * output;
  }
  return curve;
}

/**
 * The pan, -1 (left) to 1 (right), for something at `x` CSS pixels across a
 * window `width` wide. `stereo` is how far it reaches: 0 keeps every sound in
 * the middle, 1 sends the edges to the speakers' edges.
 */
export function panFor(x: number, width: number, stereo: number): number {
  if (!(width > 0) || !Number.isFinite(x)) return 0;
  return clamp((x / width) * 2 - 1, -1, 1) * clamp(stereo, 0, 1);
}

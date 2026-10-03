/**
 * Glass: bright, crystalline, a little precious. The soft set, reshaped:
 * higher, quicker to speak and slower to fade, with less click, more room,
 * and above every note a quiet partial at a ratio that is not a whole
 * number, which is what makes glass ring like glass.
 */
import { type Transform, transformRecipe, transformSounds } from "../transform";
import { soft } from "./soft";

const GLASS: Transform = {
  pitch: 1.4,
  attack: 0.7,
  decay: 1.5,
  gain: 0.85,
  noise: 0.5,
  noisePitch: 1.5,
  resonance: 2,
  room: 0.2,
  partial: { ratio: 2.99, gain: 0.16 },
};

// The soft tick and knock already ring near the top of hearing: raised like
// the rest, they would ring above it. They keep their pitch and take the rest.
const AT_PITCH: Transform = { ...GLASS, pitch: 1, noisePitch: 1 };

export const glass = transformSounds(soft, GLASS, {
  tick: transformRecipe(soft.tick, AT_PITCH),
  knock: transformRecipe(soft.knock, AT_PITCH),
});

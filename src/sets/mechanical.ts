/**
 * Mechanical: switches, relays, firm detents. The soft set, reshaped:
 * faster to speak and to stop, drier, with more click in everything, and
 * its sines played as triangles so each note has an edge.
 */
import { transformSounds } from "../transform";
import { soft } from "./soft";

export const mechanical = transformSounds(soft, {
  pitch: 0.9,
  attack: 0.5,
  decay: 0.55,
  noise: 1.5,
  noisePitch: 1.25,
  resonance: 1.6,
  send: 0.25,
  wave: { sine: "triangle" },
});

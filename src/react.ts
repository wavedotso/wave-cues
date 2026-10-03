/**
 * React's side of the engine: whether sound is muted, kept in step with
 * every other place that mutes it. Play sounds by importing your engine
 * from the module that made it; a provider would only hide its types.
 */
import { useSyncExternalStore } from "react";

import type { Cues } from "./engine";

type Muting = Pick<Cues<string>, "subscribe" | "isMuted" | "setMuted">;

/** Whether sound is muted, and how to change it. */
export function useMuted(
  cues: Muting,
): readonly [boolean, (muted: boolean) => void] {
  const muted = useSyncExternalStore(
    cues.subscribe,
    cues.isMuted,
    cues.isMuted,
  );
  return [muted, cues.setMuted] as const;
}

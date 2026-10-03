import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { createCues } from "./engine";
import { useMuted } from "./react";
import { soft } from "./sets/soft";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function SoundSwitch({ cues }: { cues: Parameters<typeof useMuted>[0] }) {
  const [muted, setMuted] = useMuted(cues);
  return (
    <button type="button" onClick={() => setMuted(!muted)}>
      {muted ? "Sound off" : "Sound on"}
    </button>
  );
}

describe("useMuted", () => {
  it("follows muting, wherever it changes, and changes it", async () => {
    const cues = createCues({ sounds: soft, storageKey: false });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    cleanups.push(() => {
      act(() => root.unmount());
      host.remove();
      cues.destroy();
    });

    await act(async () => root.render(<SoundSwitch cues={cues} />));
    const button = host.querySelector("button");
    expect(button?.textContent).toBe("Sound on");

    await act(async () => cues.setMuted(true));
    expect(button?.textContent).toBe("Sound off");

    await act(async () => button?.click());
    expect(button?.textContent).toBe("Sound on");
    expect(cues.isMuted()).toBe(false);
  });
});

import { defineConfig } from "tsdown";

/**
 * Per-file ESM, as Wave UI builds: every module in `src/` is transpiled to
 * `dist/` with its imports intact, so the app's bundler tree-shakes it, and
 * a set of sounds you do not import is never shipped. Only the files named
 * in package.json's `exports` are public; the rest are internal.
 */
export default defineConfig({
  entry: ["src/**/*.ts", "!src/**/*.test.ts"],
  format: "esm",
  platform: "neutral",
  unbundle: true,
  dts: true,
  // `src` is not published, so source maps would point at nothing.
  sourcemap: false,
  clean: true,
  // A library bundles none of its dependencies (React, for `react`).
  deps: { neverBundle: true },
});

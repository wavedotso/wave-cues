import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The studio: hear, tune and record every sound. Only while developing;
 * never published. `pnpm dev` starts it and prints its address; if 5300 is
 * taken, Vite takes the next free port and prints that one.
 */
export default defineConfig({
  // Run from the package's root (`pnpm studio`).
  root: "studio",
  plugins: [react(), tailwindcss()],
  server: { port: 5300 },
});

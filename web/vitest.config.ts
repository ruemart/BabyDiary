import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Kept apart from vite.config.ts: the `test` key does not belong in Vite's own config
// types, and the PWA plugin has no business in a test run anyway.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "happy-dom",
      include: ["src/**/*.{test,spec}.ts"],
    },
  }),
);

import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Getrennt von vite.config.ts: der `test`-Schlüssel gehört nicht in Vites eigene
// Konfigurationstypen, und das PWA-Plugin hat im Testlauf ohnehin nichts zu suchen.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "happy-dom",
      include: ["src/**/*.{test,spec}.ts"],
    },
  }),
);

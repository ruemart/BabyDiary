import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      /**
       * Eigener Service Worker statt des erzeugten — ein erzeugter kann keinen
       * `push` listener, and that is exactly what the bottle reminder needs.
       * Precaching and the image cache now live in web/src/sw.ts.
       */
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
      },
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      /**
       * No manifest is built into the image — the API serves it, because it carries the
       * child's name and that is not known here. `index.html` links it directly, so this
       * plugin must not inject a second link pointing at a file that is not there.
       *
       * Only the WEB APP manifest is meant; the precache manifest above is a different
       * thing with an unfortunately similar name and is unaffected.
       */
      manifest: false,
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:3010", changeOrigin: true },
    },
  },
});

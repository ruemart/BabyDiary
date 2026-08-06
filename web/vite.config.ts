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
      manifest: {
        name: "BabyMonitor",
        short_name: "Baby",
        description: "Track feeds, nappies, sleep and development",
        lang: "de",
        start_url: "/",
        display: "standalone",
        background_color: "#f7f4ee",
        theme_color: "#e8a33d",
        orientation: "portrait",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
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

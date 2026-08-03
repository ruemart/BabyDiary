import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "BabyMonitor",
        short_name: "Baby",
        description: "Trinken, Windeln, Schlaf und Entwicklung festhalten",
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
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg}"],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Bilder sind unveränderlich (die Id steckt im Dateinamen), also dauerhaft
            // cachen — dann ist die Galerie auch offline vollständig.
            urlPattern: /^.*\/api\/media\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "bm-media",
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Der Sync bekommt BEWUSST kein Workbox-Background-Sync: die Warteschlange
            // liegt in Dexie. Zwei Queues übereinander würden Einträge doppelt senden.
            urlPattern: /^.*\/api\/.*/,
            handler: "NetworkOnly",
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

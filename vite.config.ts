// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        strategies: "generateSW",
        registerType: "autoUpdate",
        // The guarded wrapper in src/lib/pwa-register.ts is the only registrar.
        injectRegister: null,
        devOptions: { enabled: false },
        filename: "sw.js",
        // Manifest already lives in public/manifest.webmanifest.
        manifest: false,
        workbox: {
          // The app is server-rendered, so there is no static /index.html to fall back to and nothing to
          // precache. Offline support is limited to the app shell of pages already visited; owner data
          // (health information) is deliberately never stored on the device.
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // HTML navigations: network first (fall back to the cached shell after 4 s without answer).
              urlPattern: ({ request }: { request: Request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: { cacheName: "html-navigations", networkTimeoutSeconds: 4 },
            },
            {
              // Self-hosted fonts never change under the same URL.
              urlPattern: ({ url }: { url: URL }) =>
                url.origin === self.location.origin && url.pathname.startsWith("/fonts/"),
              handler: "CacheFirst",
              options: { cacheName: "fonts", expiration: { maxEntries: 12 } },
            },
            {
              // Same-origin hashed build assets only.
              urlPattern: ({ url, request }: { url: URL; request: Request }) =>
                url.origin === self.location.origin &&
                (request.destination === "script" || request.destination === "style"),
              handler: "CacheFirst",
              options: { cacheName: "static-assets" },
            },
          ],
        },
      }),
    ],
  },
});

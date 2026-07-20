import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      devOptions: {
        enabled: false,
      },
      manifest: false,
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,ico,svg,webp,woff,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html",
              networkTimeoutSeconds: 3,
            },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    rollupOptions: {
      output: {
        // Vendor chunks estáveis: melhoram cache entre releases quando só o
        // código da aplicação muda. Rotas continuam divididas pelo React.lazy.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/pdfjs-dist/")) return "pdf";
          if (id.includes("/@radix-ui/")) return "radix";
          if (id.includes("/recharts/") || id.match(/\/d3-[^/]+\//)) return "charts";
          if (id.includes("/@supabase/")) return "supabase";
          if (
            id.includes("/react-hook-form/") ||
            id.includes("/@hookform/") ||
            id.match(/\/zod\//)
          ) return "forms";
          if (
            id.match(/\/react(-dom|-router-dom)?\//) ||
            id.includes("/scheduler/")
          ) return "react-vendor";
        },
      },
    },
  },
}));

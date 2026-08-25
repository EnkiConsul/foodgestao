import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

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
    mcpPlugin(),
    mode === "development" && componentTagger(),
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
          // recharts + d3 são deixados sob decisão automática do Rollup:
          // agrupá-los manualmente cria dependência circular entre chunks e
          // dispara "Cannot access '_' before initialization" em produção.
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

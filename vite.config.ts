import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

const REF_HOM_BUILD = "utjhzpdbqzajrhnzcher";

/**
 * Marcador do build + trava do modo de homologação.
 *
 * - Grava `build-env.json` na saída com o ambiente declarado e o projeto de
 *   backend embutido: é a prova usada pela trava dos E2E (endereço local não
 *   prova nada sobre o banco em uso).
 * - Se o modo for `homologacao` e as variáveis não forem exatamente as de
 *   homologação (arquivo ausente, herdando o `.env` de produção), o build falha
 *   em vez de gerar silenciosamente um pacote apontando para produção.
 */
function marcadorDeAmbiente(mode: string, env: Record<string, string | undefined>): Plugin {
  const url = (env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const ref = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/.exec(url)?.[1] ?? null;
  const appEnv = (env.VITE_APP_ENV ?? "producao").toLowerCase();

  if (mode === "homologacao" && (appEnv !== "homologacao" || ref !== REF_HOM_BUILD)) {
    throw new Error(
      'Modo "homologacao" sem as variáveis de homologação (VITE_APP_ENV/VITE_SUPABASE_URL). ' +
        "Crie o arquivo .env.homologacao — o build NÃO cai para produção.",
    );
  }

  return {
    name: "marcador-de-ambiente",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build-env.json",
        source: JSON.stringify(
          { app_env: appEnv, supabase_ref: ref, built_at: new Date().toISOString() },
          null,
          2,
        ),
      });
    },
  };
}


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
    marcadorDeAmbiente(mode, loadEnv(mode, process.cwd(), "VITE_")),
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

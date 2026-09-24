// supabase/functions/admin-storage-migrar-legado/index.ts
// Rotina administrativa de uso único: higieniza caminhos legados no Storage.
//
// Motivo: as políticas de acesso derivam a empresa do primeiro segmento do
// caminho do arquivo. Caminhos legados começam com texto (`documentos/`,
// `negociacoes/`) em vez do identificador da empresa. Este utilitário move o
// arquivo físico para `<company_id>/<caminho legado>` via API de Storage
// (move mantém o objeto e sua versão) e atualiza a referência na tabela de
// origem, em uma operação idempotente e reversível.
//
// verify_jwt = false — protegido por segredo interno em cabeçalho.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { secretMatches } from "../_shared/secret.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MIGRATE_SECRET = Deno.env.get("STORAGE_MIGRATE_SECRET");

const BUCKET = "dp-documentos";
const LEGACY_PREFIXES = ["documentos/", "negociacoes/"];

type Origem = {
  table: "dp_documentos" | "dp_solicitacoes" | "dp_sindicato_negociacoes";
  col: string;
};

const ORIGENS: Origem[] = [
  { table: "dp_documentos", col: "file_path" },
  { table: "dp_documentos", col: "comprovante_file_path" },
  { table: "dp_solicitacoes", col: "arquivo_path" },
  { table: "dp_sindicato_negociacoes", col: "pdf_path" },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!secretMatches(req.headers.get("x-admin-secret"), MIGRATE_SECRET)) {
    return json({ error: "FORBIDDEN" }, 403);
  }

  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // 1) Descobre os caminhos legados e a empresa dona de cada um.
  const legados = new Map<string, { destino: string; origens: Origem[] }>();

  for (const origem of ORIGENS) {
    for (const prefixo of LEGACY_PREFIXES) {
      const { data, error } = await admin
        .from(origem.table)
        .select(`company_id, ${origem.col}`)
        .like(origem.col, `${prefixo}%`);
      if (error) return json({ error: error.message, origem }, 500);

      for (const row of (data ?? []) as Record<string, string>[]) {
        const caminho = row[origem.col];
        const companyId = row.company_id;
        if (!caminho || !companyId) continue;
        const atual = legados.get(caminho);
        if (atual) {
          atual.origens.push(origem);
        } else {
          legados.set(caminho, {
            destino: `${companyId}/${caminho}`,
            origens: [origem],
          });
        }
      }
    }
  }

  const resultado = {
    dry_run: dryRun,
    total: legados.size,
    movidos: [] as string[],
    ja_no_destino: [] as string[],
    sem_arquivo: [] as string[],
    falhas: [] as { caminho: string; erro: string }[],
  };

  if (dryRun) {
    return json({
      ...resultado,
      previa: [...legados].map(([de, v]) => ({ de, para: v.destino })),
    });
  }

  // 2) Move o arquivo físico e atualiza as referências, um por um.
  for (const [caminho, { destino, origens }] of legados) {
    const { error: moveErr } = await admin.storage.from(BUCKET).move(caminho, destino);

    if (moveErr) {
      const msg = moveErr.message ?? String(moveErr);
      // Idempotência: destino já existe (execução anterior) ou origem ausente.
      const jaMovido = /exists|duplicate/i.test(msg);
      const semOrigem = /not found|does not exist/i.test(msg);
      if (!jaMovido && !semOrigem) {
        resultado.falhas.push({ caminho, erro: msg });
        continue;
      }
      const { data: destinoOk } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(destino, 60);
      if (!destinoOk?.signedUrl) {
        resultado.sem_arquivo.push(caminho);
        continue;
      }
      resultado.ja_no_destino.push(caminho);
    } else {
      resultado.movidos.push(caminho);
    }

    for (const origem of origens) {
      const { error: upErr } = await admin
        .from(origem.table)
        .update({ [origem.col]: destino })
        .eq(origem.col, caminho);
      if (upErr) resultado.falhas.push({ caminho, erro: upErr.message });
    }
  }

  return json(resultado);
});

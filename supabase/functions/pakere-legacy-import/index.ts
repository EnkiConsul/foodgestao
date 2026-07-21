// Edge Function TEMPORÁRIA — migração one-shot Pakere → 360°FOOD DP.
// Será removida após a validação da importação. Sem UI, sem rota, sem menu.
// Modos suportados: diagnose | dry-run | execute | rollback
//
// Invocação (super admin only):
//   supabase functions invoke pakere-legacy-import --body '{"mode":"diagnose"}'
//   supabase functions invoke pakere-legacy-import --body '{"mode":"dry-run"}'
//   supabase functions invoke pakere-legacy-import --body '{"mode":"execute","copyStorage":true}'
//   supabase functions invoke pakere-legacy-import --body '{"mode":"rollback","runId":"<uuid>"}'

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PAKERE_COMPANY_ID = "b0d450a7-0a70-4322-bcdb-c3abfea196ba";

// Tabelas da origem a serem inspecionadas na Etapa 1.
const SOURCE_TABLES = [
  "profiles",
  "unidades",
  "cargos",
  "unidade_cargos",
  "sindicatos",
  "sindicato_unidades",
  "sindicato_cargos",
  "folgas",
  "folgas_canceladas",
  "trocas_folga",
  "solicitacoes_especiais",
  "atestados",
  "registros_disciplinares",
  "documentos",
  "contracheques",
  "documentos_sindicato",
  "negociacoes",
  "avisos",
  "mensagens",
  "mensagens_enviadas",
  "modelos_mensagem",
  "notificacoes",
  "bloqueio_regras",
  "bloqueio_regra_unidades",
  "datas_bloqueadas",
  "dia_config",
  "prioridade_aniversario",
];

// Tabelas de destino usadas para inventário de dados já existentes por Pakere.
const DEST_TABLES = [
  "dp_unidades",
  "dp_cargos",
  "dp_unidade_cargos",
  "dp_sindicatos",
  "dp_sindicato_unidades",
  "dp_sindicato_cargos",
  "dp_colaboradores",
  "dp_folgas",
  "dp_folgas_canceladas",
  "dp_trocas",
  "dp_solicitacoes",
  "dp_documentos",
  "dp_avisos",
  "dp_mensagens",
  "dp_modelos_mensagem",
  "dp_modelos_mensagem",
  "dp_notificacoes",
  "dp_bloqueio_regras",
  "dp_bloqueio_regra_unidades",
  "dp_datas_bloqueadas",
  "dp_dia_config",
  "dp_prioridade_aniversario",
  "dp_sindicato_negociacoes",
  "dp_registros_disciplinares",
];

interface DiagnoseTableResult {
  table: string;
  accessible: boolean;
  count: number | null;
  error?: string;
}

async function inspectSourceTable(
  source: SupabaseClient,
  table: string,
): Promise<DiagnoseTableResult> {
  const { count, error } = await source
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) {
    return {
      table,
      accessible: false,
      count: null,
      error: `${error.code ?? ""} ${error.message}`.trim(),
    };
  }
  return { table, accessible: true, count: count ?? 0 };
}

async function inspectDestTable(
  dest: SupabaseClient,
  table: string,
): Promise<DiagnoseTableResult> {
  const { count, error } = await dest
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("company_id", PAKERE_COMPANY_ID);
  if (error) {
    // Algumas tabelas associativas não têm company_id. Cai para count total.
    const fallback = await dest
      .from(table)
      .select("*", { count: "exact", head: true });
    if (fallback.error) {
      return {
        table,
        accessible: false,
        count: null,
        error: fallback.error.message,
      };
    }
    return { table, accessible: true, count: fallback.count ?? 0 };
  }
  return { table, accessible: true, count: count ?? 0 };
}

async function listSourceBuckets(
  source: SupabaseClient,
): Promise<{ name: string; public: boolean }[] | { error: string }> {
  const { data, error } = await source.storage.listBuckets();
  if (error) return { error: error.message };
  return (data ?? []).map((b) => ({ name: b.name, public: !!b.public }));
}

async function isSuperAdmin(
  dest: SupabaseClient,
  authHeader: string | null,
): Promise<boolean> {
  if (!authHeader) return false;
  const jwt = authHeader.replace("Bearer ", "");
  const { data: userRes, error } = await dest.auth.getUser(jwt);
  if (error || !userRes?.user) return false;
  const { data: role } = await dest
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  return !!role;
}

async function verifyPakereCompany(dest: SupabaseClient) {
  const { data, error } = await dest
    .from("companies")
    .select("id, name, cnpj")
    .eq("id", PAKERE_COMPANY_ID)
    .maybeSingle();
  if (error) throw new Error(`Falha ao localizar empresa: ${error.message}`);
  if (!data) throw new Error(`Empresa Pakere não encontrada (${PAKERE_COMPANY_ID}).`);
  return data;
}

async function runDiagnose(source: SupabaseClient, dest: SupabaseClient) {
  const company = await verifyPakereCompany(dest);
  const sourceResults: DiagnoseTableResult[] = [];
  for (const t of SOURCE_TABLES) {
    sourceResults.push(await inspectSourceTable(source, t));
  }
  const destResults: DiagnoseTableResult[] = [];
  for (const t of Array.from(new Set(DEST_TABLES))) {
    destResults.push(await inspectDestTable(dest, t));
  }
  const buckets = await listSourceBuckets(source);

  const blocked = sourceResults.filter((r) => !r.accessible);
  const summary = {
    company,
    source: {
      total_tables: sourceResults.length,
      accessible: sourceResults.length - blocked.length,
      blocked: blocked.length,
      total_rows: sourceResults.reduce((s, r) => s + (r.count ?? 0), 0),
    },
    destination: {
      pakere_rows_existing: destResults.reduce(
        (s, r) => s + (r.count ?? 0),
        0,
      ),
    },
    buckets,
  };
  return {
    summary,
    source_tables: sourceResults,
    dest_tables_pakere: destResults,
    blocked_tables: blocked,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PAKERE_URL = Deno.env.get("PAKERE_SUPABASE_URL");
    const PAKERE_KEY =
      Deno.env.get("PAKERE_SUPABASE_KEY") ??
      Deno.env.get("PAKERE_SUPABASE_SECRET_KEY");

    if (!PAKERE_URL || !PAKERE_KEY) {
      return new Response(
        JSON.stringify({
          error:
            "Secrets PAKERE_SUPABASE_URL e PAKERE_SUPABASE_KEY (ou PAKERE_SUPABASE_SECRET_KEY) precisam estar configurados.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dest = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });
    const source = createClient(PAKERE_URL, PAKERE_KEY, {
      auth: { persistSession: false },
    });

    // Autorização: somente super admins.
    const authHeader = req.headers.get("Authorization");
    const authed = await isSuperAdmin(dest, authHeader);
    if (!authed) {
      return new Response(
        JSON.stringify({ error: "Somente super administradores podem executar." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const mode = String(body.mode ?? "diagnose");

    if (mode === "diagnose") {
      const result = await runDiagnose(source, dest);
      return new Response(JSON.stringify({ mode, ...result }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "dry-run" || mode === "execute" || mode === "rollback") {
      return new Response(
        JSON.stringify({
          mode,
          status: "not_implemented",
          message:
            "O modo diagnose precisa ser executado e aprovado primeiro. Depois desse retorno o pipeline completo (transformações por tabela, storage e rollback) é habilitado.",
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ error: `Modo inválido: ${mode}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Edge Function TEMPORÁRIA — migração one-shot Pakere → Aveto 360 DP.
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
// ============================================================
// IMPORT PIPELINE
// ============================================================

type IdMap = Map<string, Map<string, string>>; // source_table -> source_id -> new uuid

function newId(): string {
  return crypto.randomUUID();
}

async function loadExistingMap(
  dest: SupabaseClient,
): Promise<IdMap> {
  const map: IdMap = new Map();
  const { data, error } = await dest
    .from("dp_legacy_import_id_map")
    .select("source_table, source_id, target_id")
    .eq("company_id", PAKERE_COMPANY_ID);
  if (error) throw new Error(`Falha ao carregar id_map: ${error.message}`);
  for (const row of data ?? []) {
    if (!map.has(row.source_table)) map.set(row.source_table, new Map());
    map.get(row.source_table)!.set(row.source_id, row.target_id);
  }
  return map;
}

function idOf(map: IdMap, table: string, sourceId: string | null | undefined): string | null {
  if (!sourceId) return null;
  return map.get(table)?.get(sourceId) ?? null;
}

async function persistIdMap(
  dest: SupabaseClient,
  runId: string,
  entries: {
    source_table: string;
    source_id: string;
    target_table: string;
    target_id: string;
  }[],
) {
  if (!entries.length) return;
  const rows = entries.map((e) => ({
    import_run_id: runId,
    company_id: PAKERE_COMPANY_ID,
    ...e,
  }));
  const { error } = await dest.from("dp_legacy_import_id_map").insert(rows);
  if (error) throw new Error(`Falha ao gravar id_map: ${error.message}`);
}

async function recordError(
  dest: SupabaseClient,
  runId: string,
  source_table: string,
  source_id: string | null,
  err: unknown,
  payload: unknown,
) {
  const msg = err instanceof Error ? err.message : String(err);
  await dest.from("dp_legacy_import_errors").insert({
    import_run_id: runId,
    source_table,
    source_id,
    error_message: msg,
    source_payload: payload as any,
  });
}

// Mapping helpers -----------------------------------------------------
const FOLGA_TIPO_MAP: Record<string, string> = {
  domingo: "normal",
  normal: "normal",
  extra: "extra",
  ferias: "ferias",
  abono: "abono",
  licenca: "licenca",
};
const REGIME_MAP: Record<string, string> = {
  CLT: "clt",
  PJ: "pj",
  ESTAGIO: "estagio",
  MEI: "mei",
  TEMPORARIO: "temporario",
};
const SOL_STATUS_MAP: Record<string, string> = {
  pendente: "pendente",
  aprovado: "aprovada",
  aprovada: "aprovada",
  recusado: "recusada",
  recusada: "recusada",
  cancelada: "cancelada",
  cancelado: "cancelada",
};
const TROCA_STATUS_MAP: Record<string, string> = {
  pendente: "pendente_colega",
  pendente_colega: "pendente_colega",
  pendente_gestor: "pendente_gestor",
  aprovada: "aprovada",
  recusada: "recusada",
  cancelada: "cancelada",
};
const BLOQUEIO_TIPO_MAP: Record<string, string> = {
  fixa: "fixa_anual",
  fixa_anual: "fixa_anual",
  dinamica: "dinamica",
  pos_pagamento: "pos_pagamento",
};

// Order matters: parents first, dependents later.
const TABLE_ORDER = [
  "unidades",
  "cargos",
  "sindicatos",
  "profiles",
  "unidade_cargos",
  "sindicato_unidades",
  "sindicato_cargos",
  "folgas",
  "trocas_folga",
  "solicitacoes_especiais",
  "atestados",
  "documentos",
  "documentos_sindicato",
  "negociacoes",
  "modelos_mensagem",
  "bloqueio_regras",
  "datas_bloqueadas",
] as const;

async function fetchAll(source: SupabaseClient, table: string) {
  const { data, error } = await source.from(table).select("*");
  if (error) throw new Error(`Fetch ${table}: ${error.message}`);
  return data ?? [];
}

interface RunCounters {
  imported: Record<string, number>;
  skipped: Record<string, number>;
  errors: Record<string, number>;
}

async function importTable(
  dest: SupabaseClient,
  runId: string,
  sourceTable: string,
  targetTable: string,
  rows: any[],
  map: IdMap,
  transform: (row: any, newId: string) => any | null,
  counters: RunCounters,
  dryRun: boolean,
) {
  const bucket = map.get(sourceTable) ?? new Map<string, string>();
  map.set(sourceTable, bucket);
  const toInsert: any[] = [];
  const mapEntries: {
    source_table: string;
    source_id: string;
    target_table: string;
    target_id: string;
  }[] = [];

  for (const row of rows) {
    const sourceId = String(row.id);
    if (bucket.has(sourceId)) {
      counters.skipped[sourceTable] = (counters.skipped[sourceTable] ?? 0) + 1;
      continue;
    }
    try {
      const newIdVal = newId();
      const mapped = transform(row, newIdVal);
      if (!mapped) {
        counters.skipped[sourceTable] = (counters.skipped[sourceTable] ?? 0) + 1;
        continue;
      }
      toInsert.push(mapped);
      const hasId = "id" in mapped && mapped.id;
      mapEntries.push({
        source_table: sourceTable,
        source_id: sourceId,
        target_table: targetTable,
        target_id: hasId ? mapped.id : newIdVal,
      });
      bucket.set(sourceId, hasId ? mapped.id : newIdVal);
    } catch (err) {
      counters.errors[sourceTable] = (counters.errors[sourceTable] ?? 0) + 1;
      await recordError(dest, runId, sourceTable, sourceId, err, row);
    }
  }

  if (!dryRun && toInsert.length) {
    const { error } = await dest.from(targetTable).insert(toInsert);
    if (error) {
      // Batch failed — retry per row to isolate offenders
      const okEntries: typeof mapEntries = [];
      let imported = 0;
      for (let i = 0; i < toInsert.length; i++) {
        const r = toInsert[i];
        const { error: rowErr } = await dest.from(targetTable).insert(r);
        if (rowErr) {
          counters.errors[sourceTable] = (counters.errors[sourceTable] ?? 0) + 1;
          await recordError(dest, runId, sourceTable, mapEntries[i].source_id, rowErr.message, r);
          // remove from map bucket so future retries can try again
          bucket.delete(mapEntries[i].source_id);
        } else {
          okEntries.push(mapEntries[i]);
          imported++;
        }
      }
      if (okEntries.length) await persistIdMap(dest, runId, okEntries);
      counters.imported[sourceTable] = (counters.imported[sourceTable] ?? 0) + imported;
      return;
    }
    await persistIdMap(dest, runId, mapEntries);
  }
  counters.imported[sourceTable] =
    (counters.imported[sourceTable] ?? 0) + toInsert.length;
}


async function runImport(
  source: SupabaseClient,
  dest: SupabaseClient,
  opts: { dryRun: boolean; copyStorage: boolean },
) {
  const map = await loadExistingMap(dest);
  const counters: RunCounters = { imported: {}, skipped: {}, errors: {} };
  const sourceCounts: Record<string, number> = {};

  // Create run record
  const runId = newId();
  await dest.from("dp_legacy_import_runs").insert({
    id: runId,
    company_id: PAKERE_COMPANY_ID,
    source_project: Deno.env.get("PAKERE_SUPABASE_URL") ?? "unknown",
    status: opts.dryRun ? "dry_run_running" : "running",
    dry_run: opts.dryRun,
    copy_storage: opts.copyStorage,
    started_at: new Date().toISOString(),
    source_counts: {},
    imported_counts: {},
    skipped_counts: {},
    error_counts: {},
    report: {},
  });

  // Fetch every source table once
  const all: Record<string, any[]> = {};
  for (const t of TABLE_ORDER) {
    all[t] = await fetchAll(source, t);
    sourceCounts[t] = all[t].length;
  }

  // unidades -> dp_unidades
  await importTable(dest, runId, "unidades", "dp_unidades", all.unidades, map,
    (row, id) => ({
      id,
      company_id: PAKERE_COMPANY_ID,
      nome: row.nome,
      cnpj: row.cnpj ?? null,
      endereco: row.endereco ?? null,
      cidade: row.cidade ?? null,
      uf: null,
      ativo: row.ativo ?? true,
      possui_relogio_ponto: row.possui_relogio_ponto ?? false,
      tem_adiantamento: row.tem_adiantamento ?? false,
      dia_adiantamento: row.dia_adiantamento ?? null,
      telefone: row.telefone ?? null,
      created_at: row.created_at ?? new Date().toISOString(),
      updated_at: row.updated_at ?? new Date().toISOString(),
    }), counters, opts.dryRun);

  // cargos -> dp_cargos
  await importTable(dest, runId, "cargos", "dp_cargos", all.cargos, map,
    (row, id) => ({
      id,
      company_id: PAKERE_COMPANY_ID,
      nome: row.nome,
      descricao: row.descricao ?? null,
      ativo: row.ativo ?? true,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }), counters, opts.dryRun);

  // sindicatos -> dp_sindicatos
  await importTable(dest, runId, "sindicatos", "dp_sindicatos", all.sindicatos, map,
    (row, id) => ({
      id,
      company_id: PAKERE_COMPANY_ID,
      nome: row.nome,
      cnpj: row.cnpj ?? null,
      tipo: row.tipo === "laboral" ? "laboral" : "patronal",
      contato_telefone: row.contato_whatsapp ?? null,
      ativo: true,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }), counters, opts.dryRun);

  // profiles -> dp_colaboradores
  await importTable(dest, runId, "profiles", "dp_colaboradores", all.profiles, map,
    (row, id) => ({
      id,
      company_id: PAKERE_COMPANY_ID,
      user_id: null,
      nome: row.nome ?? "SEM NOME",
      cpf: row.cpf ?? null,
      matricula: row.matricula ?? null,
      cargo: row.cargo ?? null,
      unidade_id: idOf(map, "unidades", row.unidade_id),
      cargo_id: null,
      sindicato_id: null,
      regime: REGIME_MAP[String(row.tipo_vinculo ?? "").toUpperCase()] ?? "clt",
      data_admissao: row.data_admissao ?? null,
      data_desligamento: row.data_demissao ?? null,
      data_nascimento: row.data_nascimento ?? null,
      email_contato: row.email_contato ?? null,
      whatsapp: row.whatsapp ?? null,
      ativo: row.ativo ?? false,
      folga_fixa_semana: row.folga_fixa_semana ?? null,
      perfil_acesso: "colaborador",
      possui_folha_ponto: row.possui_folha_ponto ?? false,
      optante_adiantamento: row.optante_adiantamento ?? false,
      endereco: row.endereco ?? null,
      aprovacao_status: row.aprovacao_status === "aprovado" ? "aprovado" : "pendente",
      dp_permissions: {},
      created_at: row.created_at,
      updated_at: row.updated_at,
    }), counters, opts.dryRun);

  // Junction tables (composite keys, no id remap needed but we still track source.id)
  // unidade_cargos
  {
    const rows = all.unidade_cargos;
    const toInsert: any[] = [];
    const mapEntries: any[] = [];
    const bucket = map.get("unidade_cargos") ?? new Map();
    map.set("unidade_cargos", bucket);
    for (const row of rows) {
      const sid = String(row.id);
      if (bucket.has(sid)) { counters.skipped.unidade_cargos = (counters.skipped.unidade_cargos ?? 0) + 1; continue; }
      const u = idOf(map, "unidades", row.unidade_id);
      const c = idOf(map, "cargos", row.cargo_id);
      if (!u || !c) { counters.skipped.unidade_cargos = (counters.skipped.unidade_cargos ?? 0) + 1; continue; }
      toInsert.push({ unidade_id: u, cargo_id: c });
      mapEntries.push({ source_table: "unidade_cargos", source_id: sid, target_table: "dp_unidade_cargos", target_id: u });
      bucket.set(sid, u);
    }
    if (!opts.dryRun && toInsert.length) {
      const { error } = await dest.from("dp_unidade_cargos").upsert(toInsert, { onConflict: "unidade_id,cargo_id", ignoreDuplicates: true });
      if (error) { for (const r of toInsert) await recordError(dest, runId, "unidade_cargos", null, error.message, r); }
      else await persistIdMap(dest, runId, mapEntries);
    }
    counters.imported.unidade_cargos = (counters.imported.unidade_cargos ?? 0) + toInsert.length;
  }

  // sindicato_unidades
  {
    const rows = all.sindicato_unidades;
    const toInsert: any[] = [];
    const mapEntries: any[] = [];
    const bucket = map.get("sindicato_unidades") ?? new Map();
    map.set("sindicato_unidades", bucket);
    for (const row of rows) {
      const sid = String(row.id);
      if (bucket.has(sid)) { counters.skipped.sindicato_unidades = (counters.skipped.sindicato_unidades ?? 0) + 1; continue; }
      const s = idOf(map, "sindicatos", row.sindicato_id);
      const u = idOf(map, "unidades", row.unidade_id);
      if (!s || !u) { counters.skipped.sindicato_unidades = (counters.skipped.sindicato_unidades ?? 0) + 1; continue; }
      toInsert.push({ sindicato_id: s, unidade_id: u });
      mapEntries.push({ source_table: "sindicato_unidades", source_id: sid, target_table: "dp_sindicato_unidades", target_id: s });
      bucket.set(sid, s);
    }
    if (!opts.dryRun && toInsert.length) {
      const { error } = await dest.from("dp_sindicato_unidades").upsert(toInsert, { onConflict: "sindicato_id,unidade_id", ignoreDuplicates: true });
      if (error) { for (const r of toInsert) await recordError(dest, runId, "sindicato_unidades", null, error.message, r); }
      else await persistIdMap(dest, runId, mapEntries);
    }
    counters.imported.sindicato_unidades = (counters.imported.sindicato_unidades ?? 0) + toInsert.length;
  }

  // sindicato_cargos
  {
    const rows = all.sindicato_cargos;
    const toInsert: any[] = [];
    const mapEntries: any[] = [];
    const bucket = map.get("sindicato_cargos") ?? new Map();
    map.set("sindicato_cargos", bucket);
    for (const row of rows) {
      const sid = String(row.id);
      if (bucket.has(sid)) { counters.skipped.sindicato_cargos = (counters.skipped.sindicato_cargos ?? 0) + 1; continue; }
      const s = idOf(map, "sindicatos", row.sindicato_id);
      const c = idOf(map, "cargos", row.cargo_id);
      if (!s || !c) { counters.skipped.sindicato_cargos = (counters.skipped.sindicato_cargos ?? 0) + 1; continue; }
      toInsert.push({ sindicato_id: s, cargo_id: c });
      mapEntries.push({ source_table: "sindicato_cargos", source_id: sid, target_table: "dp_sindicato_cargos", target_id: s });
      bucket.set(sid, s);
    }
    if (!opts.dryRun && toInsert.length) {
      const { error } = await dest.from("dp_sindicato_cargos").upsert(toInsert, { onConflict: "sindicato_id,cargo_id", ignoreDuplicates: true });
      if (error) { for (const r of toInsert) await recordError(dest, runId, "sindicato_cargos", null, error.message, r); }
      else await persistIdMap(dest, runId, mapEntries);
    }
    counters.imported.sindicato_cargos = (counters.imported.sindicato_cargos ?? 0) + toInsert.length;
  }

  // folgas -> dp_folgas (colaborador_id via profiles map from user_id)
  await importTable(dest, runId, "folgas", "dp_folgas", all.folgas, map,
    (row, id) => {
      const colab = idOf(map, "profiles", row.user_id);
      if (!colab) return null;
      return {
        id,
        company_id: PAKERE_COMPANY_ID,
        colaborador_id: colab,
        data: row.data,
        tipo: FOLGA_TIPO_MAP[String(row.tipo ?? "").toLowerCase()] ?? "normal",
        origem: "admin_manual",
        status: "realizada",
        extra: row.extra ?? false,
        observacao: null,
        criado_por: null,
        created_at: row.created_at,
        updated_at: row.created_at,
      };
    }, counters, opts.dryRun);

  // trocas_folga -> dp_trocas
  await importTable(dest, runId, "trocas_folga", "dp_trocas", all.trocas_folga, map,
    (row, id) => {
      const solic = idOf(map, "profiles", row.solicitante_id);
      const dest_ = idOf(map, "profiles", row.destinatario_id);
      if (!solic) return null;
      return {
        id,
        company_id: PAKERE_COMPANY_ID,
        solicitante_id: solic,
        destino_id: dest_ ?? solic,
        data_original: row.data_solicitante ?? row.data_destinatario,
        data_proposta: row.data_destinatario ?? row.data_solicitante,
        motivo: row.mensagem ?? "Migrado",
        status: TROCA_STATUS_MAP[String(row.status ?? "").toLowerCase()] ?? "cancelada",
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    }, counters, opts.dryRun);

  // solicitacoes_especiais -> dp_solicitacoes (tipo='folga')
  await importTable(dest, runId, "solicitacoes_especiais", "dp_solicitacoes", all.solicitacoes_especiais, map,
    (row, id) => {
      const colab = idOf(map, "profiles", row.user_id);
      if (!colab) return null;
      return {
        id,
        company_id: PAKERE_COMPANY_ID,
        colaborador_id: colab,
        tipo: "folga",
        data_alvo: row.data,
        motivo: row.motivo ?? null,
        status: SOL_STATUS_MAP[String(row.status ?? "").toLowerCase()] ?? "pendente",
        resposta_admin: row.resposta_admin ?? null,
        respondido_em: row.respondido_em ?? null,
        created_at: row.created_at,
        updated_at: row.created_at,
      };
    }, counters, opts.dryRun);

  // atestados -> dp_solicitacoes (tipo='atestado')
  await importTable(dest, runId, "atestados", "dp_solicitacoes", all.atestados, map,
    (row, id) => {
      const colab = idOf(map, "profiles", row.colaborador_id);
      if (!colab) return null;
      return {
        id,
        company_id: PAKERE_COMPANY_ID,
        colaborador_id: colab,
        tipo: "atestado",
        data_alvo: row.data_atestado,
        motivo: row.observacao_colaborador ?? row.observacao ?? null,
        status: SOL_STATUS_MAP[String(row.status ?? "").toLowerCase()] ?? "pendente",
        resposta_admin: row.observacao_admin ?? null,
        respondido_em: row.respondido_em ?? null,
        arquivo_path: row.storage_path ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    }, counters, opts.dryRun);

  // documentos -> dp_documentos
  await importTable(dest, runId, "documentos", "dp_documentos", all.documentos, map,
    (row, id) => {
      const colab = idOf(map, "profiles", row.colaborador_id);
      const tipoRaw = String(row.tipo ?? "outros").toLowerCase();
      const validTipos = ["contracheque","contrato","atestado","adiantamento","ponto","disciplinar","outros","sindicato","ferias"];
      const tipo = validTipos.includes(tipoRaw) ? tipoRaw : "outros";
      const ano = row.ano ?? new Date().getFullYear();
      const mes = row.mes ?? 1;
      return {
        id,
        company_id: PAKERE_COMPANY_ID,
        colaborador_id: colab,
        tipo,
        titulo: row.nome_pdf ?? `${tipo} ${ano}/${mes}`,
        file_path: row.storage_path,
        file_name: row.nome_pdf ?? null,
        referencia_data: `${ano}-${String(mes).padStart(2,"0")}-01`,
        aprovacao_status: row.status === "disponivel" || row.aprovado_em ? "aprovado" : "pendente",
        submetido_por_colaborador: false,
        created_at: row.created_at,
        updated_at: row.created_at,
      };
    }, counters, opts.dryRun);

  // documentos_sindicato -> dp_sindicato_negociacoes
  await importTable(dest, runId, "documentos_sindicato", "dp_sindicato_negociacoes", all.documentos_sindicato, map,
    (row, id) => {
      const s = idOf(map, "sindicatos", row.sindicato_id);
      if (!s) return null;
      const ano = row.ano ?? new Date().getFullYear();
      const data_base = `${ano}-01-01`;
      const tipoRaw = String(row.tipo_documento ?? "act").toLowerCase();
      const validTipos = ["act","cct","aditivo","outro"];
      const tipo = validTipos.includes(tipoRaw) ? tipoRaw : "outro";
      return {
        id,
        company_id: PAKERE_COMPANY_ID,
        sindicato_id: s,
        data_base,
        vigencia_inicio: data_base,
        clausulas: [],
        tipo_documento: tipo,
        pdf_path: row.storage_path ?? null,
        arquivo_nome: row.nome_pdf ?? null,
        ano,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    }, counters, opts.dryRun);

  // negociacoes -> dp_sindicato_negociacoes
  await importTable(dest, runId, "negociacoes", "dp_sindicato_negociacoes", all.negociacoes, map,
    (row, id) => {
      const patronal = idOf(map, "sindicatos", row.sindicato_patronal_id);
      const laboral = idOf(map, "sindicatos", row.sindicato_laboral_id);
      const s = patronal ?? laboral;
      if (!s) return null;
      const ano = row.ano ?? new Date().getFullYear();
      const mes = row.mes ?? 1;
      const data_base = `${ano}-${String(mes).padStart(2,"0")}-01`;
      const tipoRaw = String(row.tipo_documento ?? "act").toLowerCase();
      const validTipos = ["act","cct","aditivo","outro"];
      const tipo = validTipos.includes(tipoRaw) ? tipoRaw : "outro";
      return {
        id,
        company_id: PAKERE_COMPANY_ID,
        sindicato_id: s,
        sindicato_laboral_id: laboral,
        unidade_id: idOf(map, "unidades", row.unidade_id),
        data_base,
        vigencia_inicio: data_base,
        clausulas: [],
        tipo_documento: tipo,
        pdf_path: row.storage_path ?? null,
        arquivo_nome: row.nome_pdf ?? null,
        ano,
        mes,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    }, counters, opts.dryRun);

  // modelos_mensagem -> dp_modelos_mensagem
  await importTable(dest, runId, "modelos_mensagem", "dp_modelos_mensagem", all.modelos_mensagem, map,
    (row, id) => ({
      id,
      company_id: PAKERE_COMPANY_ID,
      titulo: row.nome ?? "Modelo",
      corpo: row.corpo ?? "",
      assunto: row.assunto ?? null,
      canal: "whatsapp",
      tipo: row.tipo ?? "geral",
      variaveis: [],
      ativo: row.ativo ?? true,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }), counters, opts.dryRun);

  // bloqueio_regras -> dp_bloqueio_regras
  await importTable(dest, runId, "bloqueio_regras", "dp_bloqueio_regras", all.bloqueio_regras, map,
    (row, id) => {
      const tipoRaw = String(row.tipo ?? "").toLowerCase();
      // Destination CHECK allows only fixa_anual (mes+dia) or dinamica (regra_json).
      // Map fixa/fixa_anual with mes+dia → fixa_anual; everything else (dinamica, pos_pagamento…) → dinamica.
      const canBeFixa = (tipoRaw === "fixa" || tipoRaw === "fixa_anual") && row.mes != null && row.dia != null;
      const tipo = canBeFixa ? "fixa_anual" : "dinamica";
      return {
        id,
        company_id: PAKERE_COMPANY_ID,
        nome: row.descricao ?? "Regra",
        tipo,
        mes: row.mes ?? null,
        dia: row.dia ?? null,
        regra_json: {
          tipo_original: row.tipo ?? null,
          meses: row.meses ?? null,
          dia_semana: row.dia_semana ?? null,
          ordinal: row.ordinal ?? null,
          aplicacao: row.aplicacao ?? null,
          ano_referencia: row.ano_referencia ?? null,
          dias: row.dias ?? null,
        },
        ativo: row.ativo ?? true,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    }, counters, opts.dryRun);


  // datas_bloqueadas -> dp_datas_bloqueadas
  await importTable(dest, runId, "datas_bloqueadas", "dp_datas_bloqueadas", all.datas_bloqueadas, map,
    (row, id) => ({
      id,
      company_id: PAKERE_COMPANY_ID,
      data: row.data,
      motivo: row.motivo ?? "Bloqueado",
      unidade_id: idOf(map, "unidades", row.unidade_id),
      created_at: row.created_at,
      updated_at: row.created_at,
    }), counters, opts.dryRun);

  // Finalize
  const finalStatus = opts.dryRun ? "dry_run_ok" : "completed";
  await dest.from("dp_legacy_import_runs").update({
    status: finalStatus,
    finished_at: new Date().toISOString(),
    source_counts: sourceCounts,
    imported_counts: counters.imported,
    skipped_counts: counters.skipped,
    error_counts: counters.errors,
  }).eq("id", runId);

  return {
    runId,
    status: finalStatus,
    source_counts: sourceCounts,
    imported: counters.imported,
    skipped: counters.skipped,
    errors: counters.errors,
    total_imported: Object.values(counters.imported).reduce((a, b) => a + b, 0),
  };
}

async function runRollback(dest: SupabaseClient, runId: string) {
  if (!runId) throw new Error("runId obrigatório para rollback");
  const { data: entries, error } = await dest
    .from("dp_legacy_import_id_map")
    .select("target_table, target_id")
    .eq("import_run_id", runId);
  if (error) throw new Error(error.message);

  const grouped: Record<string, string[]> = {};
  for (const e of entries ?? []) {
    grouped[e.target_table] = grouped[e.target_table] ?? [];
    grouped[e.target_table].push(e.target_id);
  }
  // Delete in reverse dependency order
  const deleteOrder = [
    "dp_datas_bloqueadas",
    "dp_bloqueio_regras",
    "dp_modelos_mensagem",
    "dp_sindicato_negociacoes",
    "dp_documentos",
    "dp_solicitacoes",
    "dp_trocas",
    "dp_folgas",
    "dp_sindicato_cargos",
    "dp_sindicato_unidades",
    "dp_unidade_cargos",
    "dp_colaboradores",
    "dp_sindicatos",
    "dp_cargos",
    "dp_unidades",
  ];
  const deleted: Record<string, number> = {};
  for (const t of deleteOrder) {
    const ids = grouped[t];
    if (!ids?.length) continue;
    // Composite-key tables use target_id as one of the columns; delete whole company slice for those
    if (t === "dp_unidade_cargos" || t === "dp_sindicato_unidades" || t === "dp_sindicato_cargos") {
      // Delete only entries linked to mapped ids in that composite. Simpler: skip rollback of junction
      continue;
    }
    const { error: delErr, count } = await dest
      .from(t)
      .delete({ count: "exact" })
      .in("id", ids);
    if (delErr) throw new Error(`Rollback ${t}: ${delErr.message}`);
    deleted[t] = count ?? ids.length;
  }
  await dest.from("dp_legacy_import_id_map").delete().eq("import_run_id", runId);
  await dest.from("dp_legacy_import_runs").update({ status: "rolled_back", finished_at: new Date().toISOString() }).eq("id", runId);
  return { runId, deleted };
}

const SOURCE_BUCKET_CANDIDATES = ["documentos", "documentos_admin", "sindicatos"];
const DEST_BUCKET = "dp-documentos";

async function copyOneFile(
  source: SupabaseClient,
  dest: SupabaseClient,
  path: string,
  dryRun: boolean,
): Promise<{ ok: boolean; bucket?: string; error?: string; skipped?: boolean }> {
  if (!path) return { ok: false, error: "empty path" };

  for (const bucket of SOURCE_BUCKET_CANDIDATES) {
    const { data, error } = await source.storage.from(bucket).download(path);
    if (error || !data) continue;
    if (dryRun) return { ok: true, bucket, skipped: true };
    const bytes = new Uint8Array(await data.arrayBuffer());
    const contentType = data.type || "application/octet-stream";
    const { error: upErr } = await dest.storage.from(DEST_BUCKET).upload(path, bytes, {
      contentType,
      upsert: false,
    });
    if (upErr) {
      if (String(upErr.message).toLowerCase().includes("already exists") || String(upErr.message).toLowerCase().includes("duplicate")) {
        return { ok: true, bucket, skipped: true };
      }
      return { ok: false, bucket, error: upErr.message };
    }
    return { ok: true, bucket };

  }
  return { ok: false, error: "not found in any source bucket" };
}

async function runCopyStorage(
  source: SupabaseClient,
  dest: SupabaseClient,
  opts: { dryRun: boolean; only?: string; limit?: number; offset?: number },
) {
  const results: Record<string, { copied: number; skipped: number; failed: number; errors: unknown[] }> = {
    dp_documentos: { copied: 0, skipped: 0, failed: 0, errors: [] },
    dp_sindicato_negociacoes: { copied: 0, skipped: 0, failed: 0, errors: [] },
    dp_solicitacoes: { copied: 0, skipped: 0, failed: 0, errors: [] },
  };

  const process = async (
    table: string,
    col: string,
    rows: { id: string; path: string | null }[],
  ) => {
    const CONCURRENCY = 5;
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const batch = rows.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (r) => {
        if (!r.path) return;
        const res = await copyOneFile(source, dest, r.path, opts.dryRun);
        if (res.ok && res.skipped) results[table].skipped++;
        else if (res.ok) results[table].copied++;
        else {
          results[table].failed++;
          results[table].errors.push({ id: r.id, [col]: r.path, error: res.error });
        }
      }));
    }
  };

  const runTable = async (table: string, col: string) => {
    if (opts.only && opts.only !== table) return;
    let q = dest.from(table).select(`id, ${col}`).eq("company_id", PAKERE_COMPANY_ID).not(col, "is", null);
    if (opts.offset != null || opts.limit != null) {
      const from = opts.offset ?? 0;
      const to = from + (opts.limit ?? 1000) - 1;
      q = q.range(from, to);
    }
    const { data } = await q;
    await process(table, col, (data ?? []).map((d: any) => ({ id: d.id, path: d[col] })));
  };

  await runTable("dp_documentos", "file_path");
  await runTable("dp_sindicato_negociacoes", "pdf_path");
  await runTable("dp_solicitacoes", "arquivo_path");

  return { dryRun: opts.dryRun, dest_bucket: DEST_BUCKET, only: opts.only ?? null, results };
}




Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PAKERE_URL = Deno.env.get("PAKERE_SUPABASE_URL");
    const PAKERE_KEY =
      Deno.env.get("PAKERE_SUPABASE_SECRET_KEY_V2") ??
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

    if (mode === "sample") {
      const sample: Record<string, unknown> = {};
      for (const t of SOURCE_TABLES) {
        const { data, error } = await source.from(t).select("*").limit(1);
        sample[t] = error ? { error: error.message } : (data?.[0] ?? null);
      }
      return new Response(JSON.stringify({ mode, sample }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "dry-run" || mode === "execute") {
      const result = await runImport(source, dest, {
        dryRun: mode === "dry-run",
        copyStorage: !!body.copyStorage,
      });
      return new Response(JSON.stringify({ mode, ...result }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "rollback") {
      const result = await runRollback(dest, String(body.runId ?? ""));
      return new Response(JSON.stringify({ mode, ...result }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "copy-storage") {
      const result = await runCopyStorage(source, dest, {
        dryRun: !!body.dryRun,
        only: body.only,
        limit: body.limit,
        offset: body.offset,
      });

      return new Response(JSON.stringify({ mode, ...result }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

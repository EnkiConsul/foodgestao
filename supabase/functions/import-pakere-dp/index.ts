// Edge Function: import-pakere-dp
// Executa (ou simula) a importação da base Pakere para o módulo DP do 360°FOOD.
// Somente super_admin. Dry-run é o padrão.

import { z } from "npm:zod@3.23.8";
import {
  corsHeaders,
  getAdminClient,
  getPakereClient,
  IMPLEMENTED_MODULES,
  ImportModule,
  json,
  makeLogger,
  requireSuperAdmin,
  SUPPORTED_MODULES,
} from "../_shared/pakere-import.ts";
import {
  importCargos,
  importColaboradores,
  importUnidades,
  notImplemented,
} from "../_shared/pakere-handlers.ts";

const BodySchema = z.object({
  company_id: z.string().uuid(),
  dry_run: z.boolean().default(true),
  copy_storage: z.boolean().default(false),
  batch_size: z.number().int().min(50).max(500).default(200),
  modules: z.array(z.enum(SUPPORTED_MODULES)).min(1),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authz = await requireSuperAdmin(req);
  if (!authz.ok) return authz.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const { company_id, dry_run, copy_storage, batch_size, modules } = parsed.data;

  const admin = getAdminClient();

  // 1) Empresa existe e está ativa
  const { data: company, error: companyErr } = await admin
    .from("companies")
    .select("id, ativo, name")
    .eq("id", company_id)
    .maybeSingle();
  if (companyErr || !company) return json({ error: "Empresa não encontrada" }, 404);
  if (company.ativo === false) return json({ error: "Empresa inativa" }, 400);

  // 2) Módulo DP habilitado (se a tabela company_modules estiver em uso)
  const { data: dpModule } = await admin
    .from("company_modules")
    .select("ativo, modulo_key, enabled")
    .eq("company_id", company_id);
  if (dpModule && dpModule.length > 0) {
    const dpRow = dpModule.find(
      (m) =>
        String(m.modulo_key ?? "").toLowerCase().includes("dp") ||
        String(m.modulo_key ?? "").toLowerCase().includes("pessoal"),
    );
    if (dpRow && (dpRow.ativo === false || dpRow.enabled === false)) {
      return json({ error: "Módulo DP não está ativo para esta empresa" }, 400);
    }
  }

  // 3) Lock: já existe run 'running'?
  const { data: existingRun } = await admin
    .from("dp_import_runs")
    .select("id")
    .eq("company_id", company_id)
    .eq("status", "running")
    .maybeSingle();
  if (existingRun) {
    return json({ error: "Já existe uma importação em execução para esta empresa" }, 409);
  }

  // 4) Cria a run
  const { data: run, error: runErr } = await admin
    .from("dp_import_runs")
    .insert({
      company_id,
      source_name: "pakere",
      status: "running",
      dry_run,
      copy_storage,
      batch_size,
      modules,
      started_at: new Date().toISOString(),
      started_by: authz.userId,
    })
    .select("id")
    .single();
  if (runErr || !run) return json({ error: runErr?.message ?? "Falha ao criar run" }, 500);

  const runId = run.id;
  const logger = makeLogger(admin, runId);

  let pakere;
  try {
    pakere = getPakereClient();
  } catch (e) {
    await admin
      .from("dp_import_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        errors: [{ message: (e as Error).message }],
      })
      .eq("id", runId);
    return json({ error: (e as Error).message }, 500);
  }

  const ctx = { admin, pakere, companyId: company_id, runId, dryRun: dry_run, batchSize: batch_size, logger };
  const results: unknown[] = [];
  const sourceCounts: Record<string, number> = {};
  const destCounts: Record<string, number> = {};
  const errors: unknown[] = [];

  try {
    for (const m of modules as ImportModule[]) {
      await logger.log(m, "info", `Iniciando módulo ${m} (dry_run=${dry_run})`);
      let result;
      if (!IMPLEMENTED_MODULES.has(m)) {
        result = notImplemented(m);
      } else if (m === "unidades") {
        result = await importUnidades(ctx);
      } else if (m === "cargos") {
        result = await importCargos(ctx);
      } else if (m === "colaboradores") {
        result = await importColaboradores(ctx);
      } else {
        result = notImplemented(m);
      }
      results.push(result);
      sourceCounts[m] = result.sourceCount;
      destCounts[m] = result.destCount;
      if (result.errors > 0) {
        errors.push({ entity: m, errors: result.errors });
      }
      await logger.log(m, "info", `Módulo ${m} finalizado`, result as unknown as Record<string, unknown>);
    }

    const finalStatus = errors.length > 0 ? "failed" : "success";
    await admin
      .from("dp_import_runs")
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        source_counts: sourceCounts,
        dest_counts: destCounts,
        errors,
        report: { results, dry_run, copy_storage },
      })
      .eq("id", runId);

    return json({ run_id: runId, status: finalStatus, dry_run, results });
  } catch (e) {
    const msg = (e as Error).message;
    await logger.log("pipeline", "error", `Falha geral: ${msg}`);
    await admin
      .from("dp_import_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        errors: [{ message: msg }],
      })
      .eq("id", runId);
    return json({ run_id: runId, error: msg }, 500);
  }
});

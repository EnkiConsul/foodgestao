// Edge Function: rollback-pakere-dp-import
// Reverte uma importação específica (dp_import_runs.id), removendo apenas
// registros criados pela run e na ordem inversa das dependências.

import { z } from "npm:zod@3.23.8";
import {
  corsHeaders,
  getAdminClient,
  json,
  makeLogger,
  requireSuperAdmin,
} from "../_shared/pakere-import.ts";

const BodySchema = z.object({
  import_run_id: z.string().uuid(),
  dry_run: z.boolean().default(false),
});

// Ordem inversa das dependências
const REVERSE_ORDER = ["colaboradores", "cargos", "unidades"] as const;

const ENTITY_TABLE: Record<string, string> = {
  unidades: "dp_unidades",
  cargos: "dp_cargos",
  colaboradores: "dp_colaboradores",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authz = await requireSuperAdmin(req);
  if (!authz.ok) return authz.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const { import_run_id, dry_run } = parsed.data;

  const admin = getAdminClient();

  const { data: run, error: runErr } = await admin
    .from("dp_import_runs")
    .select("id, company_id, status, dry_run, finished_at")
    .eq("id", import_run_id)
    .maybeSingle();
  if (runErr || !run) return json({ error: "Run não encontrada" }, 404);
  if (run.dry_run) return json({ error: "Run é dry-run, nada a reverter" }, 400);
  if (run.status === "rolled_back") return json({ error: "Run já foi revertida" }, 400);

  const logger = makeLogger(admin, import_run_id);

  const { data: mappings } = await admin
    .from("dp_import_id_map")
    .select("entity, dest_id")
    .eq("run_id", import_run_id);

  const byEntity = new Map<string, string[]>();
  for (const m of mappings ?? []) {
    const arr = byEntity.get(m.entity) ?? [];
    arr.push(m.dest_id);
    byEntity.set(m.entity, arr);
  }

  const preview: Record<string, { toDelete: number; keptBecauseEdited: number }> = {};
  const executed: Record<string, number> = {};
  const finishedAt = run.finished_at ? new Date(run.finished_at) : null;

  for (const entity of REVERSE_ORDER) {
    const ids = byEntity.get(entity) ?? [];
    const table = ENTITY_TABLE[entity];
    if (!table || ids.length === 0) {
      preview[entity] = { toDelete: 0, keptBecauseEdited: 0 };
      continue;
    }
    // Verifica registros editados após a importação — preservados.
    let keptBecauseEdited = 0;
    if (finishedAt) {
      const { data: edited } = await admin
        .from(table)
        .select("id")
        .in("id", ids)
        .gt("updated_at", finishedAt.toISOString());
      keptBecauseEdited = edited?.length ?? 0;
    }
    const editedSet = new Set<string>();
    if (keptBecauseEdited > 0 && finishedAt) {
      const { data: edited2 } = await admin
        .from(table)
        .select("id")
        .in("id", ids)
        .gt("updated_at", finishedAt.toISOString());
      for (const r of edited2 ?? []) editedSet.add(r.id);
    }
    const deletable = ids.filter((id) => !editedSet.has(id));
    preview[entity] = { toDelete: deletable.length, keptBecauseEdited };

    if (!dry_run && deletable.length > 0) {
      const { error: delErr } = await admin.from(table).delete().in("id", deletable);
      if (delErr) {
        await logger.log(entity, "error", `Falha ao deletar ${entity}`, { error: delErr.message });
      } else {
        executed[entity] = deletable.length;
        await admin
          .from("dp_import_id_map")
          .delete()
          .eq("run_id", import_run_id)
          .eq("entity", entity)
          .in("dest_id", deletable);
      }
    }
  }

  if (!dry_run) {
    await admin
      .from("dp_import_runs")
      .update({ status: "rolled_back", updated_at: new Date().toISOString() })
      .eq("id", import_run_id);
    await logger.log("rollback", "info", "Rollback executado", { executed });
  }

  return json({ run_id: import_run_id, dry_run, preview, executed });
});

// Edge function: dp-doc-bulk-discard
// Descarta lotes temporários de importação DP e remove arquivos do bucket
// dp-bulk-import. Não remove documentos finais já aprovados.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const BUCKET = "dp-bulk-import";

const BodySchema = z.object({
  batch_id: z.string().uuid().optional(),
  company_id: z.string().uuid().optional(),
  cleanup_abandoned: z.boolean().optional().default(false),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const svc = createClient(url, service);

    if (parsed.data.cleanup_abandoned) {
      if (!parsed.data.company_id) return json({ error: "company_id obrigatório" }, 400);
      const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

      const { data: batches, error: listErr } = await userClient
        .from("dp_bulk_import_batches")
        .select("id, company_id, source_file_path, status, created_at")
        .eq("company_id", parsed.data.company_id)
        .in("status", ["ready", "failed", "processing"])
        .lt("created_at", cutoff)
        .limit(25);
      if (listErr) return json({ error: listErr.message }, 500);

      let removed = 0;
      for (const batch of batches ?? []) {
        const didRemove = await discardBatchIfTemporary(userClient, svc, batch);
        if (didRemove) removed += 1;
      }

      return json({ ok: true, removed });
    }

    if (!parsed.data.batch_id) return json({ error: "batch_id obrigatório" }, 400);

    const { data: batch, error: bErr } = await userClient
      .from("dp_bulk_import_batches")
      .select("id, company_id, source_file_path, status")
      .eq("id", parsed.data.batch_id)
      .maybeSingle();
    if (bErr) return json({ error: bErr.message }, 500);
    if (!batch) return json({ error: "Lote não encontrado" }, 404);

    const didRemove = await discardBatchIfTemporary(userClient, svc, batch);
    if (!didRemove) {
      return json({ error: "Este lote já possui documentos salvos e não pode ser descartado." }, 409);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function discardBatchIfTemporary(userClient: any, svc: any, batch: any): Promise<boolean> {
  const { count: importedCount, error: countErr } = await userClient
    .from("dp_bulk_import_items")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batch.id)
    .eq("status", "imported");
  if (countErr) throw new Error(countErr.message);

  if ((importedCount ?? 0) > 0) return false;

  await removeBatchFiles(svc, String(batch.company_id), String(batch.id), batch.source_file_path ?? null);

  const { error: delErr } = await svc
    .from("dp_bulk_import_batches")
    .delete()
    .eq("id", batch.id);
  if (delErr) throw new Error(delErr.message);
  return true;
}

async function removeBatchFiles(svc: any, companyId: string, batchId: string, sourcePath: string | null) {
  const prefix = `${companyId}/${batchId}`;
  const paths = new Set<string>();
  if (sourcePath) paths.add(sourcePath);

  const { data: files } = await svc.storage.from(BUCKET).list(prefix, { limit: 1000 });
  for (const file of files ?? []) {
    if (file?.name) paths.add(`${prefix}/${file.name}`);
  }

  const all = [...paths];
  for (let i = 0; i < all.length; i += 100) {
    await svc.storage.from(BUCKET).remove(all.slice(i, i + 100));
  }
}
// Edge function: dp-doc-bulk-ingest
//
// Receptor do lote: valida quem chamou, coloca o lote na fila durável e
// responde 202. O processamento (split de páginas + OCR + casamento) é feito
// pelo worker `dp-doc-bulk-worker`, que é acionado por agendamento no banco.
//
// O aviso ao worker aqui é apenas melhor esforço (latência baixa no caminho
// normal): se ele falhar, o agendamento garante a execução. Nada de
// EdgeRuntime.waitUntil como garantia de trabalho importante.
//
// Body: { batch_id: uuid }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireCompanyAccess, requireUser } from "../_shared/authz.ts";
import { z } from "npm:zod@3";

const BodySchema = z.object({ batch_id: z.string().uuid() });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    if (!user) return json({ error: "Não autenticado" }, 401);
    const authHeader = `Bearer ${user.token}`;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { batch_id } = parsed.data;

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(url, service);

    // Lê o lote sob as regras do usuário — garante que ele pode processá-lo
    const { data: batch, error: bErr } = await userClient
      .from("dp_bulk_import_batches").select("id, company_id, status").eq("id", batch_id)
      .maybeSingle();
    if (bErr || !batch) {
      if (bErr) console.error("[dp-doc-bulk-ingest] read batch:", bErr.message);
      return json({ error: "Lote não encontrado" }, 404);
    }
    if (!(await requireCompanyAccess(user.id, String(batch.company_id)))) {
      return json({ error: "Sem permissão para esta operação." }, 403);
    }

    // Enfileira (idempotente: reenviar o mesmo lote não duplica trabalho —
    // as páginas têm chave única por lote+página).
    const { error: upErr } = await svc.from("dp_bulk_import_batches")
      .update({
        status: "queued",
        processed_pages: 0,
        error_message: null,
        prep_locked_by: null,
        prep_lease_expires_at: null,
      })
      .eq("id", batch_id)
      .in("status", ["queued", "processing", "failed"]);
    if (upErr) {
      console.error("[dp-doc-bulk-ingest] enqueue:", upErr.message);
      return json({ error: "Não foi possível enfileirar o lote." }, 500);
    }

    // Aviso ao worker: melhor esforço, nunca a garantia.
    const workerSecret = Deno.env.get("DP_BULK_WORKER_SECRET") ??
      Deno.env.get("WEBHOOK_WORKER_SECRET");
    if (workerSecret) {
      try {
        await fetch(`${url}/functions/v1/dp-doc-bulk-worker`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-worker-secret": workerSecret,
          },
          body: "{}",
        });
      } catch (_e) {
        // Silencioso de propósito: o agendamento assume o serviço.
      }
    }

    return json({ ok: true, batch_id, status: "queued" }, 202);
  } catch (e) {
    console.error("[dp-doc-bulk-ingest] fatal:", (e as Error).message);
    return json({ error: "Não foi possível concluir a operação." }, 500);
  }
});

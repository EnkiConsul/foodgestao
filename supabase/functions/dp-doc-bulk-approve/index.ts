// Edge function: dp-doc-bulk-approve
// Aprova itens de um lote de importação: copia o PDF da página do bucket
// dp-bulk-import para dp-documentos e insere linha em dp_documentos.
//
// Body: { item_ids: uuid[] } (todos do mesmo batch)

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { DOC_TIPO_EXIGE_ACEITE, DOC_TIPO_LABEL } from "../_shared/doc-tipos.ts";

const SRC_BUCKET = "dp-bulk-import";
const DST_BUCKET = "dp-documentos";

const BodySchema = z.object({
  item_ids: z.array(z.string().uuid()).min(1).max(200),
  on_duplicate: z.enum(["skip", "replace"]).default("skip"),
  /** Aprovação explícita de lote sem unidade identificada (registrada em auditoria). */
  sem_unidade_confirmado: z.boolean().optional().default(false),
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

    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Não autenticado" }, 401);

    const { data: items, error: iErr } = await userClient
      .from("dp_bulk_import_items")
      .select("*, dp_bulk_import_batches!inner(id, company_id, tipo, referencia_data, source_file_name, source_file_path, deteccao_automatica, exigir_aceite, unidade_id)")
      .in("id", parsed.data.item_ids);
    if (iErr) return json({ error: iErr.message }, 500);
    if (!items || items.length === 0) return json({ error: "Nenhum item encontrado" }, 404);

    const onDuplicate = parsed.data.on_duplicate;
    const results: Array<{ id: string; ok: boolean; documento_id?: string; error?: string; replaced?: boolean }> = [];

    // Zera contador de aprovação para os batches envolvidos (o progresso é
    // atualizado incrementalmente enquanto o loop roda).
    const batchIdsInvolved = [...new Set((items as any[]).map((i) => i.batch_id))];
    for (const bid of batchIdsInvolved) {
      await svc.from("dp_bulk_import_batches")
        .update({ approved_count: 0 })
        .eq("id", bid);
    }

    if (parsed.data.sem_unidade_confirmado) {
      const firstBatch = (items as any[])[0]?.dp_bulk_import_batches;
      await svc.from("audit_logs").insert({
        user_id: uid,
        action: "dp_bulk_approve_sem_unidade",
        table_name: "dp_bulk_import_batches",
        record_id: firstBatch?.id ?? null,
        metadata: {
          company_id: firstBatch?.company_id ?? null,
          tipo: firstBatch?.tipo ?? null,
          referencia_data: firstBatch?.referencia_data ?? null,
          source_file_name: firstBatch?.source_file_name ?? null,
          item_count: (items as any[]).length,
        },
      });
    }

    let processedSoFar = 0;
    for (const it of items as any[]) {
      try {
        if (!it.matched_colaborador_id) {
          results.push({ id: it.id, ok: false, error: "Sem colaborador vinculado" });
          continue;
        }
        if (it.status === "imported") {
          results.push({ id: it.id, ok: true, documento_id: it.imported_documento_id });
          continue;
        }

        const batch = it.dp_bulk_import_batches;

        const referenciaData = normalizeReferenciaData(it.detected_competencia) ?? batch.referencia_data ?? null;
        // Natureza efetiva: a escolhida/detectada por página tem prioridade.
        const tipoDoc: string = it.tipo_detectado ?? batch.tipo;

        // Duplicidade: já existe documento para (colaborador, tipo, referencia_data)?
        let replacedFlag = false;
        if (referenciaData) {
          const { data: dup } = await svc
            .from("dp_documentos")
            .select("id, file_path")
            .eq("company_id", batch.company_id)
            .eq("colaborador_id", it.matched_colaborador_id)
            .eq("tipo", tipoDoc)
            .eq("referencia_data", referenciaData)
            .limit(1)
            .maybeSingle();
          if (dup?.id) {
            if (onDuplicate === "replace") {
              // Remove storage antigo (ignora falhas — o registro é a fonte da verdade)
              if (dup.file_path) {
                try { await svc.storage.from(DST_BUCKET).remove([dup.file_path]); } catch { /* noop */ }
              }
              const { error: delErr } = await svc.from("dp_documentos").delete().eq("id", dup.id);
              if (delErr) throw new Error(`Falha ao substituir: ${delErr.message}`);
              replacedFlag = true;
            } else {
              // Skip: NÃO marca como failed — deixa pending pra próxima decisão.
              results.push({ id: it.id, ok: false, error: "duplicate", documento_id: dup.id });
              continue;
            }
          }
        }

        const src = await svc.storage.from(SRC_BUCKET).download(it.page_file_path);
        if (src.error || !src.data) throw new Error(src.error?.message ?? "Falha ao ler página");
        const bytes = new Uint8Array(await src.data.arrayBuffer());

        const dstPath = `${batch.company_id}/${it.matched_colaborador_id}/${batch.id}_p${it.page_index}.pdf`;
        const up = await svc.storage.from(DST_BUCKET).upload(dstPath, bytes, {
          contentType: "application/pdf", upsert: true,
        });
        if (up.error) throw new Error(up.error.message);

        const nowIso = new Date().toISOString();
        const titulo = `${prettyTipo(tipoDoc)} p.${it.page_index} — ${batch.source_file_name ?? "lote"}`;
        // Validação digital: decisão da página tem prioridade; sem decisão,
        // o padrão é exigir aceite (salvo lote configurado para dispensar).
        const exigeAceite = typeof it.exige_aceite === "boolean"
          ? it.exige_aceite
          : (batch.exigir_aceite !== false) && (DOC_TIPO_EXIGE_ACEITE[tipoDoc] ?? false);
        const { data: doc, error: dErr } = await svc.from("dp_documentos").insert({
          company_id: batch.company_id,
          colaborador_id: it.matched_colaborador_id,
          tipo: tipoDoc,
          titulo,
          exige_aceite: exigeAceite,
          assinatura_detectada: it.assinatura_detectada ?? null,
          unidade_id: it.detected_unidade_id ?? batch.unidade_id ?? null,
          file_path: dstPath,
          file_name: `${batch.id}_p${it.page_index}.pdf`,
          file_size: bytes.byteLength,
          mime_type: "application/pdf",
          referencia_data: referenciaData,
          uploaded_by: uid,
          aprovacao_status: "aprovado",
          revisado_em: nowIso,
          revisado_por: uid,
        }).select("id").single();
        if (dErr) throw new Error(dErr.message);

        await svc.from("dp_bulk_import_items").update({
          status: "imported",
          decided_by: uid,
          decided_at: nowIso,
          imported_documento_id: doc.id,
          error_message: null,
        }).eq("id", it.id);

        results.push({ id: it.id, ok: true, documento_id: doc.id, replaced: replacedFlag });
      } catch (e) {
        await svc.from("dp_bulk_import_items").update({
          status: "failed", error_message: (e as Error).message,
        }).eq("id", it.id);
        results.push({ id: it.id, ok: false, error: (e as Error).message });
      } finally {
        processedSoFar += 1;
        // Atualização incremental do progresso — permite ao frontend mostrar
        // uma barra "Salvando X de Y". Se falhar (coluna ausente em cache
        // antigo), ignora silenciosamente.
        for (const bid of batchIdsInvolved) {
          try {
            await svc.from("dp_bulk_import_batches")
              .update({ approved_count: processedSoFar })
              .eq("id", bid);
          } catch { /* noop */ }
        }
      }
    }

    // Atualiza status final do batch
    for (const bid of batchIdsInvolved) {
      const { data: remaining } = await svc.from("dp_bulk_import_items")
        .select("status").eq("batch_id", bid);
      const all = remaining ?? [];
      const done = all.every((r) => r.status === "imported" || r.status === "rejected");
      const some = all.some((r) => r.status === "imported");
      if (done) await cleanupBatchFiles(svc, bid, items as any[]);
      await svc.from("dp_bulk_import_batches")
        .update({ status: done ? "imported" : some ? "partially_imported" : "ready" })
        .eq("id", bid);
    }

    return json({ results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function prettyTipo(t: string) {
  return DOC_TIPO_LABEL[t] ?? "Documento";
}

function normalizeReferenciaData(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  const ym = raw.match(/^(20\d{2})-(0[1-9]|1[0-2])$/);
  if (ym) return `${ym[1]}-${ym[2]}-01`;
  const ymd = raw.match(/^(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);
  if (ymd) return raw;
  return null;
}

async function cleanupBatchFiles(svc: any, batchId: string, items: any[]) {
  const batch = items.find((i) => i.batch_id === batchId)?.dp_bulk_import_batches;
  if (!batch?.company_id) return;
  const prefix = `${batch.company_id}/${batchId}`;
  const paths = new Set<string>();
  if (batch.source_file_path) paths.add(batch.source_file_path);
  for (const it of items) {
    if (it.batch_id === batchId && it.page_file_path) paths.add(it.page_file_path);
  }
  const { data: files } = await svc.storage.from(SRC_BUCKET).list(prefix, { limit: 1000 });
  for (const file of files ?? []) if (file?.name) paths.add(`${prefix}/${file.name}`);
  const all = [...paths];
  for (let i = 0; i < all.length; i += 100) {
    await svc.storage.from(SRC_BUCKET).remove(all.slice(i, i + 100));
  }
}

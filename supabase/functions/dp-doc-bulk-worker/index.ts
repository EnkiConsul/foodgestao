// supabase/functions/dp-doc-bulk-worker/index.ts
// Worker durável da fila de importação de documentos do Pessoas 360°.
//
// Acionado por agendamento no banco (garantia de execução) e também por um
// aviso de melhor esforço de dp-doc-bulk-ingest (latência baixa no caminho
// normal). Nunca é a resposta HTTP de um usuário que garante o processamento.
//
// - reserva atômica (FOR UPDATE SKIP LOCKED) via RPC: um worker por item;
// - concessão (lease) com validade: worker morto é recuperado por outro;
// - OCR/IA com tempo limite explícito;
// - erro transitório → nova tentativa com espera crescente; definitivo → final;
// - idempotente: página já aprovada/importada nunca é sobrescrita.
//
// verify_jwt = false — protegido por segredo interno em cabeçalho.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { secretMatches } from "../_shared/secret.ts";
import { assinaturaDocumento } from "../_shared/doc-tipos.ts";
import {
  base64Encode,
  classifyError,
  type Colab,
  montarPayloadItem,
  ocrPage,
  onlyDigits,
} from "../_shared/doc-bulk-ocr.ts";

const BUCKET = "dp-bulk-import";
const MAX_PAGES = 60;
const ITEM_BATCH = Number(Deno.env.get("DP_BULK_ITEM_BATCH") ?? "6");
const ITEM_LEASE_SECONDS = 180;
const BATCH_LEASE_SECONDS = 300;
const MAX_RUN_MS = 50_000;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WORKER_SECRET = Deno.env.get("DP_BULK_WORKER_SECRET") ??
  Deno.env.get("WEBHOOK_WORKER_SECRET");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Identidade do worker: usada como dono da reserva. */
const workerId = () => `dp-bulk-${crypto.randomUUID().slice(0, 8)}`;

type Admin = SupabaseClient;

/** Contexto da empresa, carregado uma vez por lote. */
type CompanyCtx = {
  colabList: Colab[];
  cpfMap: Map<string, Colab>;
  cnpjToUnidade: Map<string, string>;
};

async function carregarContexto(admin: Admin, companyId: string): Promise<CompanyCtx> {
  const { data: colabs } = await admin
    .from("dp_colaboradores")
    .select(
      "id, nome, cpf, matricula, ativo, unidade_id, possui_folha_ponto, vinculo_label, socio_remuneracao",
    )
    .eq("company_id", companyId);
  const colabList = (colabs ?? []) as Colab[];

  const { data: unidades } = await admin
    .from("dp_unidades").select("id, cnpj").eq("company_id", companyId);
  const cnpjToUnidade = new Map<string, string>();
  for (const u of (unidades ?? []) as Array<{ id: string; cnpj: string | null }>) {
    if (u.cnpj) cnpjToUnidade.set(onlyDigits(u.cnpj), u.id);
  }

  const cpfMap = new Map<string, Colab>();
  for (const c of colabList) if (c.cpf) cpfMap.set(onlyDigits(c.cpf), c);

  return { colabList, cpfMap, cnpjToUnidade };
}

// ---------- Etapa 1: preparação do lote (separa páginas e enfileira) --------

async function prepararLotes(admin: Admin, worker: string): Promise<number> {
  const { data: lotes, error } = await admin.rpc("dp_bulk_claim_batches", {
    _worker: worker, _limit: 2, _lease_seconds: BATCH_LEASE_SECONDS,
  });
  if (error) {
    console.error("[dp-doc-bulk-worker] claim_batches", error.message);
    return 0;
  }

  let ok = 0;
  for (const lote of (lotes ?? []) as Array<Record<string, unknown>>) {
    const batchId = String(lote.id);
    try {
      const src = await admin.storage.from(BUCKET).download(String(lote.source_file_path));
      if (src.error || !src.data) throw new Error("download_falhou");
      const bytes = new Uint8Array(await src.data.arrayBuffer());

      let pdf: PDFDocument;
      try {
        pdf = await PDFDocument.load(bytes);
      } catch {
        await admin.from("dp_bulk_import_batches")
          .update({
            status: "failed",
            error_message: "PDF inválido ou protegido",
            prep_locked_by: null,
            prep_lease_expires_at: null,
          })
          .eq("id", batchId);
        continue;
      }

      const totalPages = Math.min(pdf.getPageCount(), MAX_PAGES);

      // Separa e sobe cada página (upsert: reexecução não duplica arquivo).
      for (let i = 0; i < totalPages; i++) {
        const path = `${lote.company_id}/${batchId}/page_${i + 1}.pdf`;
        const single = await PDFDocument.create();
        const [copied] = await single.copyPages(pdf, [i]);
        single.addPage(copied);
        const pageBytes = await single.save();
        const up = await admin.storage.from(BUCKET).upload(path, pageBytes, {
          contentType: "application/pdf", upsert: true,
        });
        if (up.error) throw new Error("upload_pagina_falhou");
      }

      const { error: enqErr } = await admin.rpc("dp_bulk_enqueue_pages", {
        _batch_id: batchId, _total_pages: totalPages, _worker: worker,
      });
      if (enqErr) throw new Error(enqErr.message);
      ok++;
    } catch (e) {
      // Sem detalhes do conteúdo: apenas o código do erro.
      console.error("[dp-doc-bulk-worker] prep", batchId, classifyError(e), (e as Error).message);
      const fatal = classifyError(e) === "fatal" || Number(lote.prep_attempt_count ?? 0) >= 5;
      await admin.from("dp_bulk_import_batches")
        .update(
          fatal
            ? {
              status: "failed",
              error_message: "Falha ao preparar o arquivo do lote",
              prep_locked_by: null,
              prep_lease_expires_at: null,
            }
            : { prep_locked_by: null, prep_lease_expires_at: null },
        )
        .eq("id", batchId);
    }
  }
  return ok;
}

// ---------- Etapa 2: processamento das páginas -----------------------------

async function processarItem(
  admin: Admin,
  worker: string,
  aiKey: string,
  item: Record<string, unknown>,
  ctxCache: Map<string, CompanyCtx>,
): Promise<"ok" | "retry" | "failed"> {
  const itemId = String(item.id);
  const companyId = String(item.company_id);
  try {
    let ctx = ctxCache.get(companyId);
    if (!ctx) {
      ctx = await carregarContexto(admin, companyId);
      ctxCache.set(companyId, ctx);
    }

    const dl = await admin.storage.from(BUCKET).download(String(item.page_file_path));
    if (dl.error || !dl.data) throw new Error("pagina_indisponivel");
    const pageBytes = new Uint8Array(await dl.data.arrayBuffer());

    const ocr = await ocrPage(aiKey, base64Encode(pageBytes));

    // Regra de natureza aprendida pela empresa (mesma lógica anterior).
    const batchCtx = {
      tipo: String(item.batch_tipo ?? "outros"),
      source_file_name: (item.batch_source_file_name as string) ?? null,
      referencia_data: (item.batch_referencia_data as string) ?? null,
      deteccao_automatica: !!item.batch_deteccao_automatica,
      exigir_aceite: item.batch_exigir_aceite !== false,
    };

    const assinatura = assinaturaDocumento(batchCtx.source_file_name ?? "", ocr);
    let tipoAprendido: string | null = null;
    let regraId: string | null = null;
    let regraHits = 1;
    if (assinatura) {
      const { data: regra } = await admin.from("dp_doc_tipo_aprendizado")
        .select("id, tipo, hits")
        .eq("company_id", companyId)
        .eq("assinatura", assinatura)
        .limit(1).maybeSingle();
      if (regra?.tipo) {
        tipoAprendido = regra.tipo as string;
        regraId = regra.id as string;
        regraHits = (regra.hits ?? 1) + 1;
      }
    }

    const payload = await montarPayloadItem(ocr, batchCtx, {
      colabList: ctx.colabList,
      cpfMap: ctx.cpfMap,
      cnpjToUnidade: ctx.cnpjToUnidade,
      // deno-lint-ignore no-explicit-any
      tipoAprendido: tipoAprendido as any,
      buscarDuplicado: async (colaboradorId, tipo, ref) => {
        const { data: dup } = await admin.from("dp_documentos")
          .select("id").eq("colaborador_id", colaboradorId).eq("tipo", tipo)
          .eq("referencia_data", ref).limit(1).maybeSingle();
        return (dup?.id as string) ?? null;
      },
    });

    const { data: gravou, error: finErr } = await admin.rpc("dp_bulk_item_finish_success", {
      _item_id: itemId, _worker: worker, _payload: payload,
    });
    if (finErr) throw new Error(finErr.message);

    if (gravou && regraId) {
      await admin.from("dp_doc_tipo_aprendizado")
        .update({ hits: regraHits, last_used_at: new Date().toISOString() })
        .eq("id", regraId);
    }
    return "ok";
  } catch (e) {
    const cls = classifyError(e);
    const msg = (e as Error).message ?? "erro";
    console.error("[dp-doc-bulk-worker] item", itemId, cls, msg.slice(0, 120));
    const { data: novoStatus } = await admin.rpc("dp_bulk_item_finish_failure", {
      _item_id: itemId,
      _worker: worker,
      _error: msg.slice(0, 300),
      _error_class: cls,
      _fatal: cls === "fatal",
    });
    return novoStatus === "retry" ? "retry" : "failed";
  }
}

// ---------- Entrada -------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const provided = req.headers.get("x-worker-secret") ?? req.headers.get("x-cron-secret");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let autorizado = secretMatches(provided, WORKER_SECRET);
  if (!autorizado && provided) {
    // Segredo do agendamento interno, guardado em área privada do banco.
    const { data: dbSecret } = await admin.rpc("dp_bulk_worker_secret");
    autorizado = secretMatches(provided, dbSecret as string | null);
  }
  if (!autorizado) return json({ error: "não autorizado" }, 401);

  const aiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!aiKey) return json({ error: "LOVABLE_API_KEY não configurado" }, 500);

  const worker = workerId();
  const started = Date.now();

  try {
    // 1) devolve à fila o que ficou preso em reserva expirada
    const { data: recuperados } = await admin.rpc("dp_bulk_reclaim_expired", { _limit: 200 });

    // 2) prepara lotes recém-enfileirados
    const lotesPreparados = await prepararLotes(admin, worker);

    // 3) processa páginas em pequenas janelas, respeitando o tempo de execução
    const ctxCache = new Map<string, CompanyCtx>();
    const batchIds = new Set<string>();
    let processados = 0;
    let comRetry = 0;
    let falhas = 0;

    while (Date.now() - started < MAX_RUN_MS) {
      const { data: itens, error } = await admin.rpc("dp_bulk_claim_items", {
        _worker: worker, _limit: ITEM_BATCH, _lease_seconds: ITEM_LEASE_SECONDS,
      });
      if (error) {
        console.error("[dp-doc-bulk-worker] claim_items", error.message);
        break;
      }
      const lista = (itens ?? []) as Array<Record<string, unknown>>;
      if (lista.length === 0) break;

      const res = await Promise.all(
        lista.map((it) => {
          batchIds.add(String(it.batch_id));
          return processarItem(admin, worker, aiKey, it, ctxCache);
        }),
      );
      for (const r of res) {
        if (r === "ok") processados++;
        else if (r === "retry") comRetry++;
        else falhas++;
      }
    }

    // 4) fecha os lotes cujas páginas terminaram
    for (const id of batchIds) {
      const { error } = await admin.rpc("dp_bulk_batch_finalize", { _batch_id: id });
      if (error) console.error("[dp-doc-bulk-worker] finalize", id, error.message);
    }

    return json({
      ok: true,
      worker,
      lotes_preparados: lotesPreparados,
      itens_processados: processados,
      itens_em_retry: comRetry,
      itens_falhos: falhas,
      recuperados: recuperados ?? null,
      duracao_ms: Date.now() - started,
    });
  } catch (e) {
    console.error("[dp-doc-bulk-worker] fatal", (e as Error).message);
    return json({ error: "Não foi possível concluir a operação." }, 500);
  }
});

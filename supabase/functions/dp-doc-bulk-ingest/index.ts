// Edge function: dp-doc-bulk-ingest
// Retorna 202 imediatamente e processa o OCR em background (EdgeRuntime.waitUntil),
// em janelas de 5 páginas paralelas. Extrai automaticamente CNPJ e competência
// (mês/ano) do texto de cada página e casa com dp_colaboradores por CPF ou nome
// exato (bounded), respeitando unidade (via CNPJ) e a flag possui_folha_ponto
// para lotes do tipo 'ponto'. Inclui colaboradores inativos no match, sinalizando-os.
//
// Body: { batch_id: uuid }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { z } from "npm:zod@3";
import { extractPeriodo, extractPeriodoFromFilename } from "../_shared/competencia.ts";
import { detectTipoFromText, parseNaturezaLine, type DocTipo } from "../_shared/doc-tipos.ts";

const BUCKET = "dp-bulk-import";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const OCR_MODEL = "google/gemini-2.5-flash";
const OCR_PARALLELISM = 8;
const MAX_PAGES = 60;

const BodySchema = z.object({ batch_id: z.string().uuid() });

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

type Colab = {
  id: string;
  nome: string;
  cpf: string | null;
  matricula: string | null;
  ativo: boolean;
  unidade_id: string | null;
  possui_folha_ponto: boolean | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const { batch_id } = parsed.data;

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!aiKey) return json({ error: "LOVABLE_API_KEY não configurado" }, 500);

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(url, service);

    // Carrega o batch respeitando RLS do usuário — garante que ele pode processá-lo
    const { data: batch, error: bErr } = await userClient
      .from("dp_bulk_import_batches").select("*").eq("id", batch_id).maybeSingle();
    if (bErr || !batch) return json({ error: bErr?.message ?? "Lote não encontrado" }, 404);

    // Sinaliza processing imediatamente
    await svc.from("dp_bulk_import_batches")
      .update({ status: "processing", processed_pages: 0, error_message: null })
      .eq("id", batch_id);

    // Dispara worker em background (não bloqueia o response)
    const worker = processBatchAsync({ svc, aiKey, batch });
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(worker);
    } else {
      // Fallback local: não aguarda, apenas loga
      worker.catch((e) => console.error("[dp-doc-bulk-ingest] worker error", e));
    }

    return json({ ok: true, batch_id, status: "processing" }, 202);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

// ---------- Worker ----------

// deno-lint-ignore no-explicit-any
async function processBatchAsync({ svc, aiKey, batch }: { svc: any; aiKey: string; batch: any }) {
  const batch_id = batch.id as string;
  try {
    // 1) Download do PDF de origem
    const src = await svc.storage.from(BUCKET).download(batch.source_file_path);
    if (src.error || !src.data) throw new Error(src.error?.message ?? "Falha ao baixar PDF");
    const srcBytes = new Uint8Array(await src.data.arrayBuffer());

    let pdf: PDFDocument;
    try {
      pdf = await PDFDocument.load(srcBytes);
    } catch (e) {
      await svc.from("dp_bulk_import_batches")
        .update({ status: "failed", error_message: "PDF inválido: " + (e as Error).message })
        .eq("id", batch_id);
      return;
    }
    const totalPages = Math.min(pdf.getPageCount(), MAX_PAGES);

    await svc.from("dp_bulk_import_batches")
      .update({ total_pages: totalPages, processed_pages: 0 })
      .eq("id", batch_id);

    // 2) Colaboradores da empresa (inclui inativos para permitir sinalizar)
    const { data: colabs } = await svc
      .from("dp_colaboradores")
      .select("id, nome, cpf, matricula, ativo, unidade_id, possui_folha_ponto")
      .eq("company_id", batch.company_id);
    const colabList = (colabs ?? []) as Colab[];

    // Unidades por CNPJ para filtrar candidatos por CNPJ detectado
    const { data: unidades } = await svc
      .from("dp_unidades").select("id, cnpj").eq("company_id", batch.company_id);
    const cnpjToUnidade = new Map<string, string>();
    for (const u of (unidades ?? []) as Array<{ id: string; cnpj: string | null }>) {
      if (u.cnpj) cnpjToUnidade.set(onlyDigits(u.cnpj), u.id);
    }

    const cpfMap = new Map<string, Colab>();
    for (const c of colabList) if (c.cpf) cpfMap.set(onlyDigits(c.cpf), c);

    // 3) Processa páginas em janelas paralelas
    for (let start = 0; start < totalPages; start += OCR_PARALLELISM) {
      const end = Math.min(start + OCR_PARALLELISM, totalPages);
      const tasks: Promise<void>[] = [];
      for (let i = start; i < end; i++) {
        tasks.push(processPage({
          svc, aiKey, batch, pdf, pageIndex: i,
          colabList, cpfMap, cnpjToUnidade,
        }));
      }
      await Promise.all(tasks);
    }

    // 4) Recontagem final
    const { count: matchedCount } = await svc
      .from("dp_bulk_import_items")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batch_id)
      .not("matched_colaborador_id", "is", null);

    await svc.from("dp_bulk_import_batches")
      .update({
        status: "ready",
        matched_count: matchedCount ?? 0,
        processed_pages: totalPages,
      })
      .eq("id", batch_id);
  } catch (e) {
    await svc.from("dp_bulk_import_batches")
      .update({ status: "failed", error_message: (e as Error).message })
      .eq("id", batch_id);
  }
}

// deno-lint-ignore no-explicit-any
async function processPage(args: {
  svc: any; aiKey: string; batch: any; pdf: PDFDocument; pageIndex: number;
  colabList: Colab[]; cpfMap: Map<string, Colab>; cnpjToUnidade: Map<string, string>;
}): Promise<void> {
  const { svc, aiKey, batch, pdf, pageIndex, colabList, cpfMap, cnpjToUnidade } = args;
  const batch_id = batch.id as string;
  const pageNum = pageIndex + 1;
  const pagePath = `${batch.company_id}/${batch_id}/page_${pageNum}.pdf`;

  try {
    // Split página
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(pdf, [pageIndex]);
    single.addPage(copied);
    const pageBytes = await single.save();

    await svc.storage.from(BUCKET).upload(pagePath, pageBytes, {
      contentType: "application/pdf", upsert: true,
    });

    // OCR (com 1 retry)
    const b64 = base64Encode(pageBytes);
    let ocr = "";
    try {
      ocr = await ocrPage(aiKey, b64);
    } catch (_e) {
      ocr = await ocrPage(aiKey, b64);
    }

    // Extrações
    const cpfs = extractCPFs(ocr);
    const cnpjs = extractCNPJs(ocr);
    const competencia =
      extractPeriodo(ocr) ??
      extractPeriodoFromFilename(batch.source_file_name ?? ""); // "YYYY-MM" ou null
    const unidadeDetectada = cnpjs.map((c) => cnpjToUnidade.get(c)).find(Boolean) ?? null;

    // Natureza: regra aprendida da empresa > IA > heurística por palavra-chave.
    const assinatura = assinaturaDocumento(batch.source_file_name ?? "", ocr);
    let tipoAprendido: DocTipo | null = null;
    if (assinatura) {
      const { data: regra } = await svc.from("dp_doc_tipo_aprendizado")
        .select("id, tipo, hits")
        .eq("company_id", batch.company_id)
        .eq("assinatura", assinatura)
        .limit(1).maybeSingle();
      if (regra?.tipo) {
        tipoAprendido = regra.tipo as DocTipo;
        await svc.from("dp_doc_tipo_aprendizado")
          .update({ hits: (regra.hits ?? 1) + 1, last_used_at: new Date().toISOString() })
          .eq("id", regra.id);
      }

    }
    const tipoIa: DocTipo | null = parseNaturezaLine(ocr);
    const tipoHeuristica: DocTipo | null =
      detectTipoFromText(ocr) ?? detectTipoFromText(batch.source_file_name ?? "");
    const tipoDetectado: DocTipo | null = tipoAprendido ?? tipoIa ?? tipoHeuristica;
    const tipoOrigem = tipoAprendido ? "aprendido" : tipoIa ? "ia" : tipoHeuristica ? "keyword" : null;
    const tipoEfetivo = batch.deteccao_automatica
      ? (tipoDetectado ?? "outros")
      : batch.tipo;


    // Restrição por unidade + possui_folha_ponto (para tipo=ponto)
    const restrictPonto = tipoEfetivo === "ponto";
    const candidates = colabList.filter((c) => {
      if (restrictPonto && c.possui_folha_ponto === false) return false;
      if (unidadeDetectada && c.unidade_id && c.unidade_id !== unidadeDetectada) return false;
      return true;
    });
    const candCpf = new Map<string, Colab>();
    for (const c of candidates) if (c.cpf) candCpf.set(onlyDigits(c.cpf), c);

    let match: Colab | undefined;
    let confidence = 0;
    let matchedCpf: string | null = null;
    let matchedNome: string | null = null;

    // 1) CPF nos candidatos filtrados
    for (const cpf of cpfs) {
      const c = candCpf.get(cpf);
      if (c) { match = c; confidence = 0.95; matchedCpf = cpf; break; }
    }
    // 2) CPF em toda a lista (fallback — sem filtro)
    if (!match) {
      for (const cpf of cpfs) {
        const c = cpfMap.get(cpf);
        if (c) { match = c; confidence = 0.9; matchedCpf = cpf; break; }
      }
    }
    // 3) Nome exato bounded
    if (!match) {
      const upper = normalizeName(ocr);
      for (const c of candidates) {
        if (!c.nome) continue;
        const nome = normalizeName(c.nome);
        if (nome.length < 8) continue;
        const re = new RegExp(`(^|[^A-Z])${escapeRegex(nome)}([^A-Z]|$)`);
        if (re.test(upper)) { match = c; confidence = 0.75; matchedNome = c.nome; break; }
      }
    }

    // Duplicidade: mesmo colaborador+tipo+referência (YYYY-MM-01)
    let duplicateOf: string | null = null;
    if (match && (competencia || batch.referencia_data)) {
      const ref = competencia
        ? `${competencia}-01`
        : String(batch.referencia_data);
      const { data: dup } = await svc.from("dp_documentos")
        .select("id").eq("colaborador_id", match.id).eq("tipo", tipoEfetivo)
        .eq("referencia_data", ref).limit(1).maybeSingle();
      if (dup?.id) duplicateOf = dup.id as string;
    }

    await svc.from("dp_bulk_import_items").upsert({
      batch_id,
      company_id: batch.company_id,
      page_index: pageNum,
      page_file_path: pagePath,
      ocr_text: ocr.slice(0, 8000),
      matched_cpf: matchedCpf ?? (cpfs[0] ?? null),
      matched_nome: matchedNome,
      matched_colaborador_id: match?.id ?? null,
      matched_colaborador_ativo: match ? match.ativo : null,
      detected_cnpj: cnpjs[0] ?? null,
      detected_competencia: competencia,
      tipo_detectado: tipoEfetivo,
      tipo_confidence: tipoDetectado ? 0.9 : 0,
      duplicate_of: duplicateOf,
      confidence,
      status: "pending",
    }, { onConflict: "batch_id,page_index" });
  } catch (pageErr) {
    await svc.from("dp_bulk_import_items").upsert({
      batch_id,
      company_id: batch.company_id,
      page_index: pageNum,
      page_file_path: pagePath,
      confidence: 0,
      status: "failed",
      error_message: (pageErr as Error).message,
    }, { onConflict: "batch_id,page_index" });
  } finally {
    // Incrementa progresso de forma atômica (rpc não expõe .catch — usar await + error)
    try {
      const { error: incErr } = await svc.rpc("dp_bulk_increment_processed", { p_batch_id: batch_id });
      if (incErr) {
        const { data } = await svc.from("dp_bulk_import_batches")
          .select("processed_pages,total_pages").eq("id", batch_id).maybeSingle();
        const next = Math.min((data?.total_pages ?? 0), (data?.processed_pages ?? 0) + 1);
        await svc.from("dp_bulk_import_batches").update({ processed_pages: next }).eq("id", batch_id);
      }
    } catch (e) {
      console.error("[dp-doc-bulk-ingest] increment progress failed", e);
    }
  }
}

// ---------- Utils ----------

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function onlyDigits(s: string) { return (s ?? "").replace(/\D+/g, ""); }

function normalizeName(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractCPFs(text: string): string[] {
  const out = new Set<string>();
  const re = /(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/g;
  for (const m of text.matchAll(re)) {
    const d = onlyDigits(m[1]);
    if (d.length === 11) out.add(d);
  }
  return [...out];
}

function extractCNPJs(text: string): string[] {
  const out = new Set<string>();
  const re = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/g;
  for (const m of text.matchAll(re)) {
    const d = onlyDigits(m[1]);
    if (d.length === 14) out.add(d);
  }
  return [...out];
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function ocrPage(apiKey: string, pdfB64: string): Promise<string> {
  const body = {
    model: OCR_MODEL,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extraia TODO o texto legível deste documento de departamento pessoal. Responda apenas com o texto puro extraído, sem comentários. Inclua CPF, CNPJ, matrícula e nome do colaborador. Na PENÚLTIMA linha, acrescente exatamente `COMPETENCIA: MM/AAAA` com o mês/ano de referência do documento (o período trabalhado ou a folha a que ele se refere). NUNCA use a data de emissão, impressão, admissão ou pagamento como competência. Se não for possível determinar, escreva `COMPETENCIA: DESCONHECIDA`. Na ÚLTIMA linha, acrescente exatamente `NATUREZA: x` onde x é UM destes valores, conforme o documento: contracheque (contracheque/holerite mensal), contracheque_13 (décimo terceiro), contracheque_ferias (folha de pagamento de férias), adiantamento (adiantamento/antecipação salarial), ponto (folha/espelho de ponto), aviso_ferias, recibo_ferias, informe_rendimentos (comprovante anual de rendimentos), atestado, disciplinar (advertência/suspensão), contrato, outros. Se não tiver certeza, escreva `NATUREZA: outros`.",
          },
          {
            type: "file",
            file: {
              filename: "page.pdf",
              file_data: `data:application/pdf;base64,${pdfB64}`,
            },
          },
        ],
      },
    ],
  };
  const r = await fetch(AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`OCR HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return String(j?.choices?.[0]?.message?.content ?? "");
}

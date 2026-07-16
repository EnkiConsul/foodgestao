// Edge function: dp-doc-bulk-ingest
// Divide o PDF de um lote em páginas, roda OCR (Lovable AI / Gemini) em cada página,
// tenta casar com dp_colaboradores por CPF/nome e cria dp_bulk_import_items pendentes.
//
// Body: { batch_id: uuid }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { z } from "npm:zod@3";

const BUCKET = "dp-bulk-import";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const OCR_MODEL = "google/gemini-2.5-flash";

const BodySchema = z.object({ batch_id: z.string().uuid() });

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

    // 1) Carrega o batch (respeitando RLS do usuário)
    const { data: batch, error: bErr } = await userClient
      .from("dp_bulk_import_batches").select("*").eq("id", batch_id).maybeSingle();
    if (bErr || !batch) return json({ error: bErr?.message ?? "Lote não encontrado" }, 404);

    // 2) Baixa o PDF de origem
    const src = await svc.storage.from(BUCKET).download(batch.source_file_path);
    if (src.error || !src.data) return json({ error: src.error?.message ?? "Falha ao baixar PDF" }, 500);
    const srcBytes = new Uint8Array(await src.data.arrayBuffer());

    let pdf: PDFDocument;
    try {
      pdf = await PDFDocument.load(srcBytes);
    } catch (e) {
      await svc.from("dp_bulk_import_batches")
        .update({ status: "failed", error_message: "PDF inválido: " + (e as Error).message })
        .eq("id", batch_id);
      return json({ error: "PDF inválido" }, 400);
    }
    const totalPages = pdf.getPageCount();

    await svc.from("dp_bulk_import_batches")
      .update({ total_pages: totalPages, status: "processing", error_message: null })
      .eq("id", batch_id);

    // 3) Carrega colaboradores da empresa (para match)
    const { data: colabs } = await svc
      .from("dp_colaboradores")
      .select("id, nome, cpf, matricula")
      .eq("company_id", batch.company_id)
      .eq("ativo", true);
    const colabList = (colabs ?? []) as Array<{ id: string; nome: string; cpf: string | null; matricula: string | null }>;
    const cpfMap = new Map<string, typeof colabList[number]>();
    for (const c of colabList) if (c.cpf) cpfMap.set(onlyDigits(c.cpf), c);

    let matched = 0;
    const MAX = Math.min(totalPages, 60); // hard cap para evitar timeout

    for (let i = 0; i < MAX; i++) {
      try {
        // Split página em PDF individual
        const single = await PDFDocument.create();
        const [copied] = await single.copyPages(pdf, [i]);
        single.addPage(copied);
        const pageBytes = await single.save();

        const pagePath = `${batch.company_id}/${batch_id}/page_${i + 1}.pdf`;
        await svc.storage.from(BUCKET).upload(pagePath, pageBytes, {
          contentType: "application/pdf", upsert: true,
        });

        // OCR via Lovable AI
        const b64 = base64Encode(pageBytes);
        const ocr = await ocrPage(aiKey, b64);

        // Match CPF
        const cpfs = extractCPFs(ocr);
        let match: typeof colabList[number] | undefined;
        let confidence = 0;
        let matchedCpf: string | null = null;
        let matchedNome: string | null = null;

        for (const cpf of cpfs) {
          const c = cpfMap.get(cpf);
          if (c) { match = c; confidence = 0.95; matchedCpf = cpf; break; }
        }

        // Match por nome (fuzzy simples) se não achou
        if (!match) {
          const upper = ocr.toUpperCase();
          for (const c of colabList) {
            if (!c.nome) continue;
            const nome = c.nome.toUpperCase().trim();
            if (nome.length >= 6 && upper.includes(nome)) {
              match = c; confidence = 0.7; matchedNome = c.nome; break;
            }
          }
        }

        if (match) matched++;

        await svc.from("dp_bulk_import_items").upsert({
          batch_id,
          company_id: batch.company_id,
          page_index: i + 1,
          page_file_path: pagePath,
          ocr_text: ocr.slice(0, 8000),
          matched_cpf: matchedCpf ?? (cpfs[0] ?? null),
          matched_nome: matchedNome,
          matched_colaborador_id: match?.id ?? null,
          confidence,
          status: match ? "pending" : "pending",
        }, { onConflict: "batch_id,page_index" });
      } catch (pageErr) {
        await svc.from("dp_bulk_import_items").upsert({
          batch_id,
          company_id: batch.company_id,
          page_index: i + 1,
          page_file_path: `${batch.company_id}/${batch_id}/page_${i + 1}.pdf`,
          confidence: 0,
          status: "failed",
          error_message: (pageErr as Error).message,
        }, { onConflict: "batch_id,page_index" });
      }
    }

    await svc.from("dp_bulk_import_batches")
      .update({ status: "ready", matched_count: matched })
      .eq("id", batch_id);

    return json({ ok: true, total_pages: totalPages, processed: MAX, matched });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function onlyDigits(s: string) { return (s ?? "").replace(/\D+/g, ""); }

function extractCPFs(text: string): string[] {
  const out = new Set<string>();
  const re = /(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/g;
  for (const m of text.matchAll(re)) {
    const d = onlyDigits(m[1]);
    if (d.length === 11) out.add(d);
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
            text: "Extraia TODO o texto legível deste documento (holerite/ponto/contracheque). Responda apenas com o texto puro extraído, sem comentários. Inclua CPF, matrícula, nome do colaborador e período de referência se visíveis.",
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

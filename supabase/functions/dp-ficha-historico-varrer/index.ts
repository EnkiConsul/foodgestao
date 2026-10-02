// Edge function: dp-ficha-historico-varrer
// Releitura retroativa das fichas de registro já importadas, focada SOMENTE no
// histórico anotado (férias gozadas, afastamentos e advertências/suspensões).
// Grava o que foi lido em dados_extraidos do item (nada vai para os módulos
// oficiais aqui — a gravação é feita pela RPC dp_ficha_historico_aplicar,
// depois da conferência do gestor).
//
// Body: { importacao_id: uuid, refazer?: boolean }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireCompanyAccess, requireUser } from "../_shared/authz.ts";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { z } from "npm:zod@3";

const BUCKET = "dp-bulk-import";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.7-flash";
const PARALLELISM = 4;

const BodySchema = z.object({ importacao_id: z.string().uuid(), refazer: z.boolean().optional() });

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

const PROMPT = `Você lê FICHAS DE REGISTRO DE EMPREGADO brasileiras (Domínio, Alterdata, TOTVS, SCI, Senior e similares).
Procure APENAS os quadros de histórico: FÉRIAS (período aquisitivo e período de gozo), AFASTAMENTOS/LICENÇAS e ADVERTÊNCIAS/SUSPENSÕES/PENALIDADES.
Os quadros podem ter títulos como "Férias", "Períodos de Férias", "Anotações de Férias", "Afastamentos", "Ocorrências", "Licenças", "Penalidades", "Medidas Disciplinares", "Anotações Gerais" ou estar escritos à mão.
Responda APENAS um JSON válido, sem texto ao redor, sem cercas de código. NUNCA invente: se não houver, devolva listas vazias.
Datas no formato AAAA-MM-DD.
{
  "historico_ferias": [ { "aquisitivo_inicio": null, "aquisitivo_fim": null, "gozo_inicio": null, "gozo_fim": null, "dias": null } ],
  "historico_afastamentos": [ { "motivo": null, "inicio": null, "fim": null } ],
  "historico_advertencias": [ { "tipo": "advertencia|suspensao", "data": null, "motivo": null, "dias": null } ]
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: "Não autenticado" }, 401);
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!aiKey) return json({ error: "Serviço de leitura indisponível." }, 500);

    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${user.token}` } } });
    const svc = createClient(url, service);

    const { data: imp } = await userClient.from("dp_ficha_importacoes")
      .select("id, company_id, arquivo_path").eq("id", parsed.data.importacao_id).maybeSingle();
    if (!imp) return json({ error: "Importação não encontrada" }, 404);
    if (!(await requireCompanyAccess(user.id, String(imp.company_id)))) {
      return json({ error: "Sem permissão para esta operação." }, 403);
    }

    const { data: itens } = await svc.from("dp_ficha_importacao_itens")
      .select("id, pagina_inicio, pagina_fim, dados_extraidos")
      .eq("importacao_id", imp.id).eq("company_id", imp.company_id);
    const alvo = (itens ?? []).filter((i: { dados_extraidos: Record<string, unknown> }) =>
      parsed.data.refazer || !i.dados_extraidos?.historico_varrido_em);

    const worker = processar({ svc, aiKey, imp, itens: alvo });
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(worker);
    else worker.catch((e) => console.error("[dp-ficha-historico-varrer] worker", e));

    return json({ ok: true, total: alvo.length }, 202);
  } catch (e) {
    console.error("[dp-ficha-historico-varrer] fatal:", e);
    return json({ error: "Não foi possível concluir a operação." }, 500);
  }
});

type Item = { id: string; pagina_inicio: number; pagina_fim: number; dados_extraidos: Record<string, unknown> };

// deno-lint-ignore no-explicit-any
async function processar({ svc, aiKey, imp, itens }: { svc: any; aiKey: string; imp: any; itens: Item[] }) {
  const src = await svc.storage.from(BUCKET).download(imp.arquivo_path);
  if (src.error || !src.data) throw new Error(src.error?.message ?? "Falha ao baixar o PDF");
  const pdf = await PDFDocument.load(new Uint8Array(await src.data.arrayBuffer()));
  const total = pdf.getPageCount();

  for (let s = 0; s < itens.length; s += PARALLELISM) {
    await Promise.all(itens.slice(s, s + PARALLELISM).map(async (item) => {
      try {
        const idx: number[] = [];
        for (let p = item.pagina_inicio; p <= item.pagina_fim; p++) if (p >= 1 && p <= total) idx.push(p - 1);
        if (!idx.length) return;
        const doc = await PDFDocument.create();
        (await doc.copyPages(pdf, idx)).forEach((pg) => doc.addPage(pg));
        const obj = parseJson(await chamarIa(aiKey, base64Encode(await doc.save())));
        const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
        const novos = {
          historico_ferias: lista(obj?.historico_ferias).filter((f) => f.gozo_inicio || f.aquisitivo_inicio),
          historico_afastamentos: lista(obj?.historico_afastamentos).filter((a) => a.inicio),
          historico_advertencias: lista(obj?.historico_advertencias).filter((a) => a.data),
          historico_varrido_em: new Date().toISOString(),
        };
        await svc.from("dp_ficha_importacao_itens")
          .update({ dados_extraidos: { ...(item.dados_extraidos ?? {}), ...novos } }).eq("id", item.id);
      } catch (e) {
        console.error(`[dp-ficha-historico-varrer] item ${item.id}:`, (e as Error).message);
        await svc.from("dp_ficha_importacao_itens").update({
          dados_extraidos: { ...(item.dados_extraidos ?? {}), historico_varrido_em: new Date().toISOString(), historico_erro: (e as Error).message },
        }).eq("id", item.id);
      }
    }));
  }
}

async function chamarIa(apiKey: string, pdfB64: string): Promise<string> {
  const body = {
    model: MODEL,
    messages: [{ role: "user", content: [
      { type: "text", text: PROMPT },
      { type: "file", file: { filename: "ficha.pdf", file_data: `data:application/pdf;base64,${pdfB64}` } },
    ] }],
  };
  let ultimo = "";
  for (let t = 0; t < 3; t++) {
    const r = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify(body),
    });
    if (r.ok) return String((await r.json())?.choices?.[0]?.message?.content ?? "");
    ultimo = `HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`;
    if (r.status === 402) throw new Error("Créditos de IA esgotados.");
    if (r.status !== 429 && r.status < 500) throw new Error(ultimo);
    await new Promise((res) => setTimeout(res, 1500 * (t + 1)));
  }
  throw new Error(ultimo || "Falha na leitura por IA");
}

// deno-lint-ignore no-explicit-any
function parseJson(raw: string): any {
  const limpo = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(limpo); } catch {
    const i = limpo.indexOf("{"), f = limpo.lastIndexOf("}");
    if (i >= 0 && f > i) return JSON.parse(limpo.slice(i, f + 1));
    throw new Error("Resposta da leitura não é JSON");
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

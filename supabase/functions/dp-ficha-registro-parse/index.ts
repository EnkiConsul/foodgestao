// Edge function: dp-ficha-registro-parse
// Lê um PDF de fichas de registro de empregado (um arquivo pode conter dezenas
// de fichas), extrai os campos de cada ficha com IA e grava um item por pessoa
// em dp_ficha_importacao_itens. Retorna 202 e processa em background.
//
// Body: { importacao_id: uuid }

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireCompanyAccess, requireUser } from "../_shared/authz.ts";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { z } from "npm:zod@3";

const BUCKET = "dp-bulk-import";
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.7-flash";
const PARALLELISM = 4;
const MAX_PAGES = 120;

const BodySchema = z.object({ importacao_id: z.string().uuid() });

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: any;

type PaginaLida = {
  pagina: number;
  nova_ficha: boolean;
  // deno-lint-ignore no-explicit-any
  dados: Record<string, any>;
  confianca: Record<string, string>;
  texto: string;
  erro?: string | null;
};

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

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${user.token}` } },
    });
    const svc = createClient(url, service);

    const { data: imp, error: impErr } = await userClient
      .from("dp_ficha_importacoes").select("*").eq("id", parsed.data.importacao_id).maybeSingle();
    if (impErr || !imp) return json({ error: "Importação não encontrada" }, 404);
    if (!(await requireCompanyAccess(user.id, String(imp.company_id)))) {
      return json({ error: "Sem permissão para esta operação." }, 403);
    }

    await svc.from("dp_ficha_importacoes")
      .update({ status: "processing", paginas_processadas: 0, erro_mensagem: null })
      .eq("id", imp.id);

    const worker = processarAsync({ svc, aiKey, imp });
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(worker);
    } else {
      worker.catch((e) => console.error("[dp-ficha-registro-parse] worker", e));
    }

    return json({ ok: true, importacao_id: imp.id, status: "processing" }, 202);
  } catch (e) {
    console.error("[dp-ficha-registro-parse] fatal:", e);
    return json({ error: "Não foi possível concluir a operação." }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function processarAsync({ svc, aiKey, imp }: { svc: any; aiKey: string; imp: any }) {
  const id = imp.id as string;
  try {
    const src = await svc.storage.from(BUCKET).download(imp.arquivo_path);
    if (src.error || !src.data) throw new Error(src.error?.message ?? "Falha ao baixar o PDF");
    const bytes = new Uint8Array(await src.data.arrayBuffer());

    let pdf: PDFDocument;
    try {
      pdf = await PDFDocument.load(bytes);
    } catch (e) {
      await svc.from("dp_ficha_importacoes")
        .update({ status: "failed", erro_mensagem: "PDF inválido: " + (e as Error).message })
        .eq("id", id);
      return;
    }

    const total = Math.min(pdf.getPageCount(), MAX_PAGES);
    await svc.from("dp_ficha_importacoes").update({ total_paginas: total }).eq("id", id);

    const paginas: PaginaLida[] = [];
    for (let start = 0; start < total; start += PARALLELISM) {
      const end = Math.min(start + PARALLELISM, total);
      const lote: Promise<PaginaLida>[] = [];
      for (let i = start; i < end; i++) lote.push(lerPagina({ aiKey, pdf, pageIndex: i }));
      const res = await Promise.all(lote);
      paginas.push(...res);
      await svc.from("dp_ficha_importacoes").update({ paginas_processadas: end }).eq("id", id);
    }

    // Agrupa páginas em fichas: página que abre uma nova pessoa inicia um item,
    // as seguintes complementam os campos que ficaram em branco.
    const fichas = agruparFichas(paginas);

    // Cadastro existente por CPF (para oferecer atualização em vez de duplicar)
    const { data: colabs } = await svc
      .from("dp_colaboradores").select("id, nome, cpf").eq("company_id", imp.company_id);
    const porCpf = new Map<string, { id: string; nome: string }>();
    for (const c of (colabs ?? []) as Array<{ id: string; nome: string; cpf: string | null }>) {
      if (c.cpf) porCpf.set(onlyDigits(c.cpf), { id: c.id, nome: c.nome });
    }

    if (fichas.length > 0) {
      const rows = fichas.map((f) => {
        const cpf = onlyDigits(String(f.dados.cpf ?? ""));
        const existente = cpf.length === 11 ? porCpf.get(cpf) : undefined;
        const semEssencial = !f.dados.nome || cpf.length !== 11;
        return {
          importacao_id: id,
          company_id: imp.company_id,
          pagina_inicio: f.pagina_inicio,
          pagina_fim: f.pagina_fim,
          nome_extraido: f.dados.nome ?? null,
          cpf_extraido: cpf || null,
          colaborador_existente_id: existente?.id ?? null,
          dados_extraidos: f.dados,
          confianca_campos: f.confianca,
          texto_origem: f.texto.slice(0, 12000),
          status: existente ? "duplicado" : semEssencial ? "revisar" : "pendente",
        };
      });
      const { error: insErr } = await svc.from("dp_ficha_importacao_itens").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    await svc.from("dp_ficha_importacoes").update({
      status: "ready",
      fichas_identificadas: fichas.length,
      paginas_processadas: total,
      concluido_em: new Date().toISOString(),
    }).eq("id", id);
  } catch (e) {
    console.error("[dp-ficha-registro-parse] erro", e);
    await svc.from("dp_ficha_importacoes")
      .update({ status: "failed", erro_mensagem: (e as Error).message })
      .eq("id", id);
  }
}

type Ficha = {
  pagina_inicio: number;
  pagina_fim: number;
  // deno-lint-ignore no-explicit-any
  dados: Record<string, any>;
  confianca: Record<string, string>;
  texto: string;
};

export function agruparFichas(paginas: PaginaLida[]): Ficha[] {
  const fichas: Ficha[] = [];
  const ordenadas = [...paginas].sort((a, b) => a.pagina - b.pagina);

  for (const p of ordenadas) {
    if (p.erro) continue;
    const temPessoa = !!(p.dados?.nome || p.dados?.cpf);
    const atual = fichas[fichas.length - 1];

    const mesmaPessoa =
      atual &&
      ((p.dados?.cpf && onlyDigits(String(p.dados.cpf)) === onlyDigits(String(atual.dados.cpf ?? ""))) ||
        (p.dados?.nome && normalize(String(p.dados.nome)) === normalize(String(atual.dados.nome ?? ""))));

    if (!atual || (p.nova_ficha && temPessoa && !mesmaPessoa)) {
      if (!temPessoa && !atual) continue; // página de capa/rodapé antes da 1ª ficha
      fichas.push({
        pagina_inicio: p.pagina,
        pagina_fim: p.pagina,
        dados: limpar(p.dados),
        confianca: p.confianca ?? {},
        texto: p.texto ?? "",
      });
      continue;
    }

    // Página de continuação: completa o que faltou, sem sobrescrever.
    atual.pagina_fim = p.pagina;
    atual.texto = `${atual.texto}\n${p.texto ?? ""}`;
    const novos = limpar(p.dados);
    for (const [k, v] of Object.entries(novos)) {
      const vazio = atual.dados[k] === null || atual.dados[k] === undefined ||
        (Array.isArray(atual.dados[k]) && atual.dados[k].length === 0) ||
        (typeof atual.dados[k] === "string" && atual.dados[k].trim() === "");
      if (vazio) {
        atual.dados[k] = v;
        if (p.confianca?.[k]) atual.confianca[k] = p.confianca[k];
      }
    }
  }

  return fichas;
}

// deno-lint-ignore no-explicit-any
function limpar(dados: Record<string, any> | null | undefined): Record<string, any> {
  // deno-lint-ignore no-explicit-any
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(dados ?? {})) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      const t = v.trim();
      if (!t || /^(n[aã]o informado|nao consta|-{1,})$/i.test(t)) continue;
      out[k] = t;
      continue;
    }
    out[k] = v;
  }
  return out;
}

const PROMPT = `Você lê FICHAS DE REGISTRO DE EMPREGADO brasileiras. Responda APENAS um JSON válido, sem texto ao redor, sem cercas de código.

Regras absolutas:
- NUNCA invente informação. Campo que não aparece na página deve ser null.
- Não confunda dados do EMPREGADOR (empresa, CNPJ, endereço da empresa) com dados do EMPREGADO. Só devolva dados do empregado.
- Datas no formato AAAA-MM-DD. Horas no formato HH:MM. Valores numéricos com ponto decimal (1750.00).

Formato:
{
  "nova_ficha": true|false,           // true se ESTA página inicia a ficha de uma pessoa (tem cabeçalho de ficha/registro com nome do empregado)
  "nome": null, "cpf": null, "matricula": null, "data_nascimento": null,
  "sexo": null,                        // "Masculino" ou "Feminino"
  "estado_civil": null, "telefone": null, "email": null,
  "nome_pai": null, "nome_mae": null, "nacionalidade": null, "naturalidade": null,
  "raca_cor": null, "grau_instrucao": null, "deficiencia": null,
  "rg_numero": null, "rg_orgao": null, "rg_uf": null, "rg_emissao": null,
  "ctps_numero": null, "ctps_serie": null, "ctps_uf": null, "ctps_expedicao": null,
  "titulo_eleitor": null, "titulo_zona": null, "titulo_secao": null,
  "reservista": null, "reservista_categoria": null,
  "pis_nit": null, "cnh_numero": null, "cnh_categoria": null, "cnh_validade": null,
  "endereco": { "logradouro": null, "numero": null, "bairro": null, "cidade": null, "uf": null, "cep": null, "texto": null },
  "cargo_nome": null, "cbo": null, "data_admissao": null,
  "salario": null, "salario_periodo": null,   // "Mensal", "Hora", etc.
  "sindicato": null,
  "jornada_texto": null,               // linha da escala/horário como está escrita, ex "08:00/12:00-14:00/18:00 44:00" ou "das 17:00 as 00:35"
  "jornada_dias": [                    // apenas se a página tiver tabela por dia da semana
    { "dia": "Dom", "tipo": "Trabalhado|Folga", "entrada": null, "intervalo_inicio": null, "intervalo_fim": null, "saida": null }
  ],
  "confianca": { "campo": "alta|media|baixa" }  // para CADA campo devolvido com valor
}`;

async function lerPagina(args: { aiKey: string; pdf: PDFDocument; pageIndex: number }): Promise<PaginaLida> {
  const { aiKey, pdf, pageIndex } = args;
  const pagina = pageIndex + 1;
  try {
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(pdf, [pageIndex]);
    single.addPage(copied);
    const b64 = base64Encode(await single.save());

    const raw = await chamarIa(aiKey, b64);
    const obj = parseJson(raw);
    const { nova_ficha, confianca, ...dados } = obj ?? {};
    return {
      pagina,
      nova_ficha: nova_ficha !== false,
      dados: dados ?? {},
      confianca: (confianca ?? {}) as Record<string, string>,
      texto: raw.slice(0, 12000),
    };
  } catch (e) {
    console.error(`[dp-ficha-registro-parse] página ${pagina}:`, e);
    return { pagina, nova_ficha: false, dados: {}, confianca: {}, texto: "", erro: (e as Error).message };
  }
}

async function chamarIa(apiKey: string, pdfB64: string): Promise<string> {
  const body = {
    model: MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: PROMPT },
        { type: "file", file: { filename: "pagina.pdf", file_data: `data:application/pdf;base64,${pdfB64}` } },
      ],
    }],
  };

  let ultimoErro = "";
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      const j = await r.json();
      return String(j?.choices?.[0]?.message?.content ?? "");
    }
    const texto = (await r.text()).slice(0, 300);
    ultimoErro = `HTTP ${r.status}: ${texto}`;
    if (r.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos para continuar a leitura.");
    if (r.status === 403) throw new Error("Leitura por IA bloqueada nas configurações da conta.");
    if (r.status !== 429 && r.status < 500) throw new Error(ultimoErro);
    const retryAfter = Number(r.headers.get("Retry-After") ?? 0);
    const espera = retryAfter > 0 ? retryAfter * 1000 : 1500 * (tentativa + 1) + Math.random() * 500;
    await new Promise((res) => setTimeout(res, espera));
  }
  throw new Error(ultimoErro || "Falha na leitura por IA");
}

// deno-lint-ignore no-explicit-any
function parseJson(raw: string): any {
  const limpo = raw.replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(limpo);
  } catch {
    const ini = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    if (ini >= 0 && fim > ini) return JSON.parse(limpo.slice(ini, fim + 1));
    throw new Error("Resposta da leitura não é JSON");
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function onlyDigits(s: string) { return (s ?? "").replace(/\D+/g, ""); }

function normalize(s: string) {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

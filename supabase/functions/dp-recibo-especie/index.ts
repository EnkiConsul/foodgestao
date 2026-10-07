/**
 * Recibo de pagamento em dinheiro (espécie), timbrado AVETO 360.
 *
 * Pagamento em espécie não se prova por extrato: a CLT (art. 464) exige recibo
 * assinado pelo empregado. Esta função monta o recibo do valor pago em dinheiro
 * a partir do documento já pago e tem dois caminhos:
 *
 *   • `registrar: false` — devolve o PDF para o gestor baixar, imprimir e
 *     colher a assinatura à mão (fluxo físico);
 *   • `registrar: true`  — guarda o recibo no acervo do colaborador exigindo
 *     aceite eletrônico no portal e o liga ao documento pago (fluxo digital).
 *
 * A permissão é a das telas: o registro e o vínculo passam pelas rotinas do
 * banco no contexto de quem pediu. Nada é gravado quando o documento não tem
 * parcela em dinheiro.
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";
import { z } from "npm:zod@3";
import { callerClient, requireUser, serviceClient } from "../_shared/authz.ts";
import { recordEdgeError } from "../_shared/error-log.ts";
import {
  MARCA_ASSINATURA,
  MARCA_LARANJA,
  MARCA_MARINHO,
  MARCA_PNG_BASE64,
} from "../_shared/marca-aveto.ts";
import { centsParaBRL, modalidadeLabel, valorPorExtenso } from "../_shared/quitacao.ts";

const MARINHO = rgb(MARCA_MARINHO[0], MARCA_MARINHO[1], MARCA_MARINHO[2]);
const LARANJA = rgb(MARCA_LARANJA[0], MARCA_LARANJA[1], MARCA_LARANJA[2]);
const CINZA = rgb(0.25, 0.25, 0.25);

const BUCKET = "dp-documentos";
const FUNCAO = "dp-recibo-especie";
const A4: [number, number] = [595.28, 841.89];

const Body = z.object({
  documento_id: z.string().uuid(),
  /** true guarda o recibo no acervo e pede assinatura no portal. */
  registrar: z.boolean().default(false),
});

function erro(status: number, mensagem: string): Response {
  return new Response(JSON.stringify({ error: mensagem }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function limpar(v: unknown): string {
  return String(v ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\xFF\n]/g, "");
}

function linhas(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const palavras = limpar(texto).split(/\s+/).filter(Boolean);
  const saida: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (fonte.widthOfTextAtSize(teste, tamanho) <= largura) atual = teste;
    else {
      if (atual) saida.push(atual);
      atual = p;
    }
  }
  if (atual) saida.push(atual);
  return saida.length ? saida : [""];
}

function dataBR(valor?: string | null): string {
  const v = String(valor ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "—";
  return v.split("-").reverse().join("/");
}

function competenciaBR(valor?: string | null): string {
  const v = String(valor ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "—";
  return new Date(`${v}T12:00:00Z`).toLocaleDateString("pt-BR", {
    month: "2-digit",
    year: "numeric",
  });
}

function cpfFormatado(cpf?: string | null): string {
  const d = String(cpf ?? "").replace(/\D+/g, "");
  if (d.length !== 11) return String(cpf ?? "—");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function cnpjFormatado(cnpj?: string | null): string {
  const d = String(cnpj ?? "").replace(/\D+/g, "");
  if (d.length !== 14) return String(cnpj ?? "—");
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

type Marca = { width: number; height: number } | null;

type Recibo = {
  empresa: string;
  empresaCnpj: string;
  colaborador: string;
  colaboradorCpf: string;
  matricula: string;
  documentoTitulo: string;
  competencia: string;
  pagoEm: string;
  modalidade: string;
  valorEspecieCents: number;
  valorBancarioCents: number | null;
  emitidoEm: string;
};

function timbrado(page: PDFPage, negrito: PDFFont, fonte: PDFFont, marca: Marca, titulo: string, empresa: string): number {
  const { width, height } = page.getSize();
  const margem = 48;
  const alturaLogo = 30;
  const baseLogo = height - 40 - alturaLogo;

  if (marca) {
    const escala = alturaLogo / marca.height;
    page.drawImage(marca as never, {
      x: margem, y: baseLogo, width: marca.width * escala, height: alturaLogo,
    });
  } else {
    page.drawText("AVETO 360", { x: margem, y: baseLogo + 8, size: 17, font: negrito, color: MARINHO });
  }

  const origem = "Plataforma AVETO 360";
  page.drawText(origem, {
    x: width - margem - negrito.widthOfTextAtSize(origem, 9),
    y: baseLogo + alturaLogo - 11, size: 9, font: negrito, color: MARINHO,
  });
  const sub = limpar(empresa).slice(0, 60);
  if (sub) {
    page.drawText(sub, {
      x: width - margem - fonte.widthOfTextAtSize(sub, 8),
      y: baseLogo + 1, size: 8, font: fonte, color: rgb(0.42, 0.45, 0.52),
    });
  }

  const linha = baseLogo - 14;
  page.drawRectangle({ x: margem, y: linha, width: width - margem * 2, height: 2, color: LARANJA });
  page.drawText(limpar(titulo), { x: margem, y: linha - 22, size: 13.5, font: negrito, color: MARINHO });
  return height - (linha - 22) + 10;
}

async function montarPdf(r: Recibo): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);

  let marca: Marca = null;
  try {
    const bruto = atob(MARCA_PNG_BASE64);
    const bytes = new Uint8Array(bruto.length);
    for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
    const img = await pdf.embedPng(bytes);
    marca = img as unknown as Marca;
    if (!marca?.width || !marca?.height) marca = null;
  } catch {
    marca = null;
  }

  const page = pdf.addPage(A4);
  const { width, height } = page.getSize();
  const margem = 48;
  const largura = width - margem * 2;
  const usado = timbrado(page, negrito, fonte, marca, "Recibo de Pagamento em Dinheiro", r.empresa);
  let y = height - usado - 24;

  const valor = centsParaBRL(r.valorEspecieCents);
  const extenso = valorPorExtenso(r.valorEspecieCents);

  page.drawRectangle({ x: margem, y: y - 34, width: largura, height: 44, color: rgb(0.96, 0.97, 0.99) });
  page.drawText("VALOR RECEBIDO EM DINHEIRO", {
    x: margem + 12, y: y - 2, size: 7.5, font: negrito, color: rgb(0.42, 0.42, 0.42),
  });
  page.drawText(limpar(valor), {
    x: margem + 12, y: y - 26, size: 20, font: negrito, color: MARINHO,
  });
  y -= 56;

  const campos: Array<[string, string]> = [
    ["Empregador", `${r.empresa} — CNPJ ${r.empresaCnpj}`],
    ["Colaborador", `${r.colaborador} — CPF ${r.colaboradorCpf}`],
    ["Matrícula", r.matricula],
    ["Documento pago", r.documentoTitulo],
    ["Competência", r.competencia],
    ["Data do pagamento", r.pagoEm],
    ["Forma de pagamento", modalidadeLabel(r.modalidade)],
  ];
  if (r.valorBancarioCents) {
    campos.push(["Parcela paga em conta (Pix/Transferência)", centsParaBRL(r.valorBancarioCents)]);
  }
  campos.push(["Valor em dinheiro por extenso", extenso]);

  for (const [rotulo, texto] of campos) {
    page.drawText(limpar(rotulo).toUpperCase(), {
      x: margem, y, size: 7.5, font: negrito, color: rgb(0.42, 0.42, 0.42),
    });
    y -= 12;
    for (const l of linhas(texto || "—", fonte, 10.5, largura)) {
      page.drawText(l, { x: margem, y, size: 10.5, font: fonte, color: rgb(0.07, 0.07, 0.07) });
      y -= 13;
    }
    y -= 6;
  }

  y -= 6;
  const declaracao =
    `Declaro ter recebido do empregador acima identificado, em dinheiro (espécie), a quantia de ${valor} ` +
    `(${extenso}), referente a ${r.documentoTitulo} da competência ${r.competencia}, paga em ${r.pagoEm}, ` +
    "dando plena e geral quitação do valor aqui discriminado, nos termos do artigo 464 da Consolidação das " +
    "Leis do Trabalho. Este recibo pode ser assinado eletronicamente no portal do colaborador, com registro " +
    "de data, hora, endereço de internet e dispositivo, ou de forma manuscrita no documento impresso.";
  for (const l of linhas(declaracao, fonte, 10, largura)) {
    page.drawText(l, { x: margem, y, size: 10, font: fonte, color: CINZA });
    y -= 13.5;
  }

  y -= 42;
  page.drawLine({
    start: { x: margem, y }, end: { x: margem + 260, y },
    thickness: 0.8, color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText(limpar(r.colaborador), { x: margem, y: y - 13, size: 9.5, font: negrito, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`CPF ${limpar(r.colaboradorCpf)}`, {
    x: margem, y: y - 25, size: 8.5, font: fonte, color: rgb(0.45, 0.45, 0.45),
  });
  page.drawText("Assinatura do colaborador", {
    x: margem, y: y - 38, size: 8.5, font: fonte, color: rgb(0.45, 0.45, 0.45),
  });

  // Rodapé de lastro da marca.
  page.drawRectangle({ x: margem, y: 38.4, width: 54, height: 1.6, color: LARANJA });
  page.drawText(limpar(`${r.empresa} · ${r.colaborador} · Recibo de pagamento em dinheiro`).slice(0, 130), {
    x: margem, y: 26, size: 6.5, font: fonte, color: rgb(0.4, 0.4, 0.4),
  });
  page.drawText(limpar(`Emitido em ${r.emitidoEm}`), {
    x: margem, y: 16, size: 6.5, font: fonte, color: rgb(0.4, 0.4, 0.4),
  });
  page.drawText(limpar(MARCA_ASSINATURA), { x: margem, y: 6, size: 6.5, font: fonte, color: MARINHO });

  return await pdf.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return erro(405, "Método inválido.");

  let documentoId = "";
  try {
    const caller = await requireUser(req);
    if (!caller) return erro(401, "Sessão expirada. Entre novamente.");

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return erro(400, "Documento inválido.");
    documentoId = parsed.data.documento_id;
    const registrar = parsed.data.registrar;

    // Permissão: a leitura roda no contexto de quem pediu (RLS das telas).
    const cliente = callerClient(caller.token);
    const { data: visivel } = await cliente
      .from("dp_documentos")
      .select(
        "id, company_id, colaborador_id, titulo, referencia_data, comprovante_pago_em, comprovante_modalidade, comprovante_valor_bancario_cents, comprovante_valor_especie_cents, comprovante_recibo_documento_id",
      )
      .eq("id", documentoId)
      .maybeSingle();
    if (!visivel) return erro(403, "Sem permissão para este documento.");

    const especie = Number(visivel.comprovante_valor_especie_cents ?? 0);
    if (!especie || especie <= 0) {
      return erro(409, "Este pagamento não tem parcela em dinheiro para emitir recibo.");
    }

    const admin = serviceClient();
    const [{ data: empresa }, { data: colab }] = await Promise.all([
      admin.from("companies").select("name, trade_name, cnpj").eq("id", visivel.company_id).maybeSingle(),
      visivel.colaborador_id
        ? admin
          .from("dp_colaboradores")
          .select("nome, nome_social, cpf, matricula")
          .eq("id", visivel.colaborador_id)
          .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const recibo: Recibo = {
      empresa: String(empresa?.name ?? empresa?.trade_name ?? ""),
      empresaCnpj: cnpjFormatado(empresa?.cnpj as string | null),
      colaborador: String(colab?.nome_social || colab?.nome || ""),
      colaboradorCpf: cpfFormatado(colab?.cpf as string | null),
      matricula: String(colab?.matricula ?? "—"),
      documentoTitulo: String(visivel.titulo ?? ""),
      competencia: competenciaBR(visivel.referencia_data as string | null),
      pagoEm: dataBR(visivel.comprovante_pago_em as string | null),
      modalidade: String(visivel.comprovante_modalidade ?? "especie"),
      valorEspecieCents: especie,
      valorBancarioCents: (visivel.comprovante_valor_bancario_cents as number | null) ?? null,
      emitidoEm: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    };

    const bytes = await montarPdf(recibo);

    // Fluxo físico: só devolve o arquivo para imprimir e assinar à mão.
    if (!registrar) {
      return new Response(bytes as unknown as BodyInit, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="recibo-pagamento-dinheiro.pdf"',
          "Cache-Control": "no-store",
        },
      });
    }

    if (!visivel.colaborador_id) {
      return erro(409, "O documento não tem colaborador vinculado para assinar o recibo.");
    }

    const nomeArquivo = `recibo-dinheiro-${String(visivel.referencia_data ?? "").slice(0, 7) || "sem-competencia"}.pdf`;
    const caminho = `${visivel.company_id}/${visivel.colaborador_id}/recibos/${Date.now()}-${nomeArquivo}`;
    const envio = await admin.storage.from(BUCKET).upload(caminho, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (envio.error) throw envio.error;

    // Registro e vínculo passam pelas rotinas do banco, no contexto do gestor.
    const { data: novoId, error: erroRegistro } = await cliente.rpc("dp_documento_registrar", {
      p_dados: {
        company_id: visivel.company_id,
        colaborador_id: visivel.colaborador_id,
        tipo: "recibo_pagamento_especie",
        titulo: `Recibo de Pagamento em Dinheiro — ${recibo.documentoTitulo}`,
        descricao: `Quitação de ${centsParaBRL(especie)} em dinheiro, pago em ${recibo.pagoEm}.`,
        file_path: caminho,
        file_name: nomeArquivo,
        file_size: bytes.byteLength,
        mime_type: "application/pdf",
        referencia_data: visivel.referencia_data,
        exige_aceite: true,
      },
    });
    if (erroRegistro || !novoId) {
      await admin.storage.from(BUCKET).remove([caminho]);
      return erro(400, erroRegistro?.message ?? "O recibo não pôde ser registrado.");
    }

    const { error: erroVinculo } = await cliente.rpc("dp_comprovante_recibo_vincular", {
      p_documento_id: documentoId,
      p_recibo_id: String(novoId),
    });
    if (erroVinculo) return erro(400, erroVinculo.message);

    return new Response(JSON.stringify({ recibo_documento_id: String(novoId) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await recordEdgeError({
      functionName: FUNCAO,
      action: "emitir recibo de pagamento em dinheiro",
      error: e,
      details: { documento_id: documentoId },
    });
    return erro(500, "Não foi possível emitir o recibo agora.");
  }
});
